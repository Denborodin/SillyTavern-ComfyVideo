import test from 'node:test';
import assert from 'node:assert/strict';

import { getMessageImageSource } from '../lib/media-source.js';

test('selected still supplies its own URL, dimensions, prompt and index', () => {
    const message = {
        extra: {
            media_index: 0,
            comfyVideo: { imagePrompt: 'message fallback', width: 512, height: 512 },
            media: [
                { url: '/first.png', type: 'image', comfyVideo: { imagePrompt: 'first', width: 864, height: 1152 } },
                { url: '/second.png', type: 'image', comfyVideo: { imagePrompt: 'second', width: 1152, height: 864 } },
            ],
        },
    };
    const source = getMessageImageSource(message);
    assert.equal(source.url, '/first.png');
    assert.equal(source.mediaIndex, 0);
    assert.equal(source.meta.imagePrompt, 'first');
    assert.deepEqual([source.meta.width, source.meta.height], [864, 1152]);
});

test('a selected video falls back to the latest still, never the video', () => {
    const message = {
        extra: {
            media_index: 2,
            media: [
                { url: '/first.png', type: 'image' },
                { url: '/second.png', type: 'image', comfyVideo: { imagePrompt: 'second' } },
                { url: '/clip.mp4', type: 'video' },
            ],
        },
    };
    const source = getMessageImageSource(message);
    assert.equal(source.url, '/second.png');
    assert.equal(source.mediaIndex, 1);
});

test('legacy single-image messages remain usable', () => {
    const source = getMessageImageSource({
        extra: { image: '/legacy.png', comfyVideo: { imagePrompt: 'legacy' } },
    });
    assert.equal(source.url, '/legacy.png');
    assert.equal(source.mediaIndex, -1);
    assert.equal(source.meta.imagePrompt, 'legacy');
});
