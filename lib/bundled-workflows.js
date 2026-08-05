/**
 * Versioned, user-editable ComfyUI workflow defaults.
 */

import { newId } from './library.js';

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
 * @returns {number}
 */
export function seedBundledWorkflows(settings, bundled, restore = false) {
    if (!settings.libraries || typeof settings.libraries !== 'object') return 0;
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
    return added;
}
