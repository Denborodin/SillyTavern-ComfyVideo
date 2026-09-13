import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureLibraries, addItem, resolveImagePromptVariant, removeItem } from '../lib/library.js';

test('library migration does not overwrite user-edited image presets', () => {
    const imagePrompts = ['scene', 'portrait', 'interaction', 'environment'].map((promptKind, index) => ({
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
