import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedBundledWorkflows } from '../lib/bundled-workflows.js';
import { fillPlaceholders, parseWorkflow, validateWorkflow } from '../lib/workflow.js';

const manifest = JSON.parse(readFileSync(new URL('../workflows/manifest.json', import.meta.url), 'utf8'));
const bundled = manifest.workflows.map(item => ({ ...item,
    json: readFileSync(new URL(`../workflows/${item.file}`, import.meta.url), 'utf8') }));
const turbo = bundled.find(item => item.id === 'builtin.video.minimax-h3-i2v-turbo');
const retiredFlux = {
    id: 'retired-flux', name: 'FLUX.2 Klein 9B',
    json: readFileSync(new URL('./fixtures/retired-flux-2-klein-9b.json', import.meta.url), 'utf8'),
    source: { type: 'bundled', bundledId: 'builtin.image.flux-2-klein-9b', bundledVersion: 1 },
};

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

test('retired FLUX default is removed from saved libraries and cannot be restored', () => {
    const st = { libraries: { imageWorkflows: [], i2vWorkflows: [] } };
    seedBundledWorkflows(st, bundled);
    const videoBefore = structuredClone(st.libraries.i2vWorkflows);
    const selectionBefore = [st.activeImageWorkflowId, st.imageWorkflow, st.activeI2vWorkflowId, st.i2vWorkflow];
    // Saved JSON may have been pretty-printed or had its node keys reordered.
    const graph = JSON.parse(retiredFlux.json);
    const reformatted = JSON.stringify(Object.fromEntries(Object.entries(graph).reverse()), null, 4);
    st.libraries.imageWorkflows.push({ ...retiredFlux, json: reformatted });
    st.installedBundledWorkflowVersions[retiredFlux.source.bundledId] = 1;
    assert.deepEqual(seedBundledWorkflows(st, bundled), { added: 0, changed: true });
    assert.equal(st.libraries.imageWorkflows.some(entry => entry.id === retiredFlux.id), false);
    assert.deepEqual(st.libraries.i2vWorkflows, videoBefore);
    assert.deepEqual([st.activeImageWorkflowId, st.imageWorkflow, st.activeI2vWorkflowId, st.i2vWorkflow], selectionBefore);
    const reloaded = JSON.parse(JSON.stringify(st));
    assert.deepEqual(seedBundledWorkflows(reloaded, bundled, true), { added: 0, changed: false });
    assert.equal(reloaded.libraries.imageWorkflows.some(entry => entry.source?.bundledId === retiredFlux.source.bundledId), false);
});

test('retirement preserves edited, renamed, imported, and newer FLUX copies', () => {
    const graph = JSON.parse(retiredFlux.json);
    graph['8'].inputs.steps = 8;
    const entries = [
        { ...retiredFlux, id: 'edited', json: JSON.stringify(graph) },
        { ...retiredFlux, id: 'renamed', name: 'My FLUX' },
        { ...retiredFlux, id: 'imported', source: undefined },
        { ...retiredFlux, id: 'newer', source: { ...retiredFlux.source, bundledVersion: 2 } },
        { ...retiredFlux, id: 'invalid', json: '{unfinished edit' },
    ];
    const st = { libraries: { imageWorkflows: structuredClone(entries), i2vWorkflows: [] } };
    seedBundledWorkflows(st, bundled);
    assert.deepEqual(st.libraries.imageWorkflows.slice(0, entries.length), entries);
});

test('retiring the active default selects an available image workflow and persists it', () => {
    const st = { libraries: { imageWorkflows: [structuredClone(retiredFlux)], i2vWorkflows: [] },
        activeImageWorkflowId: retiredFlux.id, imageWorkflow: retiredFlux.json };
    seedBundledWorkflows(st, bundled);
    const active = st.libraries.imageWorkflows.find(entry => entry.id === st.activeImageWorkflowId);
    assert.ok(active);
    assert.notEqual(active.id, retiredFlux.id);
    assert.equal(st.imageWorkflow, active.json);
    const reloaded = JSON.parse(JSON.stringify(st));
    seedBundledWorkflows(reloaded, bundled);
    assert.equal(reloaded.activeImageWorkflowId, active.id);
    assert.equal(reloaded.imageWorkflow, active.json);
});

test('retirement preserves active workflow edits not yet copied into the library', () => {
    const st = { libraries: { imageWorkflows: [structuredClone(retiredFlux)], i2vWorkflows: [] },
        activeImageWorkflowId: retiredFlux.id, imageWorkflow: '{editing in progress' };
    seedBundledWorkflows(st, bundled);
    assert.deepEqual(st.libraries.imageWorkflows[0], retiredFlux);
    assert.equal(st.activeImageWorkflowId, retiredFlux.id);
    assert.equal(st.imageWorkflow, '{editing in progress');
});

const zit = bundled.find(item => item.id === 'builtin.image.z-image-turbo');
const zitV1 = readFileSync(new URL('./fixtures/z-image-turbo-v1.json', import.meta.url), 'utf8');

