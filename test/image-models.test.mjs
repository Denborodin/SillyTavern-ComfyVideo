import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkflowImageProfile, resolveImageProfile } from '../lib/image-models.js';
import { resolveImageDimensions } from '../lib/workflow.js';
import { createPromptBuilder } from '../lib/prompt-builder.js';
import { ensureLibraries, exportLibrariesBlob, importLibraries } from '../lib/library.js';

test('explicit model profile survives library export/import and overrides bundle metadata', async () => {
    const st = { libraries: { imageWorkflows: [{ id: 'wf', name: 'Custom', json: '{}', imageProfile: 'moss' }] }, activeImageWorkflowId: 'wf' };
    ensureLibraries(st);
    const imported = {};
    importLibraries(imported, JSON.parse(await exportLibrariesBlob(st).text()));
    assert.equal(resolveImageProfile(imported), 'moss');
    assert.equal(getWorkflowImageProfile({ imageProfile: 'generic', source: { bundledId: 'builtin.image.krea-2-turbo' } }), 'generic');
    assert.equal(getWorkflowImageProfile({ name: 'Krea 2', json: '{"unet_name":"krea2_turbo.safetensors"}' }), 'generic');
});

test('model sizes stay aligned, rotate with orientation, and keep MOSS below 2 MP', () => {
    for (const profile of ['zit', 'moss', 'krea']) {
        let area = 0;
        for (const size of ['compatible', 'high', 'ultra']) {
            const portrait = resolveImageDimensions('portrait', size, profile);
            const landscape = resolveImageDimensions('landscape', size, profile);
            assert.equal(portrait.width % 16, 0);
            assert.equal(portrait.height % 16, 0);
            assert.equal(portrait.width * 4, portrait.height * 3);
            assert.equal(landscape.width, portrait.height);
            assert.equal(landscape.height, portrait.width);
            assert.ok(portrait.width * portrait.height > area);
            area = portrait.width * portrait.height;
            if (profile === 'moss') assert.ok(area >= 950000 && area <= 2000000);
        }
    }
    assert.equal(resolveImageDimensions('landscape', 'high', 'zit').width, 1152);
    assert.equal(resolveImageDimensions('landscape', 'high', 'generic').width, 1728);
});

test('both LLM transports receive selected model, actual canvas and custom style before generation', async () => {
    for (const promptMode of ['profile', 'quiet']) {
        for (const imageProfile of ['zit', 'moss', 'krea']) {
            let request;
            const builder = createPromptBuilder({
                getContext: () => ({ chat: [{ name: 'A', mes: 'A person waits beside a window.' }] }),
                sendCurrentPrompt: async data => { request = data.messages; return 'Finished caption'; },
                ConnectionManagerRequestService: { sendRequest: async (_id, messages) => { request = messages; return 'Finished caption'; } },
            });
            const caption = await builder.buildImagePrompt({ promptMode, llmProfileId: 'profile-id',
                contextMessages: 1, imagePromptTemplate: 'Keep the subject and composition.',
                imageStylePreset: 'custom', customImageStyle: 'Blue woodcut with broad ink contours.',
            }, { imageProfile, dimensions: { width: 1200, height: 1600 } });
            assert.equal(caption, 'Finished caption');
            assert.match(request[0].content, /Blue woodcut with broad ink contours/);
            assert.match(request[0].content, /1200 x 1600 pixels, portrait/);
            assert.match(request[0].content, /replacing conflicting medium/);
            assert.match(request[1].content, /A person waits beside a window/);
            assert.match(request[0].content, { zit: /Target model: Z-Image Turbo/, moss: /Target model: MOSS-Image SFT/, krea: /Target model: Krea 2 Turbo/ }[imageProfile]);
        }
    }
});
