import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { findLastRoleplayMessage, messageSignature, isComfyVideoMessage } from '../lib/scene-context.js';

const source = fs.readFileSync(new URL('../lib/media.js', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace(/^export \{[^\n]+\n/gm, '')
    .replaceAll('export ', '');

for (const reload of [true, false]) {
    test(`inserting after #26 preserves order and saves chat (reload=${reload})`, async () => {
        const chat = Array.from({ length: 29 }, (_, i) => ({ mes: `Message ${i}` }));
        const reference = chat[26];
        const previousLast = chat[28];
        let saved = 0;
        let reloaded = 0;
        const context = { chat, name2: 'Character', saveChat: async () => { saved++; }, addOneMessage() {} };
        if (reload) context.reloadCurrentChat = async () => { reloaded++; };
        const sandbox = vm.createContext({
            MEDIA_DISPLAY: { GALLERY: 'gallery' }, MEDIA_SOURCE: { GENERATED: 'generated' },
            MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video' }, VIDEO_EXTENSIONS: ['mp4'],
            findLastRoleplayMessage, messageSignature, detectComfyVideoMessage: isComfyVideoMessage,
            document: { getElementById: () => null }, requestAnimationFrame: fn => fn(), setTimeout() {},
        });
        vm.runInContext(source, sandbox);
        const result = await sandbox.attachGeneratedMedia({
            context, attachMode: 'after', insertAfterMessage: reference,
            sourceMessageSignature: messageSignature(reference), url: '/user/result.mp4', format: 'mp4',
            prompt: 'Motion', meta: {}, eventSource: { emit: async () => {} }, event_types: {},
            getMessageTimeStamp: () => 'now',
        });
        assert.equal(result.messageId, 27);
        assert.equal(chat[26], reference);
        assert.equal(chat[27], result.message);
        assert.equal(chat[29], previousLast);
        assert.equal(chat[27].extra.media[0].type, 'video');
        assert.equal(saved, 1);
        assert.equal(reloaded, reload ? 1 : 0);
    });
}
