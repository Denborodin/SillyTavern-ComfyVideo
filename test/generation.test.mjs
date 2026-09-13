import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as defaults from '../lib/defaults.js';
import * as library from '../lib/library.js';
import * as workflow from '../lib/workflow.js';
import * as scene from '../lib/scene-context.js';
import * as media from '../lib/media-source.js';
import { createResultStore } from '../lib/saved-results.js';
import { isAbortError } from '../lib/status-ui.js';

// Execute the real entry-point orchestration with host, LLM and GPU boundaries mocked.
const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replaceAll('import.meta.url', "'http://localhost/scripts/extensions/third-party/ComfyVideo/index.js'");
const imageWorkflow = JSON.stringify({ n: { class_type: 'Test', inputs: { prompt: '%prompt%', width: '%width%', height: '%height%' } } });

function setup({ regen = false, switchChat = false, changeSettings = false, failAttach = false, insertEarlier = false } = {}) {
    const chat = Array.from({ length: 29 }, (_, i) => ({ name: 'A', mes: `Message ${i}` }));
    const recipe = { imagePrompt: 'OLD PROMPT', imageWorkflow: imageWorkflow.replace('Test', 'Old'),
        imagePromptKind: 'scene', width: 512, height: 512 };
    chat[26].extra = { comfyVideo: recipe, media_index: 0,
        media: [{ type: 'image', url: '/user/old.png', comfyVideo: recipe }] };
    let ctx = { chat, name2: 'A', characterId: 0, getCurrentChatId: () => 'original' };
    const st = { enabled: true, imageWorkflow, i2vWorkflow: imageWorkflow, resolution: 'landscape',
        imageQuality: 'high', confirmImagePrompt: false, confirmMotionPrompt: false,
        attachImageMode: 'new', imagePromptTemplate: 'CUSTOM TEMPLATE', frames: 124, fps: 24 };
    library.ensureLibraries(st);
    const selected = library.addItem(st.libraries.imagePrompts, 'Custom portrait', 'CUSTOM TEMPLATE', 'template');
    selected.promptKind = 'portrait';
    st.activeImagePromptId = selected.id;
    st.imagePromptTemplate = selected.template;
    const calls = { attachments: [], files: [], prompts: [], requests: [], statuses: [], errors: [] };
    const runState = vm.createContext({
        ...defaults, ...library, ...workflow, ...scene, ...media, createResultStore, isAbortError,
        structuredClone, URL, DOMException, AbortController, setTimeout, clearTimeout,
        newClientId: () => 'test-id',
        extension_settings: { ComfyVideo: st },
        getContext: () => ctx,
        saveSettingsDebounced() {}, jQuery() {},
        document: { getElementById: () => null, querySelectorAll: () => [] },
        toastr: { warning() {}, info() {}, success() {}, error: message => calls.errors.push(message) },
        isVideoFormat: format => format === 'mp4',
        console,
        humanizedDateTime: () => 'now', getMessageTimeStamp: () => 'now', systemUserName: 'System',
        eventSource: {}, event_types: {}, appendMediaToMessage() {},
        showStatus: options => {
            calls.statuses.push(options);
            const control = new AbortController();
            return { signal: control.signal, aborted: false, close() {}, setMessage() {}, setProgress() {}, watchComfy() {} };
        },
        saveBase64AsFile: async (...args) => { calls.files.push(args); return '/user/saved.png'; },
        attachGeneratedMedia: async opts => { calls.attachments.push(opts); if (failAttach) throw new Error('Save failed'); },
    });
    vm.runInContext(source, runState);
    runState.mockPrompts = {
        getCastParticipants: () => [],
        buildImagePrompt: async settings => { calls.prompts.push(settings); return 'NEW PROMPT'; },
        buildMotionPrompt: async settings => { calls.prompts.push(settings); return 'MOTION'; },
    };
    runState.mockComfy = {
        fetchImageBlob: async () => new Blob(), uploadImage: async () => ({ name: 'input.png' }),
        generate: async (url, body) => {
            calls.requests.push(JSON.parse(body));
            if (changeSettings) { st.imageQuality = 'ultra'; st.frames = 243; st.imageWorkflow = 'CHANGED'; }
            if (insertEarlier) chat.splice(2, 0, { name: 'A', mes: 'Inserted earlier' });
            if (switchChat) ctx = { ...ctx, chat: [], getCurrentChatId: () => 'other' };
            return { format: 'png', data: 'BASE64' };
        },
    };
    vm.runInContext('comfy = mockComfy; prompts = mockPrompts;', runState);
    const checked = async operation => { await operation(); assert.deepEqual(calls.errors, []); };
    return { st, chat, calls, generateImage: () => checked(() => runState.generateSceneImage('portrait', {
        targetMessage: chat[26], sourceMessageId: 26,
        regenerationMedia: regen ? { comfyVideo: recipe } : null,
    })), generateGlobal: () => checked(() => runState.generateSceneImage('scene')),
    generateVideo: () => checked(() => runState.generateVideoForMessage(26)) };
}

