import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedBundledWorkflows } from '../lib/bundled-workflows.js';
import { fillPlaceholders, parseWorkflow, validateWorkflow } from '../lib/workflow.js';

const manifest = JSON.parse(readFileSync(new URL('../workflows/manifest.json', import.meta.url), 'utf8'));
const bundled = manifest.workflows.map(item => ({ ...item,
    json: readFileSync(new URL(`../workflows/${item.file}`, import.meta.url), 'utf8') }));
const turbo = bundled.find(item => item.id === 'builtin.video.minimax-h3-i2v-turbo');

test('all bundled workflows have valid links and their declared placeholders', () => {
    for (const item of bundled) {
        const nodes = parseWorkflow(item.json);
        assert.deepEqual(validateWorkflow(nodes, item.kind), []);
        for (const placeholder of item.requiredPlaceholders) assert.ok(item.json.includes(placeholder), `${item.name}: ${placeholder}`);
        for (const node of Object.values(nodes)) {
            for (const value of Object.values(node.inputs)) {
                if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1])) {
                    assert.ok(nodes[value[0]], `${item.name}: missing node ${value[0]}`);
                }
            }
        }
    }
});

test('Turbo A preserves SLA attention, direct first frame, sampling and audio output', () => {
    const nodes = parseWorkflow(turbo.json);
    assert.equal(turbo.version, 2);
    assert.equal(nodes['8'].class_type, 'H3SLAAttention');
    assert.deepEqual(nodes['8'].inputs, { model: ['7', 0], sparsity_ratio: 0.9, block_size: '64',
        min_seq_len: 8192, dense_last_steps: 0, protect_audio: true, enabled: true });
    assert.deepEqual(nodes['9'].inputs.model, ['8', 0]);
    assert.deepEqual(nodes['16'].inputs.model, ['8', 0]);
    assert.deepEqual(nodes['104'].inputs.first_frame, ['1', 0]);
    assert.equal(nodes['105'], undefined);
    assert.equal(nodes['9'].inputs.steps, 8);
    assert.equal(nodes['9'].inputs.scheduler, 'simple');
    assert.equal(nodes['17'].class_type, 'MiniMaxH3TurboSampler');
    assert.deepEqual(nodes['91'].inputs.audio, ['23', 0]);
    assert.equal(nodes['92'].inputs.format, 'mp4');
    assert.equal(nodes['92'].inputs.codec, 'h264');
});

test('Turbo A accepts runtime values without retaining the sample prompt or fixed dimensions', () => {
    const prompt = 'A "quoted" action.\nLiteral %seed% stays in the prompt.';
    for (const [width, height] of [[864, 1152], [1152, 864]]) {
        const filled = JSON.parse(fillPlaceholders(turbo.json, { image: 'uploaded/source.png', prompt,
            width, height, frames: 124, fps: 24, seed: 42, negative_prompt: '' }));
        assert.equal(filled['1'].inputs.image, 'uploaded/source.png');
        assert.equal(filled['104'].inputs.prompt, prompt);
        assert.equal(filled['104'].inputs.width, width);
        assert.equal(filled['104'].inputs.height, height);
        assert.equal(filled['104'].inputs.length, 124);
        assert.equal(filled['15'].inputs.noise_seed, 42);
        assert.equal(filled['91'].inputs.fps, 24);
    }
});

test('Turbo A seeds once without overwriting or selecting an older edited Turbo entry', () => {
    const old = { id: 'older', name: 'My edited Turbo', json: '{"edited":true}',
        source: { type: 'bundled', bundledId: turbo.id, bundledVersion: 1 } };
    const st = { libraries: { imageWorkflows: [], i2vWorkflows: [structuredClone(old)] },
        activeI2vWorkflowId: old.id, i2vWorkflow: old.json,
        installedBundledWorkflowVersions: { [turbo.id]: 1 }, appliedBundledDefaults: { i2v: turbo.id } };
    assert.equal(seedBundledWorkflows(st, [turbo]).added, 1);
    assert.deepEqual(st.libraries.i2vWorkflows[0], old);
    assert.equal(st.activeI2vWorkflowId, old.id);
    assert.equal(st.i2vWorkflow, old.json);
    assert.equal(st.libraries.i2vWorkflows[1].json, turbo.json);
    assert.equal(st.libraries.i2vWorkflows[1].name, turbo.name);
    const reloaded = JSON.parse(JSON.stringify(st));
    assert.equal(seedBundledWorkflows(reloaded, [turbo]).added, 0);
    reloaded.libraries.i2vWorkflows.pop();
    assert.equal(seedBundledWorkflows(reloaded, [turbo]).added, 0);
    assert.equal(seedBundledWorkflows(reloaded, [turbo], true).added, 1);
    assert.deepEqual(reloaded.libraries.i2vWorkflows[0], old);
});

test('fresh installs select Turbo A as the bundled video default', () => {
    const st = { libraries: { imageWorkflows: [], i2vWorkflows: [] } };
    seedBundledWorkflows(st, bundled);
    assert.equal(st.i2vWorkflow, turbo.json);
    assert.equal(st.libraries.i2vWorkflows.find(item => item.id === st.activeI2vWorkflowId).source.bundledVersion, 2);
});
