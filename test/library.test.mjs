import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureLibraries } from '../lib/library.js';

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