test('fresh quickbar generation uses current settings and inserts after its reference', async () => {
    const h = setup({ changeSettings: true });
    await h.generateImage();
    const request = h.calls.requests[0].prompt.n;
    assert.equal(request.class_type, 'Test');
    assert.equal(request.inputs.width, 1728);
    assert.equal(h.calls.prompts[0].imagePromptTemplate, 'CUSTOM TEMPLATE');
    assert.equal(h.calls.attachments[0].attachMode, 'after');
    assert.equal(h.calls.attachments[0].insertAfterMessage, h.chat[26]);
    assert.equal(h.calls.attachments[0].meta.width, 1728);
    assert.equal(h.st.imagePromptTemplate, 'CUSTOM TEMPLATE');
    assert.equal(h.st.savedResults.length, 0);
    assert.ok(h.calls.statuses.every(status => !status.onStop), 'no backend interrupt while prompting');
});

test('Quick Regen replays the image recipe and appends in its gallery', async () => {
    const h = setup({ regen: true });
    await h.generateImage();
    assert.equal(h.calls.prompts.length, 0);
    assert.equal(h.calls.requests[0].prompt.n.class_type, 'Old');
    assert.equal(h.calls.requests[0].prompt.n.inputs.width, 512);
    assert.equal(h.calls.attachments[0].attachMode, 'same');
});

test('global image generation appends at the end', async () => {
    const h = setup();
    await h.generateGlobal();
    assert.equal(h.calls.attachments[0].attachMode, 'new');
    assert.equal(h.calls.attachments[0].insertAfterMessage, h.chat[28]);
});

test('source metadata follows insertions during generation', async () => {
    const h = setup({ insertEarlier: true });
    const reference = h.chat[26];
    await h.generateImage();
    assert.equal(h.calls.attachments[0].insertAfterMessage, reference);
    assert.equal(h.calls.attachments[0].meta.sourceMessageId, 27);
});

test('video keeps snapshotted timing and inserts after the selected image', async () => {
    const h = setup({ changeSettings: true });
    await h.generateVideo();
    assert.equal(h.calls.attachments[0].attachMode, 'after');
    assert.equal(h.calls.attachments[0].meta.frames, 124);
    assert.equal(h.st.frames, 243);
});

for (const kind of ['Image', 'Video']) {
    test(`${kind} output is recoverable after chat switch`, async () => {
        const h = setup({ switchChat: true });
        await h[`generate${kind}`]();
        assert.equal(h.calls.files.length, 1);
        assert.equal(h.calls.attachments.length, 0);
        assert.equal(h.st.savedResults[0].url, '/user/saved.png');
        assert.equal(h.st.savedResults[0].chatId, 'original');
    });
}

test('failed chat persistence retains the recovery link', async () => {
    const h = setup({ failAttach: true });
    await h.generateImage();
    assert.equal(h.st.savedResults.length, 1);
});
