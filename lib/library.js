/**
 * Named libraries for workflows and LLM instruction prompts.
 */

import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
    IMAGE_PROMPT_PRESET_NAME,
    IMAGE_PROMPT_VARIANTS,
    LEGACY_IMAGE_PROMPT_PRESET_NAMES,
    LEGACY_MOTION_PROMPT_PRESET_NAMES,
    MOTION_PROMPT_PRESET_NAME,
} from './defaults.js';

const LEGACY_MOTION_TEMPLATE_FINGERPRINTS = new Set([
    '4101:ca79818e',
    '1650:793291e2',
]);

// Exact fingerprints of the previous built-in image prompts. This upgrades
// untouched defaults while preserving every user-edited instruction.
const LEGACY_IMAGE_TEMPLATE_FINGERPRINTS_BY_KIND = Object.freeze({
    scene: new Set(['4692:5eaf505a']),
    portrait: new Set(['1863:6b4e270d']),
    interaction: new Set(['2241:a35e44c7']),
    environment: new Set(['2064:0a5615f9']),
});

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

    // Seed the structured image preset without overwriting older saved presets.
    let imagePreset = L.imagePrompts.find(p => p.promptKind === 'scene')
        || L.imagePrompts.find(p => p.name === IMAGE_PROMPT_PRESET_NAME);
    if (!imagePreset) {
        // Also upgrade legacy short preset name if present
        imagePreset = {
            id: newId(),
            name: IMAGE_PROMPT_PRESET_NAME,
            template: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        };
        L.imagePrompts.unshift(imagePreset);
    }
    imagePreset.promptKind ||= 'scene';

    // Seed each panel action as a normal editable library item. promptKind is
    // stable even if the user renames the preset. Only an exact untouched
    // previous built-in is upgraded; customized text is never replaced.
    for (const variant of Object.values(IMAGE_PROMPT_VARIANTS)) {
        let preset = L.imagePrompts.find(p => p.promptKind === variant.kind)
            || L.imagePrompts.find(p => p.name === variant.name);
        if (!preset) {
            preset = {
                id: newId(),
                name: variant.name,
                template: variant.template,
                promptKind: variant.kind,
            };
            L.imagePrompts.push(preset);
        } else if (!preset.promptKind) {
            preset.promptKind = variant.kind;
        }

        const previousTemplate = String(preset.template || '');
        const untouchedBuiltIn = LEGACY_IMAGE_TEMPLATE_FINGERPRINTS_BY_KIND[variant.kind]
            ?.has(templateFingerprint(previousTemplate));
        if (untouchedBuiltIn) {
            const activeUsesPreviousTemplate = st.activeImagePromptId === preset.id
                && (!st.imagePromptTemplate?.trim() || st.imagePromptTemplate === previousTemplate);
            preset.template = variant.template;
            if (activeUsesPreviousTemplate) st.imagePromptTemplate = variant.template;
        }
    }

    const activeImagePreset = L.imagePrompts.find(p => p.id === st.activeImagePromptId);
    const usesLegacyDetailedDefault = !!activeImagePreset
        && LEGACY_IMAGE_PROMPT_PRESET_NAMES.includes(activeImagePreset.name)
        && String(activeImagePreset.template || '').includes('If you mention a feature type for one character')
        && (!st.imagePromptTemplate?.trim() || st.imagePromptTemplate === activeImagePreset.template);

    if (L.imagePrompts.length === 0) {
        L.imagePrompts.push(imagePreset);
    }

    if (!st.imagePromptTemplate?.trim()
        || st.imagePromptTemplate.includes('Prioritize, in order:')
        || st.imagePromptTemplate.includes('not a static visual novel')
        || usesLegacyDetailedDefault) {
        // Empty or known-old short default → use full guidelines
        st.imagePromptTemplate = DEFAULT_IMAGE_PROMPT_TEMPLATE;
        st.activeImagePromptId = imagePreset.id;
    }
    if (!st.activeImagePromptId) {
        st.activeImagePromptId = imagePreset.id;
    }

    // Seed / upgrade detailed I2V motion prompt preset
    let motionPreset = L.motionPrompts.find(p => p.promptKind === 'h3-i2va')
        || L.motionPrompts.find(p => p.name === MOTION_PROMPT_PRESET_NAME);
    if (!motionPreset) {
        motionPreset = {
            id: newId(),
            name: MOTION_PROMPT_PRESET_NAME,
            template: DEFAULT_MOTION_PROMPT_TEMPLATE,
            promptKind: 'h3-i2va',
        };
        L.motionPrompts.unshift(motionPreset);
    }
    motionPreset.promptKind ||= 'h3-i2va';

    if (L.motionPrompts.length === 0) {
        L.motionPrompts.push(motionPreset);
    }

    const activeMotionPreset = L.motionPrompts.find(p => p.id === st.activeMotionPromptId);
    const usesUntouchedLegacyMotionPreset = !!activeMotionPreset
        && LEGACY_MOTION_PROMPT_PRESET_NAMES.includes(activeMotionPreset.name)
        && LEGACY_MOTION_TEMPLATE_FINGERPRINTS.has(templateFingerprint(activeMotionPreset.template))
        && (!st.motionPromptTemplate?.trim() || st.motionPromptTemplate === activeMotionPreset.template);

    if (!st.motionPromptTemplate?.trim()
        || st.motionPromptTemplate.includes('Write about one clear line')
        || st.motionPromptTemplate.includes('No hard cuts, no new characters, no scene changes.')
        || usesUntouchedLegacyMotionPreset) {
        st.motionPromptTemplate = DEFAULT_MOTION_PROMPT_TEMPLATE;
        st.activeMotionPromptId = motionPreset.id;
    }
    if (!st.activeMotionPromptId) {
        st.activeMotionPromptId = motionPreset.id;
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

/** Exact fingerprinting lets us upgrade untouched built-ins without guessing. */
function templateFingerprint(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Resolve an image action to its editable library preset.
 * @param {object} st
 * @param {string} [kind]
 */
export function resolveImagePromptVariant(st, kind = 'scene') {
    const variant = IMAGE_PROMPT_VARIANTS[kind] || IMAGE_PROMPT_VARIANTS.scene;
    const preset = st.libraries?.imagePrompts?.find(p => p.promptKind === variant.kind)
        || st.libraries?.imagePrompts?.find(p => p.name === variant.name);
    return {
        ...variant,
        id: preset?.id || '',
        name: preset?.name || variant.name,
        template: String(preset?.template || variant.template),
    };
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
        imageQuality: st.imageQuality,
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
    if (typeof data.imageQuality === 'string') st.imageQuality = data.imageQuality;
    if (typeof data.customImageStyle === 'string') st.customImageStyle = data.customImageStyle;
}
