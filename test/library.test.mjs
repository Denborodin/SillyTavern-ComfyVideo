import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureLibraries, addItem, resolveImagePromptVariant, removeItem } from '../lib/library.js';
import { CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE, FULL_BODY_PORTRAIT_IMAGE_PROMPT_TEMPLATE } from '../lib/defaults.js';

test('library migration does not overwrite user-edited image presets', () => {
    const imagePrompts = ['scene', 'portrait', 'full_body', 'interaction', 'environment'].map((promptKind, index) => ({
        id: `custom-${index}`,
        name: `My ${promptKind}`,
        promptKind,
        template: `CUSTOM ${promptKind} INSTRUCTIONS`,
    }));
    const settings = {
        libraries: {
            imagePrompts,
            motionPrompts: [],
            imageWorkflows: [],
            i2vWorkflows: [],
        },
        activeImagePromptId: 'custom-0',
        imagePromptTemplate: 'CUSTOM scene INSTRUCTIONS',
        motionPromptTemplate: '',
        imageWorkflow: '',
        i2vWorkflow: '',
    };

    ensureLibraries(settings);

    for (const preset of imagePrompts) {
        assert.equal(preset.template, `CUSTOM ${preset.promptKind} INSTRUCTIONS`);
    }
    assert.equal(settings.imagePromptTemplate, 'CUSTOM scene INSTRUCTIONS');
});

test('custom instructions containing old default phrases are preserved', () => {
    const st = {};
    ensureLibraries(st);
    st.imagePromptTemplate = 'My custom prompt. Prioritize, in order: faces, lights.';
    st.motionPromptTemplate = 'My custom motion. No hard cuts, no new characters, no scene changes.';
    const before = [st.imagePromptTemplate, st.motionPromptTemplate];
    ensureLibraries(st);
    assert.deepEqual([st.imagePromptTemplate, st.motionPromptTemplate], before);
});

test('Save-as selection overrides built-ins and retains current edits', () => {
    const st = {};
    ensureLibraries(st);
    const custom = addItem(st.libraries.imagePrompts, 'My scene', 'SAVED', 'template');
    st.activeImagePromptId = custom.id;
    st.imagePromptTemplate = 'LATEST EDIT';
    assert.equal(resolveImagePromptVariant(st, 'scene').template, 'LATEST EDIT');
    custom.promptKind = 'scene';
    assert.equal(resolveImagePromptVariant(st, 'scene').id, custom.id);
    assert.equal(resolveImagePromptVariant(st, 'portrait').kind, 'portrait');
    assert.notEqual(resolveImagePromptVariant(st, 'portrait').template, 'LATEST EDIT');
});

test('cleared workflow content stays deleted across migration', () => {
    const st = { imageWorkflow: '{"custom":true}' };
    ensureLibraries(st);
    removeItem(st.libraries.imageWorkflows, st.activeImageWorkflowId);
    st.activeImageWorkflowId = '';
    st.imageWorkflow = '';
    ensureLibraries(st);
    assert.equal(st.libraries.imageWorkflows.length, 0);
});

test('portrait framing variants are distinct, persist on reload, and preserve legacy environment', () => {
    const st = {};
    ensureLibraries(st);
    const fullBody = resolveImagePromptVariant(st, 'full_body');
    assert.equal(fullBody.template, FULL_BODY_PORTRAIT_IMAGE_PROMPT_TEMPLATE);
    assert.match(fullBody.template, /head-to-toe portrait/);
    assert.match(fullBody.template, /ground below the feet/);
    assert.match(resolveImagePromptVariant(st, 'portrait').template, /Use chest-up portrait framing/);
    assert.notEqual(fullBody.id, resolveImagePromptVariant(st, 'portrait').id);
    const reloaded = JSON.parse(JSON.stringify(st));
    ensureLibraries(reloaded);
    assert.equal(resolveImagePromptVariant(reloaded, 'full_body').id, fullBody.id);
    assert.equal(reloaded.libraries.imagePrompts.filter(p => p.promptKind === 'full_body').length, 1);
    assert.equal(resolveImagePromptVariant(reloaded, 'environment').kind, 'environment');
});

test('only untouched previous portrait instructions upgrade to chest-up framing', () => {
    const oldTemplate = CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE.replace(
        /^- Use chest-up portrait framing:.*$/m,
        '- Choose a coherent portrait framing: close-up, head-and-shoulders, waist-up, or three-quarter portrait. Default to eye level with a normal-to-short-telephoto lens feel around 70-105mm and enough camera distance for natural facial and body proportions. Do not crop through important hands or props.');
    for (const custom of [false, true]) {
        const template = oldTemplate + (custom ? '\nMy custom framing.' : '');
        const st = { libraries: { imagePrompts: [{ id: 'old', name: 'Renamed portrait', promptKind: 'portrait', template }] },
            activeImagePromptId: 'old', imagePromptTemplate: template };
        ensureLibraries(st);
        const expected = custom ? template : CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE;
        assert.equal(st.imagePromptTemplate, expected);
        assert.equal(resolveImagePromptVariant(st, 'portrait').template, expected);
    }
});
