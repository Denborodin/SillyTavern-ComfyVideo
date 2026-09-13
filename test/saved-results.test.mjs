import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultStore } from '../lib/saved-results.js';

test('saved results survive an attachment failure and reload until attached', async () => {
    let settings = {};
    let persisted;
    const store = createResultStore({ getSettings: () => settings,
        saveSettings: () => { persisted = structuredClone(settings); },
        saveFile: async () => '/user/images/completed.mp4', newId: () => 'result-1' });
    const entry = await store.save({ data: 'base64', format: 'mp4' }, { chatId: 'original', prompt: 'Motion' });
    // A chat switch blocks attachment; simulate reloading persisted settings.
    settings = persisted;
    assert.equal(settings.savedResults[0].url, '/user/images/completed.mp4');
    assert.equal(settings.savedResults[0].prompt, 'Motion');
    store.attached(entry);
    assert.deepEqual(settings.savedResults, []);
});
