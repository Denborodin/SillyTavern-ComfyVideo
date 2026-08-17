/**
 * Versioned, user-editable ComfyUI workflow defaults.
 */

import { newId } from './library.js';

/** Previous official defaults that may be replaced once by a newer `default` bundle. */
const PREVIOUS_BUNDLED_DEFAULTS = {
    image: [],
    i2v: ['builtin.video.minimax-h3-i2v'],
};

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
    if (!settings.installedBundledWorkflowVersions || typeof settings.installedBundledWorkflowVersions !== 'object') {
        settings.installedBundledWorkflowVersions = {};
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
        list.push(entry);
        settings.installedBundledWorkflowVersions[item.id] = Math.max(installedVersion, Number(item.version) || 1);
        if (!settings[activeKey]) {
            settings[activeKey] = entry.id;
            settings[fieldKey] = entry.json;
        }
        added++;
    }

    const activated = applyPreferredBundledDefaults(settings, bundled);
    return { added, changed: added > 0 || activated };
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
