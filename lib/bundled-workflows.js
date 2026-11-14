/**
 * Versioned, user-editable ComfyUI workflow defaults.
 */

import { newId } from './library.js';
import { getWorkflowImageProfile } from './image-models.js';

/** Previous official defaults that may be replaced once by a newer `default` bundle. */
const PREVIOUS_BUNDLED_DEFAULTS = {
    image: [],
    i2v: ['builtin.video.minimax-h3-i2v'],
};

// Match the shipped v1 graph exactly, ignoring JSON formatting and key order.
// Imported, renamed, and edited workflows remain owned by the user.
const RETIRED_IMAGE_WORKFLOW = {
    id: 'builtin.image.flux-2-klein-9b',
    version: 1,
    name: 'FLUX.2 Klein 9B',
    fingerprint: '1758:117f10cc',
};

function workflowFingerprint(json) {
    try {
        const text = JSON.stringify(JSON.parse(json), (_key, value) =>
            value && typeof value === 'object' && !Array.isArray(value)
                ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
                : value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `${text.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
    } catch {
        return '';
    }
}

function removeRetiredBundledWorkflows(settings) {
    const list = settings.libraries.imageWorkflows;
    if (!Array.isArray(list)) return false;
    const retired = RETIRED_IMAGE_WORKFLOW;
    const removedIds = new Set(list.filter(entry =>
        entry?.source?.type === 'bundled'
        && entry.source.bundledId === retired.id
        && Number(entry.source.bundledVersion) === retired.version
        && entry.name === retired.name
        && workflowFingerprint(entry.json) === retired.fingerprint
        && (entry.id !== settings.activeImageWorkflowId || !settings.imageWorkflow
            || workflowFingerprint(settings.imageWorkflow) === retired.fingerprint)
    ).map(entry => entry.id));
    if (!removedIds.size) return false;

    settings.libraries.imageWorkflows = list.filter(entry => !removedIds.has(entry?.id));
    if (removedIds.has(settings.activeImageWorkflowId)) {
        const fallback = settings.libraries.imageWorkflows[0];
        settings.activeImageWorkflowId = fallback?.id || '';
        settings.imageWorkflow = fallback?.json || '';
    }
    return true;
}

function upgradeImageWorkflows(settings, bundled) {
    const replacement = bundled.find(item => item.id === 'builtin.image.z-image-turbo' && item.version === 2);
    if (!replacement) return false;
    let changed = false;
    const candidates = (settings.libraries.imageWorkflows || []).filter(entry => {
        // The first single-workflow setting was migrated without bundle metadata.
        const legacy = !entry.source && entry.name === 'Current image workflow';
        const previous = entry.source?.bundledId === replacement.id && Number(entry.source.bundledVersion) === 1
            && entry.name === 'Z-Image Turbo';
        if ((!legacy && !previous) || workflowFingerprint(entry.json) !== '1860:4d7e42bf') return false;
        if (entry.id === settings.activeImageWorkflowId && settings.imageWorkflow
            && workflowFingerprint(settings.imageWorkflow) !== '1860:4d7e42bf') return false;
        return true;
    });
    // Early installs contain both the original single setting and its identical
    // bundled copy. Keep the selected ID when collapsing that untouched pair.
    if (candidates.length > 1 && candidates.some(entry => !entry.source)) {
        const keep = candidates.find(entry => entry.id === settings.activeImageWorkflowId)
            || candidates.find(entry => entry.source) || candidates[0];
        const duplicates = new Set(candidates.filter(entry => entry !== keep));
        settings.libraries.imageWorkflows = settings.libraries.imageWorkflows.filter(entry => !duplicates.has(entry));
        candidates.splice(0, candidates.length, keep);
        changed = true;
    }
    for (const entry of candidates) {
        entry.json = replacement.json;
        entry.name = replacement.name;
        entry.source = { type: 'bundled', bundledId: replacement.id, bundledVersion: replacement.version };
        entry.imageProfile ??= replacement.imageProfile;
        if (entry.id === settings.activeImageWorkflowId) settings.imageWorkflow = entry.json;
        settings.installedBundledWorkflowVersions[replacement.id] = replacement.version;
        changed = true;
    }
    return changed;
}

/**
 * @param {string} extName
 * @returns {Promise<Array<{id:string,version:number,name:string,kind:string,json:string}>>}
 */
export async function loadBundledWorkflows(extName) {
    const base = `/scripts/extensions/third-party/${extName}/workflows`;
    const manifestResponse = await fetch(`${base}/manifest.json`);
    if (!manifestResponse.ok) throw new Error('Could not load bundled workflow manifest.');
    const manifest = await manifestResponse.json();
    if (!Array.isArray(manifest?.workflows)) throw new Error('Bundled workflow manifest is invalid.');

    return Promise.all(manifest.workflows.map(async item => {
        const response = await fetch(`${base}/${item.file}`);
        if (!response.ok) throw new Error(`Could not load bundled workflow: ${item.name || item.id}`);
        const json = await response.text();
        JSON.parse(json);
        return { ...item, json };
    }));
}

/**
 * Seed only versions that have not been installed. Restoring adds deleted
 * entries explicitly, without replacing an existing editable copy.
 * @param {object} settings
 * @param {Array<{id:string,version:number,name:string,kind:string,json:string}>} bundled
 * @param {boolean} [restore]
 * @returns {{ added: number, changed: boolean }}
 */
export function seedBundledWorkflows(settings, bundled, restore = false) {
    if (!settings.libraries || typeof settings.libraries !== 'object') {
        return { added: 0, changed: false };
    }
    const retired = removeRetiredBundledWorkflows(settings);
    if (!settings.installedBundledWorkflowVersions || typeof settings.installedBundledWorkflowVersions !== 'object') {
        settings.installedBundledWorkflowVersions = {};
    }
    const upgraded = upgradeImageWorkflows(settings, bundled);
    let profiled = false;
    for (const entry of settings.libraries.imageWorkflows || []) {
        const profile = getWorkflowImageProfile(entry);
        if (entry.imageProfile == null && profile !== 'generic') {
            entry.imageProfile = profile;
            profiled = true;
        }
    }

    let added = 0;
    for (const item of bundled) {
        const listKey = item.kind === 'i2v' ? 'i2vWorkflows' : 'imageWorkflows';
        const activeKey = item.kind === 'i2v' ? 'activeI2vWorkflowId' : 'activeImageWorkflowId';
        const fieldKey = item.kind === 'i2v' ? 'i2vWorkflow' : 'imageWorkflow';
        const list = settings.libraries[listKey];
        if (!Array.isArray(list)) continue;

        const installedVersion = Number(settings.installedBundledWorkflowVersions[item.id] || 0);
        const existing = list.find(entry => entry?.source?.bundledId === item.id
            && Number(entry.source.bundledVersion) === Number(item.version));
        const shouldAdd = restore ? !existing : Number(item.version) > installedVersion;
        if (!shouldAdd) continue;

        const name = existing ? `${item.name} v${item.version}` : item.name;
        const entry = {
            id: newId(),
            name,
            json: item.json,
            source: { type: 'bundled', bundledId: item.id, bundledVersion: item.version },
        };
        if (item.kind === 'image') entry.imageProfile = item.imageProfile || 'generic';
        list.push(entry);
        settings.installedBundledWorkflowVersions[item.id] = Math.max(installedVersion, Number(item.version) || 1);
        if (!settings[activeKey]) {
            settings[activeKey] = entry.id;
            settings[fieldKey] = entry.json;
        }
        added++;
    }

    const activated = applyPreferredBundledDefaults(settings, bundled);
    return { added, changed: added > 0 || activated || retired || upgraded || profiled };
}

/**
 * Adopt a manifest `default` workflow once. Custom or later user selections
 * are left alone after the new default has been recorded.
 * @param {object} settings
 * @param {Array<{id:string,kind:string,default?:boolean}>} bundled
 * @returns {boolean}
 */
function applyPreferredBundledDefaults(settings, bundled) {
    if (!settings.appliedBundledDefaults || typeof settings.appliedBundledDefaults !== 'object') {
        settings.appliedBundledDefaults = {};
    }

    let changed = false;
    for (const kind of ['image', 'i2v']) {
        const preferred = bundled.find(item => item.kind === kind && item.default);
        if (!preferred) continue;
        if (settings.appliedBundledDefaults[kind] === preferred.id) continue;

        const listKey = kind === 'i2v' ? 'i2vWorkflows' : 'imageWorkflows';
        const activeKey = kind === 'i2v' ? 'activeI2vWorkflowId' : 'activeImageWorkflowId';
        const fieldKey = kind === 'i2v' ? 'i2vWorkflow' : 'imageWorkflow';
        const list = settings.libraries[listKey];
        if (!Array.isArray(list)) continue;

        const preferredEntry = list.find(entry => entry?.source?.bundledId === preferred.id);
        if (!preferredEntry) continue;

        const active = list.find(entry => entry?.id === settings[activeKey]);
        const onPreviousDefault = !!active
            && active.source?.type === 'bundled'
            && PREVIOUS_BUNDLED_DEFAULTS[kind].includes(active.source.bundledId);
        const eligible = !settings[activeKey] || !active || onPreviousDefault;

        if (eligible && settings[activeKey] !== preferredEntry.id) {
            settings[activeKey] = preferredEntry.id;
            settings[fieldKey] = preferredEntry.json;
        }
        settings.appliedBundledDefaults[kind] = preferred.id;
        changed = true;
    }
    return changed;
}
