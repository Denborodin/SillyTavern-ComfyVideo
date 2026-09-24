import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPanel } from '../lib/panel.js';

test('global panel clears the message target while message actions retain #0 and #26', async t => {
    // Minimal DOM surface for opening the real panel and invoking its image action.
    let generate;
    const callbacks = {};
    const markup = readFileSync(new URL('../panel.html', import.meta.url), 'utf8');
    const kinds = [...markup.matchAll(/data-prompt-kind="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(kinds, ['scene', 'portrait', 'interaction', 'full_body']);
    const buttons = kinds.map(kind => ({
        getAttribute: () => kind,
        addEventListener: (type, callback) => {
            if (type === 'click') {
                callbacks[kind] = callback;
                if (kind === 'scene') generate = callback;
            }
        },
    }));
    const overlay = {
        querySelector: () => null,
        querySelectorAll: selector => selector === '.cv_image_action_btn[data-prompt-kind]' ? buttons : [],
        addEventListener() {},
        classList: { add() {}, remove() {} },
        remove() {},
    };
    const originals = { document: globalThis.document, fetch: globalThis.fetch };
    t.after(() => {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    });
    globalThis.document = {
        body: { contains: () => true, appendChild() {} },
        createElement: () => ({ firstElementChild: overlay }),
        addEventListener() {},
        removeEventListener() {},
    };
    globalThis.fetch = async () => ({ text: async () => '<div></div>' });
    let chat = Array.from({ length: 29 }, (_, id) => ({ mes: `Message ${id}` }));
    let result;
    let resultKind;
    let castTarget;
    const panel = createPanel({
        getContext: () => ({ chat }),
        getSettings: () => ({ frames: 124, fps: 24 }),
        getCastParticipants: target => { castTarget = target; return []; },
        getMessageImageUrl: () => null,
        generateSceneImage: async (kind, options) => { result = options; resultKind = kind; },
    });

    for (const id of [0, 26]) {
        await panel.open({ targetMessage: chat[id], sourceMessageId: id });
        await generate();
        assert.equal(result.targetMessage, chat[id]);
        assert.equal(result.sourceMessageId, id);
        assert.equal(castTarget, chat[id]);

        await panel.open();
        await generate();
        assert.equal(result.targetMessage, null);
        assert.equal(result.sourceMessageId, null);
        assert.equal(castTarget, null);
    }
    for (const kind of ['portrait', 'full_body']) {
        await panel.open({ targetMessage: chat[26], sourceMessageId: 26 });
        await callbacks[kind]();
        assert.equal(resultKind, kind);
        assert.equal(result.targetMessage, chat[26]);
        assert.equal(result.sourceMessageId, 26);
    }
    const selected = chat[26];
    await panel.open({ targetMessage: selected, sourceMessageId: 26 });
    chat.splice(2, 0, { mes: 'Inserted' });
    await generate();
    assert.equal(result.targetMessage, selected);
    assert.equal(result.sourceMessageId, 27);

    await panel.open({ targetMessage: selected, sourceMessageId: 27 });
    chat = Array.from({ length: 30 }, (_, id) => ({ mes: `Other chat ${id}` }));
    result = null;
    await generate();
    assert.equal(result, null, 'must reject a chat switch');

    await panel.open({ targetMessage: chat[26], sourceMessageId: 26 });
    chat.splice(26, 1);
    await generate();
    assert.equal(result, null, 'must reject a deleted reference');
    panel.destroy();
});
