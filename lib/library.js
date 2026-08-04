/**
 * Named libraries for workflows and LLM instruction prompts.
 */

import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
} from './defaults.js';

/**
 * @returns {string}
 */
export function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @typedef {{ id: string, name: string, json?: string, template?: string }} LibraryItem
 */

/**
 * Ensure libraries object and seed defaults / migrate legacy single fields.
 * @param {object} st extension_settings.ComfyVideo
 */
export function ensureLibraries(st) {
    if (!st.libraries || typeof st.libraries !== 'object') {
        st.libraries = {};
    }
    const L = st.libraries;
    if (!Array.isArray(L.imageWorkflows)) L.imageWorkflows = [];
    if (!Array.isArray(L.i2vWorkflows)) L.i2vWorkflows = [];
    if (!Array.isArray(L.imagePrompts)) L.imagePrompts = [];
    if (!Array.isArray(L.motionPrompts)) L.motionPrompts = [];

    st.activeImageWorkflowId = st.activeImageWorkflowId || '';
    st.activeI2vWorkflowId = st.activeI2vWorkflowId || '';
    st.activeImagePromptId = st.activeImagePromptId || '';
    st.activeMotionPromptId = st.activeMotionPromptId || '';

    // Seed image prompt presets
    if (L.imagePrompts.length === 0) {
        const id = newId();
        L.imagePrompts.push({
            id,
            name: 'Z-Image – RP scene',
            template: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        });
        if (!st.imagePromptTemplate?.trim()) {
            st.imagePromptTemplate = DEFAULT_IMAGE_PROMPT_TEMPLATE;
        }
        st.activeImagePromptId = id;
    }

    // Seed motion prompt presets
    if (L.motionPrompts.length === 0) {
        const id = newId();
        L.motionPrompts.push({
            id,
            name: 'MiniMax H3 – I2V motion',
            template: DEFAULT_MOTION_PROMPT_TEMPLATE,
        });
        if (!st.motionPromptTemplate?.trim()) {
            st.motionPromptTemplate = DEFAULT_MOTION_PROMPT_TEMPLATE;
        }
        st.activeMotionPromptId = id;
    }

    // Migrate existing workflow strings into libraries once
    if (L.imageWorkflows.length === 0 && st.imageWorkflow?.trim()) {
        const id = newId();
        L.imageWorkflows.push({
            id,
            name: 'Current image workflow',
            json: st.imageWorkflow,
        });
        st.activeImageWorkflowId = id;
    }
    if (L.i2vWorkflows.length === 0 && st.i2vWorkflow?.trim()) {
        const id = newId();
        L.i2vWorkflows.push({
            id,
            name: 'Current I2V workflow',
            json: st.i2vWorkflow,
        });
        st.activeI2vWorkflowId = id;
    }

    // If active content empty but library has selection, load it
    syncActiveFromLibrary(st, 'imageWorkflows', 'activeImageWorkflowId', 'imageWorkflow', 'json');
    syncActiveFromLibrary(st, 'i2vWorkflows', 'activeI2vWorkflowId', 'i2vWorkflow', 'json');
    syncActiveFromLibrary(st, 'imagePrompts', 'activeImagePromptId', 'imagePromptTemplate', 'template');
    syncActiveFromLibrary(st, 'motionPrompts', 'activeMotionPromptId', 'motionPromptTemplate', 'template');
}

/**
 * @param {object} st
 * @param {string} listKey
 * @param {string} activeIdKey
 * @param {string} fieldKey
 * @param {'json'|'template'} contentKey
 */
function syncActiveFromLibrary(st, listKey, activeIdKey, fieldKey, contentKey) {
    if (st[fieldKey]?.trim()) return;
    const id = st[activeIdKey];
    if (!id) return;
    const item = st.libraries[listKey]?.find(x => x.id === id);
    if (item?.[contentKey]) {
        st[fieldKey] = item[contentKey];
    }
}

/**
 * @param {LibraryItem[]} list
 * @param {string} id
 */
export function findItem(list, id) {
    return list.find(x => x.id === id) || null;
}

/**
 * @param {LibraryItem[]} list
 * @param {string} id
 * @param {string} content
 * @param {'json'|'template'} contentKey
 */
export function overwriteItem(list, id, content, contentKey) {
    const item = findItem(list, id);
    if (!item) return false;
    item[contentKey] = content;
    return true;
}

/**
 * @param {LibraryItem[]} list
 * @param {string} name
 * @param {string} content
 * @param {'json'|'template'} contentKey
 */
export function addItem(list, name, content, contentKey) {
    const item = { id: newId(), name: name.trim() || 'Untitled', [contentKey]: content };
    list.push(item);
    return item;
}

/**
 * @param {LibraryItem[]} list
 * @param {string} id
 */
export function removeItem(list, id) {
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
}

/**
 * Export libraries + actives for backup.
 * @param {object} st
 */
export function exportLibrariesBlob(st) {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        libraries: st.libraries,
        activeImageWorkflowId: st.activeImageWorkflowId,
        activeI2vWorkflowId: st.activeI2vWorkflowId,
        activeImagePromptId: st.activeImagePromptId,
        activeMotionPromptId: st.activeMotionPromptId,
        imageWorkflow: st.imageWorkflow,
        i2vWorkflow: st.i2vWorkflow,
        imagePromptTemplate: st.imagePromptTemplate,
        motionPromptTemplate: st.motionPromptTemplate,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/**
 * Merge import into settings (does not wipe unless replace=true).
 * @param {object} st
 * @param {object} data
 * @param {boolean} [replace]
 */
export function importLibraries(st, data, replace = false) {
    if (!data?.libraries) throw new Error('Invalid library file');
    ensureLibraries(st);
    const keys = ['imageWorkflows', 'i2vWorkflows', 'imagePrompts', 'motionPrompts'];
    for (const k of keys) {
        const incoming = data.libraries[k];
        if (!Array.isArray(incoming)) continue;
        if (replace) {
            st.libraries[k] = structuredClone(incoming);
        } else {
            for (const item of incoming) {
                if (!item?.id) item.id = newId();
                // re-id if collision
                if (st.libraries[k].some(x => x.id === item.id)) {
                    item.id = newId();
                }
                st.libraries[k].push(item);
            }
        }
    }
}