test('ZIT uses one guided-positive pass with only the selected seed and no custom nodes', () => {
    const nodes = parseWorkflow(zit.json);
    const samplers = Object.values(nodes).filter(node => /Sampler/.test(node.class_type));
    assert.equal(samplers.length, 1);
    assert.equal(samplers[0].class_type, 'KSampler');
    assert.equal(samplers[0].inputs.steps, 8);
    assert.equal(samplers[0].inputs.cfg, 1);
    assert.equal(samplers[0].inputs.sampler_name, 'res_multistep');
    assert.equal(samplers[0].inputs.scheduler, 'simple');
    assert.equal(nodes[samplers[0].inputs.model[0]].inputs.shift, 3);
    assert.equal(nodes[samplers[0].inputs.negative[0]].class_type, 'ConditioningZeroOut');
    assert.ok(Object.values(nodes).every(node => node.class_type !== 'easy int'));
    for (const seed of [42, 98765]) {
        const filled = JSON.parse(fillPlaceholders(zit.json, { prompt: 'A person', seed, width: 864, height: 1152 }));
        assert.equal(Object.values(filled).find(node => node.class_type === 'KSampler').inputs.seed, seed);
    }
});

test('standard Krea is available alongside the unchanged KNP configuration', () => {
    const standard = parseWorkflow(bundled.find(item => item.id === 'builtin.image.krea-2-turbo-standard').json);
    const knp = parseWorkflow(bundled.find(item => item.id === 'builtin.image.krea-2-turbo').json);
    assert.ok(Object.values(standard).every(node => !/Lora/.test(node.class_type)));
    const sampler = Object.values(standard).find(node => node.class_type === 'KSampler');
    assert.equal(sampler.inputs.steps, 8);
    assert.equal(sampler.inputs.cfg, 1);
    assert.equal(sampler.inputs.sampler_name, 'euler');
    assert.equal(knp['30:3'].inputs.steps, 12);
    assert.equal(knp['30:31'].inputs.lora_name, 'KNPV4.1_pre.safetensors');
    assert.equal(knp['30:31'].inputs.strength_model, 1);
});

test('untouched ZIT v1 and the legacy single workflow upgrade without changing selection', () => {
    for (const legacy of [false, true]) {
        const entry = { id: 'old-zit', name: legacy ? 'Current image workflow' : 'Z-Image Turbo', json: zitV1,
            ...(legacy ? {} : { source: { type: 'bundled', bundledId: zit.id, bundledVersion: 1 } }) };
        const st = { libraries: { imageWorkflows: [entry], i2vWorkflows: [] }, activeImageWorkflowId: entry.id,
            imageWorkflow: zitV1, installedBundledWorkflowVersions: { [zit.id]: 1 } };
        seedBundledWorkflows(st, [zit]);
        assert.equal(st.libraries.imageWorkflows.length, 1);
        assert.equal(st.activeImageWorkflowId, entry.id);
        assert.equal(st.imageWorkflow, zit.json);
        assert.equal(entry.imageProfile, 'zit');
        const reloaded = JSON.parse(JSON.stringify(st));
        assert.deepEqual(seedBundledWorkflows(reloaded, [zit]), { added: 0, changed: false });
    }
});

test('edited, renamed and unsaved ZIT v1 copies remain selected when v2 is added', () => {
    for (const change of ['graph', 'name', 'unsaved']) {
        const graph = JSON.parse(zitV1);
        if (change === 'graph') graph['29'].inputs.steps = 20;
        const entry = { id: 'custom-zit', name: change === 'name' ? 'My ZIT' : 'Z-Image Turbo',
            json: JSON.stringify(graph), source: { type: 'bundled', bundledId: zit.id, bundledVersion: 1 } };
        const activeJson = change === 'unsaved' ? '{unfinished edit' : entry.json;
        const st = { libraries: { imageWorkflows: [structuredClone(entry)], i2vWorkflows: [] },
            activeImageWorkflowId: entry.id, imageWorkflow: activeJson,
            installedBundledWorkflowVersions: { [zit.id]: 1 } };
        seedBundledWorkflows(st, [zit]);
        assert.equal(st.libraries.imageWorkflows[0].json, entry.json);
        assert.equal(st.libraries.imageWorkflows[0].name, entry.name);
        assert.equal(st.imageWorkflow, activeJson);
        assert.equal(st.activeImageWorkflowId, entry.id);
        assert.equal(st.libraries.imageWorkflows[1].json, zit.json);
    }
});

test('the untouched legacy and bundled ZIT pair becomes one entry, keeping the active ID', () => {
    for (const activeId of ['legacy', 'bundle']) {
        const st = { libraries: { imageWorkflows: [
            { id: 'legacy', name: 'Current image workflow', json: zitV1 },
            { id: 'bundle', name: 'Z-Image Turbo', json: zitV1,
                source: { type: 'bundled', bundledId: zit.id, bundledVersion: 1 } },
        ], i2vWorkflows: [] }, activeImageWorkflowId: activeId, imageWorkflow: zitV1 };
        seedBundledWorkflows(st, [zit]);
        assert.equal(st.libraries.imageWorkflows.length, 1);
        assert.equal(st.libraries.imageWorkflows[0].id, activeId);
        assert.equal(st.activeImageWorkflowId, activeId);
        assert.equal(st.imageWorkflow, zit.json);
    }
});
