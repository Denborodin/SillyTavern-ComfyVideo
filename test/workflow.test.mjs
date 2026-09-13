import test from 'node:test';
import assert from 'node:assert/strict';
import { fillPlaceholders } from '../lib/workflow.js';

test('placeholder replacement preserves quotes, newlines, types and literal tokens', () => {
    const nodes = { n: { inputs: { text: 'Scene: %prompt%', exact: '%prompt%', seed: '%seed%',
        nested: ['%width%', '%unknown%'], enabled: true } } };
    const prompt = 'She says "hello"\nC:\\room %seed%';
    const output = JSON.parse(fillPlaceholders(nodes, { prompt, seed: 42, width: 864 }));
    assert.equal(output.n.inputs.text, `Scene: ${prompt}`);
    assert.equal(output.n.inputs.exact, prompt);
    assert.equal(output.n.inputs.seed, 42);
    assert.deepEqual(output.n.inputs.nested, [864, '%unknown%']);
    assert.equal(nodes.n.inputs.seed, '%seed%');
});
