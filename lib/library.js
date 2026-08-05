/**
 * Named libraries for workflows and LLM instruction prompts.
 */

import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
    TIMED_ACTION_MOTION_PROMPT_TEMPLATE,
    IMAGE_PROMPT_PRESET_NAME,
    MOTION_PROMPT_PRESET_NAME,
    TIMED_ACTION_MOTION_PRESET_NAME,
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

    // Seed / upgrade detailed RP image prompt preset
    let imagePreset = L.imagePrompts.find(p => p.name === IMAGE_PROMPT_PRESET_NAME);
    if (!imagePreset) {
        // Also upgrade legacy short preset name if present
        imagePreset = {
            id: newId(),
            name: IMAGE_PROMPT_PRESET_NAME,
            template: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        };
        L.imagePrompts.unshift(imagePreset);
    }

    if (L.imagePrompts.length === 0) {
        L.imagePrompts.push(imagePreset);
    }

    if (!st.imagePromptTemplate?.trim()
        || st.imagePromptTemplate.includes('Prioritize, in order:')
        || st.imagePromptTemplate.includes('not a static visual novel')) {
        // Empty or known-old short default → use full guidelines
        st.imagePromptTemplate = DEFAULT_IMAGE_PROMPT_TEMPLATE;
        st.activeImagePromptId = imagePreset.id;
    }
    if (!st.activeImagePromptId) {
        st.activeImagePromptId = imagePreset.id;
    }

    // Seed / upgrade detailed I2V motion prompt preset
    let motionPreset = L.motionPrompts.find(p => p.name === MOTION_PROMPT_PRESET_NAME);
    if (!motionPreset) {
        motionPreset = {
            id: newId(),
            name: MOTION_PROMPT_PRESET_NAME,
            template: DEFAULT_MOTION_PROMPT_TEMPLATE,
        };
        L.motionPrompts.unshift(motionPreset);
    }

    if (L.motionPrompts.length === 0) {
        L.motionPrompts.push(motionPreset);
    }

    if (!st.motionPromptTemplate?.trim()
        || st.motionPromptTemplate.includes('Write about one clear line')
        || st.motionPromptTemplate.includes('No hard cuts, no new characters, no scene changes.')) {
        st.motionPromptTemplate = DEFAULT_MOTION_PROMPT_TEMPLATE;
        st.activeMotionPromptId = motionPreset.id;
    }
    if (!st.activeMotionPromptId) {
        st.activeMotionPromptId = motionPreset.id;
    }

    let timedMotionPreset = L.motionPrompts.find(p => p.name === TIMED_ACTION_MOTION_PRESET_NAME);
    if (!timedMotionPreset) {
        timedMotionPreset = {
            id: newId(),
            name: TIMED_ACTION_MOTION_PRESET_NAME,
            template: TIMED_ACTION_MOTION_PROMPT_TEMPLATE,
        };
        L.motionPrompts.unshift(timedMotionPreset);
    }
    const activeMotionPreset = L.motionPrompts.find(p => p.id === st.activeMotionPromptId);
    if (activeMotionPreset?.name === MOTION_PROMPT_PRESET_NAME
        && activeMotionPreset.template === DEFAULT_MOTION_PROMPT_TEMPLATE) {
        st.activeMotionPromptId = timedMotionPreset.id;
        st.motionPromptTemplate = timedMotionPreset.template;
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
        imageStylePreset: st.imageStylePreset,
        customImageStyle: st.customImageStyle,
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
    const importedIds = new Map();
    for (const k of keys) {
        const incoming = data.libraries[k];
        if (!Array.isArray(incoming)) continue;
        if (replace) {
            st.libraries[k] = structuredClone(incoming);
            for (const item of st.libraries[k]) {
                if (!item?.id) item.id = newId();
                importedIds.set(`${k}:${item.id}`, item.id);
            }
        } else {
            for (const item of incoming) {
                const copy = structuredClone(item);
                const originalId = copy?.id || '';
                if (!copy?.id) copy.id = newId();
                // re-id if collision
                if (st.libraries[k].some(x => x.id === copy.id)) {
                    copy.id = newId();
                }
                st.libraries[k].push(copy);
                if (originalId) importedIds.set(`${k}:${originalId}`, copy.id);
            }
        }
    }

    const activeKeys = [
        ['imageWorkflows', 'activeImageWorkflowId', 'imageWorkflow'],
        ['i2vWorkflows', 'activeI2vWorkflowId', 'i2vWorkflow'],
        ['imagePrompts', 'activeImagePromptId', 'imagePromptTemplate'],
        ['motionPrompts', 'activeMotionPromptId', 'motionPromptTemplate'],
    ];
    for (const [listKey, activeKey, fieldKey] of activeKeys) {
        const importedId = data[activeKey];
        const resolvedId = importedIds.get(`${listKey}:${importedId}`) || importedId;
        if (resolvedId && st.libraries[listKey].some(x => x.id === resolvedId)) st[activeKey] = resolvedId;
        if (typeof data[fieldKey] === 'string') st[fieldKey] = data[fieldKey];
    }
    if (typeof data.imageStylePreset === 'string') st.imageStylePreset = data.imageStylePreset;
    if (typeof data.customImageStyle === 'string') st.customImageStyle = data.customImageStyle;
}
