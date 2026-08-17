/**
 * ComfyVideo – SillyTavern UI extension
 * Scene image (T2I) → per-message I2V, via local ComfyUI.
 * AGPL-3.0
 */

import {
    appendMediaToMessage,
    event_types,
    eventSource,
    generateQuietPrompt,
    getRequestHeaders,
    saveSettingsDebounced,
    systemUserName,
} from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import { getMessageTimeStamp, humanizedDateTime } from '../../../RossAscends-mods.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from '../../../popup.js';
import { ConnectionManagerRequestService } from '../../shared.js';

import { createComfyClient } from './lib/comfy-client.js';
import {
    parseWorkflow,
    fillPlaceholders,
    validateWorkflow,
    wrapPromptBody,
    resolveDimensions,
    resolveImageDimensions,
} from './lib/workflow.js';
import { createPromptBuilder } from './lib/prompt-builder.js';
import {
    attachGeneratedMedia,
    getMessageImageUrl,
    isComfyVideoMessage,
    isVideoFormat,
} from './lib/media.js';
import { showStatus, newClientId, isAbortError } from './lib/status-ui.js';
import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
    DEFAULT_VIDEO_FPS,
    DEFAULT_VIDEO_FRAMES,
    alignH3FrameCount,
    clipTiming,
} from './lib/defaults.js';
import {
    ensureLibraries,
    findItem,
    overwriteItem,
    addItem,
    removeItem,
    resolveImagePromptVariant,
    exportLibrariesBlob,
    importLibraries,
} from './lib/library.js';
import { loadBundledWorkflows, seedBundledWorkflows } from './lib/bundled-workflows.js';
import { createPanel } from './lib/panel.js';

const MODULE = 'ComfyVideo';
const LOG = '[ComfyVideo]';
const EXT_NAME = 'ComfyVideo';

const IMAGE_PLACEHOLDERS = [
    'prompt', 'negative_prompt', 'seed', 'width', 'height',
];
const I2V_PLACEHOLDERS = [
    'image', 'image_name', 'image_subfolder',
    'prompt', 'negative_prompt', 'seed', 'frames', 'fps', 'width', 'height',
];

const IMAGE_STYLE_PROMPTS = Object.freeze({
    photo: 'Photorealistic cinematic imagery, natural adult anatomy, credible skin texture, realistic practical lighting, detailed environment, coherent depth and perspective.',
    digital_art: 'Realistic high-detail digital art, believable adult anatomy, polished painted rendering, nuanced material texture, cinematic lighting, coherent depth and perspective.',
    western_comic: 'Detailed Western graphic-novel art, realistic adult proportions, expressive natural faces, controlled ink contours, layered painted shading, textured brushwork, cinematic panel composition, no anime or manga styling.',
});

const defaultSettings = Object.freeze({
    enabled: true,
    comfyUrl: 'http://127.0.0.1:8188',
    resolution: 'portrait',
    imageQuality: 'high',

    imageWorkflow: '',
    contextMessages: 5,
    includeCharacter: true,
    confirmImagePrompt: true,
    imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,

    promptMode: 'profile',
    llmProfileId: '',
    maxPromptTokens: 700,
    useLlmPreset: false,

    i2vWorkflow: '',
    frames: DEFAULT_VIDEO_FRAMES,
    fps: DEFAULT_VIDEO_FPS,
    motionIntensity: 'normal',
    motionPromptTemplate: DEFAULT_MOTION_PROMPT_TEMPLATE,
    confirmMotionPrompt: true,
    seedMode: 'random',
    fixedSeed: 0,
    negativePrompt: 'blurry, static, low quality, text, watermark',
    imageStylePreset: 'photo',
    customImageStyle: '',
    installedBundledWorkflowVersions: {},
    appliedBundledDefaults: {},

    attachImageMode: 'last',

    activeImageWorkflowId: '',
    activeI2vWorkflowId: '',
    activeImagePromptId: '',
    activeMotionPromptId: '',
    libraries: {
        imageWorkflows: [],
        i2vWorkflows: [],
        imagePrompts: [],
        motionPrompts: [],
    },
});

/** @type {ReturnType<typeof createComfyClient>} */
let comfy;
/** @type {ReturnType<typeof createPromptBuilder>} */
let prompts;
/** @type {ReturnType<typeof createPanel>|null} */
let panel = null;
let busy = false;

function getSettings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    const st = extension_settings[MODULE];
    for (const key of Object.keys(defaultSettings)) {
        if (st[key] === undefined) {
            st[key] = structuredClone(defaultSettings[key]);
        }
    }
    if (!st.resolution) {
        const w = Number(st.imageWidth);
        const h = Number(st.imageHeight);
        st.resolution = (w >= h) ? 'landscape' : 'portrait';
    }
    if (st.promptMode === 'manual') st.promptMode = 'profile';
    if (st.imageStylePreset === 'realistic') st.imageStylePreset = 'photo';
    if (!['photo', 'digital_art', 'western_comic', 'custom'].includes(st.imageStylePreset)) {
        st.imageStylePreset = defaultSettings.imageStylePreset;
    }
    if (!['subtle', 'normal', 'energetic'].includes(st.motionIntensity)) {
        st.motionIntensity = defaultSettings.motionIntensity;
    }
    if (migrateClipDefaults(st)) saveSettings();
    if (!['compatible', 'high', 'ultra'].includes(st.imageQuality)) {
        st.imageQuality = defaultSettings.imageQuality;
    }
    // Always LLM for motion — drop fixed mode
    delete st.motionPromptMode;
    delete st.fixedMotionPrompt;
    delete st.imageWidth;
    delete st.imageHeight;
    delete st.imageInputMode;
    delete st.manualImagePrompt;
    ensureLibraries(st);
    return st;
}

function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Replace the stale 16/8 factory default and the old 24fps 5s/10s buttons
 * with H3's 17k+5 grid. Custom frame counts are left for generate-time snap.
 * @param {object} st
 */
function migrateClipDefaults(st) {
    const frames = Number(st.frames);
    const fps = Number(st.fps);
    if (frames === 16 && fps === 8) {
        st.frames = DEFAULT_VIDEO_FRAMES;
        st.fps = DEFAULT_VIDEO_FPS;
        return true;
    }
    if (fps === 24 && frames === 120) {
        st.frames = 124;
        return true;
    }
    if (fps === 24 && frames === 240) {
        st.frames = 243;
        return true;
    }
    return false;
}

async function addBundledWorkflows(restore = false) {
    const settings = getSettings();
    const bundled = await loadBundledWorkflows(EXT_NAME);
    const { added, changed } = seedBundledWorkflows(settings, bundled, restore);
    if (changed) saveSettings();
    return added;
}

function resolveSeed(settings) {
    if (settings.seedMode === 'fixed') return Number(settings.fixedSeed) || 0;
    return Math.floor(Math.random() * 2 ** 32);
}

function resolveVideoDimensions(settings, message) {
    const width = Number(message?.extra?.comfyVideo?.width);
    const height = Number(message?.extra?.comfyVideo?.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return resolveDimensions(width >= height ? 'landscape' : 'portrait');
    }
    return resolveDimensions(settings.resolution);
}

function resolveVisualStyle(settings) {
    return settings.imageStylePreset === 'custom'
        ? String(settings.customImageStyle || '').trim()
        : (IMAGE_STYLE_PROMPTS[settings.imageStylePreset] || '');
}

function appendVisualStyle(prompt, settings) {
    const scene = String(prompt || '').trim();
    const style = resolveVisualStyle(settings);
    if (!style) return scene;

    // The selected panel style is assembled here. Some instruction presets or
    // models also emit a final "Visual style:" section; replace that trailing
    // section so it cannot be duplicated or conflict with the panel setting.
    const sceneWithoutTrailingStyle = scene
        .replace(/(?:\n\s*)+Visual style:\s*[\s\S]*$/i, '')
        .trim();
    return `${sceneWithoutTrailingStyle}\n\nVisual style: ${style}`;
}

function appendMotionVisualStyle(prompt, settings) {
    const motion = String(prompt || '').trim();
    const style = resolveVisualStyle(settings);
    if (!style) return motion;

    // Official H3 I2VA prompts require the alignment instruction followed by
    // three fields. Keep style guidance inside Shot 1 instead of appending a
    // fourth field after non_diegetic_music.
    const shotOne = /integrated_multimodal_description:\s*\[Shot 1\]\s*/i;
    if (shotOne.test(motion)) {
        return motion.replace(shotOne, match => `${match}The target video preserves this visual treatment: ${style} `);
    }
    return appendVisualStyle(motion, settings);
}

function populateProfileDropdown() {
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('comfyvideo_llm_profile'));
    if (!select) return;
    const settings = getSettings();
    const prev = settings.llmProfileId;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '(none)';
    select.append(empty);
    try {
        const profiles = ConnectionManagerRequestService.getSupportedProfiles?.()
            || getContext().extensionSettings?.connectionManager?.profiles
            || [];
        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            select.append(opt);
        }
    } catch (e) {
        console.warn(LOG, 'Could not list connection profiles', e);
    }
    select.value = prev || '';
}

function updateClipLengthHint() {
    const st = getSettings();
    const el = document.getElementById('comfyvideo_clip_length_hint');
    if (!el) return;
    const { seconds, motionLines } = clipTiming(st.frames, st.fps);
    el.textContent = `≈ ${seconds}s · ~${motionLines} motion lines`;
}

/**
 * @param {HTMLSelectElement} select
 * @param {{id:string,name:string}[]} list
 * @param {string} activeId
 */
function fillLibrarySelect(select, list, activeId) {
    select.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = list.length ? '(select…)' : '(empty — Save as…)';
    select.append(none);
    for (const item of list) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        select.append(opt);
    }
    select.value = activeId && list.some(x => x.id === activeId) ? activeId : '';
}

function refreshLibraryDropdowns() {
    const st = getSettings();
    const L = st.libraries;
    const map = [
        ['comfyvideo_lib_image_wf', L.imageWorkflows, st.activeImageWorkflowId],
        ['comfyvideo_lib_i2v_wf', L.i2vWorkflows, st.activeI2vWorkflowId],
        ['comfyvideo_lib_image_prompt', L.imagePrompts, st.activeImagePromptId],
        ['comfyvideo_lib_motion_prompt', L.motionPrompts, st.activeMotionPromptId],
    ];
    for (const [id, list, active] of map) {
        const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById(id));
        if (sel) fillLibrarySelect(sel, list, active);
    }
}

async function loadSettingsHtml() {
    const container = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!container) {
        console.warn(LOG, 'No extensions settings container');
        return;
    }

    let html;
    try {
        html = await renderExtensionTemplateAsync(`third-party/${EXT_NAME}`, 'settings');
    } catch {
        const res = await fetch(`/scripts/extensions/third-party/${EXT_NAME}/settings.html`);
        html = await res.text();
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    container.append(wrap);

    bindSettingsUi();
    bindLibraryUi();
    applySettingsToUi();
    populateProfileDropdown();
    refreshLibraryDropdowns();
    updateClipLengthHint();
}

function bindSettingsUi() {
    const s = () => getSettings();
    const map = [
        ['comfyvideo_enabled', 'enabled', 'checked'],
        ['comfyvideo_comfy_url', 'comfyUrl', 'value'],
        ['comfyvideo_resolution', 'resolution', 'value'],
        ['comfyvideo_image_quality', 'imageQuality', 'value'],
        ['comfyvideo_prompt_mode', 'promptMode', 'value'],
        ['comfyvideo_llm_profile', 'llmProfileId', 'value'],
        ['comfyvideo_max_prompt_tokens', 'maxPromptTokens', 'number'],
        ['comfyvideo_use_llm_preset', 'useLlmPreset', 'checked'],
        ['comfyvideo_context_messages', 'contextMessages', 'number'],
        ['comfyvideo_include_character', 'includeCharacter', 'checked'],
        ['comfyvideo_confirm_prompt', 'confirmImagePrompt', 'checked'],
        ['comfyvideo_image_prompt_template', 'imagePromptTemplate', 'value'],
        ['comfyvideo_frames', 'frames', 'number'],
        ['comfyvideo_fps', 'fps', 'number'],
        ['comfyvideo_motion_intensity', 'motionIntensity', 'value'],
        ['comfyvideo_motion_prompt_template', 'motionPromptTemplate', 'value'],
        ['comfyvideo_confirm_motion', 'confirmMotionPrompt', 'checked'],
        ['comfyvideo_seed_mode', 'seedMode', 'value'],
        ['comfyvideo_fixed_seed', 'fixedSeed', 'number'],
        ['comfyvideo_negative', 'negativePrompt', 'value'],
        ['comfyvideo_image_style', 'imageStylePreset', 'value'],
        ['comfyvideo_custom_image_style', 'customImageStyle', 'value'],
        ['comfyvideo_attach_image', 'attachImageMode', 'value'],
    ];

    for (const [id, key, kind] of map) {
        const el = document.getElementById(id);
        if (!el) continue;
        const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            const st = s();
            if (kind === 'checked') st[key] = /** @type {HTMLInputElement} */ (el).checked;
            else if (kind === 'number') st[key] = Number(/** @type {HTMLInputElement} */ (el).value);
            else st[key] = /** @type {HTMLInputElement} */ (el).value;
            if (key === 'frames' || key === 'fps') updateClipLengthHint();
            if (key === 'imageStylePreset') {
                document.getElementById('comfyvideo_custom_image_style_wrap')?.classList.toggle(
                    'displayNone', st.imageStylePreset !== 'custom');
            }
            saveSettings();
        });
    }

    document.getElementById('comfyvideo_test_btn')?.addEventListener('click', onTestConnection);
    document.getElementById('comfyvideo_reset_btn')?.addEventListener('click', () => {
        extension_settings[MODULE] = structuredClone(defaultSettings);
        ensureLibraries(extension_settings[MODULE]);
        saveSettings();
        applySettingsToUi();
        populateProfileDropdown();
        refreshLibraryDropdowns();
        updateClipLengthHint();
        toastr.info('ComfyVideo settings reset.');
    });

    document.getElementById('comfyvideo_export_libs')?.addEventListener('click', () => {
        const st = getSettings();
        const blob = exportLibrariesBlob(st);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `comfyvideo-libraries-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    document.getElementById('comfyvideo_import_libs')?.addEventListener('click', () => {
        document.getElementById('comfyvideo_import_file')?.click();
    });
    document.getElementById('comfyvideo_restore_bundled')?.addEventListener('click', async () => {
        try {
            const added = await addBundledWorkflows(true);
            applySettingsToUi();
            refreshLibraryDropdowns();
            panel?.refresh();
            toastr.info(added ? `${added} bundled workflow${added === 1 ? '' : 's'} added.` : 'All bundled workflows are already present.', 'ComfyVideo');
        } catch (err) {
            console.error(LOG, err);
            toastr.error(String(err.message || err), 'ComfyVideo');
        }
    });
    document.getElementById('comfyvideo_import_file')?.addEventListener('change', async e => {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            const st = getSettings();
            importLibraries(st, data, false);
            saveSettings();
            applySettingsToUi();
            refreshLibraryDropdowns();
            toastr.success('Libraries imported (merged).', 'ComfyVideo');
        } catch (err) {
            toastr.error(String(err.message || err), 'ComfyVideo');
        }
        /** @type {HTMLInputElement} */ (e.target).value = '';
    });
}

function bindLibraryUi() {
    // Image workflow
    wireWorkflowLibrary({
        selectId: 'comfyvideo_lib_image_wf',
        editId: 'comfyvideo_lib_image_wf_edit',
        saveAsId: 'comfyvideo_lib_image_wf_saveas',
        deleteId: 'comfyvideo_lib_image_wf_delete',
        listKey: 'imageWorkflows',
        activeIdKey: 'activeImageWorkflowId',
        fieldKey: 'imageWorkflow',
        kind: 'image',
        title: 'Image workflow',
    });
    // I2V workflow
    wireWorkflowLibrary({
        selectId: 'comfyvideo_lib_i2v_wf',
        editId: 'comfyvideo_lib_i2v_wf_edit',
        saveAsId: 'comfyvideo_lib_i2v_wf_saveas',
        deleteId: 'comfyvideo_lib_i2v_wf_delete',
        listKey: 'i2vWorkflows',
        activeIdKey: 'activeI2vWorkflowId',
        fieldKey: 'i2vWorkflow',
        kind: 'i2v',
        title: 'I2V workflow',
    });
    // Image prompt template
    wirePromptLibrary({
        selectId: 'comfyvideo_lib_image_prompt',
        saveId: 'comfyvideo_lib_image_prompt_save',
        saveAsId: 'comfyvideo_lib_image_prompt_saveas',
        deleteId: 'comfyvideo_lib_image_prompt_delete',
        textareaId: 'comfyvideo_image_prompt_template',
        listKey: 'imagePrompts',
        activeIdKey: 'activeImagePromptId',
        fieldKey: 'imagePromptTemplate',
    });
    // Motion prompt template
    wirePromptLibrary({
        selectId: 'comfyvideo_lib_motion_prompt',
        saveId: 'comfyvideo_lib_motion_prompt_save',
        saveAsId: 'comfyvideo_lib_motion_prompt_saveas',
        deleteId: 'comfyvideo_lib_motion_prompt_delete',
        textareaId: 'comfyvideo_motion_prompt_template',
        listKey: 'motionPrompts',
        activeIdKey: 'activeMotionPromptId',
        fieldKey: 'motionPromptTemplate',
    });
}

/**
 * @param {object} cfg
 */
function wireWorkflowLibrary(cfg) {
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById(cfg.selectId));
    if (!select) return;

    select.addEventListener('change', () => {
        const st = getSettings();
        const id = select.value;
        st[cfg.activeIdKey] = id;
        if (id) {
            const item = findItem(st.libraries[cfg.listKey], id);
            if (item?.json != null) {
                st[cfg.fieldKey] = item.json;
            }
        }
        saveSettings();
    });

    document.getElementById(cfg.editId)?.addEventListener('click', async () => {
        const st = getSettings();
        const id = st[cfg.activeIdKey];
        const item = id ? findItem(st.libraries[cfg.listKey], id) : null;
        const name = item?.name || `New ${cfg.title}`;
        const initial = item?.json ?? st[cfg.fieldKey] ?? '';
        const result = await openWorkflowEditor({
            name,
            json: initial,
            placeholders: cfg.kind === 'i2v' ? I2V_PLACEHOLDERS : IMAGE_PLACEHOLDERS,
        });
        if (result == null) return;
        try {
            validateWorkflow(parseWorkflow(result), cfg.kind);
        } catch (err) {
            toastr.error(String(err.message || err), 'ComfyVideo');
            return;
        }
        st[cfg.fieldKey] = result;
        if (item) {
            item.json = result;
        } else {
            // No selection: save as new
            const n = await callGenericPopup('Name for this workflow:', POPUP_TYPE.INPUT, name);
            if (!n) {
                saveSettings();
                return;
            }
            const created = addItem(st.libraries[cfg.listKey], String(n), result, 'json');
            st[cfg.activeIdKey] = created.id;
            refreshLibraryDropdowns();
        }
        saveSettings();
        toastr.success('Workflow saved.', 'ComfyVideo');
    });

    document.getElementById(cfg.saveAsId)?.addEventListener('click', async () => {
        const st = getSettings();
        let json = st[cfg.fieldKey] || '';
        if (!json.trim()) {
            // open editor first if empty
            const edited = await openWorkflowEditor({
                name: 'New workflow',
                json: '',
                placeholders: cfg.kind === 'i2v' ? I2V_PLACEHOLDERS : IMAGE_PLACEHOLDERS,
            });
            if (edited == null) return;
            try {
                validateWorkflow(parseWorkflow(edited), cfg.kind);
            } catch (err) {
                toastr.error(String(err.message || err), 'ComfyVideo');
                return;
            }
            json = edited;
            st[cfg.fieldKey] = json;
        }
        const n = await callGenericPopup('Save workflow as:', POPUP_TYPE.INPUT, '');
        if (!n) return;
        const created = addItem(st.libraries[cfg.listKey], String(n), json, 'json');
        st[cfg.activeIdKey] = created.id;
        saveSettings();
        refreshLibraryDropdowns();
        toastr.success('Workflow added to library.', 'ComfyVideo');
    });

    document.getElementById(cfg.deleteId)?.addEventListener('click', async () => {
        const st = getSettings();
        const id = st[cfg.activeIdKey];
        if (!id) {
            toastr.info('Select a library item first.');
            return;
        }
        const ok = await callGenericPopup('Delete this workflow from the library?', POPUP_TYPE.CONFIRM);
        if (!ok) return;
        removeItem(st.libraries[cfg.listKey], id);
        st[cfg.activeIdKey] = '';
        saveSettings();
        refreshLibraryDropdowns();
    });
}

/**
 * @param {object} cfg
 */
function wirePromptLibrary(cfg) {
    const select = /** @type {HTMLSelectElement|null} */ (document.getElementById(cfg.selectId));
    const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById(cfg.textareaId));
    if (!select || !ta) return;

    select.addEventListener('change', () => {
        const st = getSettings();
        const id = select.value;
        st[cfg.activeIdKey] = id;
        if (id) {
            const item = findItem(st.libraries[cfg.listKey], id);
            if (item?.template != null) {
                st[cfg.fieldKey] = item.template;
                ta.value = item.template;
            }
        }
        saveSettings();
    });

    document.getElementById(cfg.saveId)?.addEventListener('click', () => {
        const st = getSettings();
        const id = st[cfg.activeIdKey];
        const content = ta.value;
        st[cfg.fieldKey] = content;
        if (!id) {
            toastr.info('No library item selected — use Save as…');
            saveSettings();
            return;
        }
        if (!overwriteItem(st.libraries[cfg.listKey], id, content, 'template')) {
            toastr.error('Item not found.');
            return;
        }
        saveSettings();
        toastr.success('Saved.', 'ComfyVideo');
    });

    document.getElementById(cfg.saveAsId)?.addEventListener('click', async () => {
        const st = getSettings();
        const content = ta.value;
        const n = await callGenericPopup('Save instructions as:', POPUP_TYPE.INPUT, '');
        if (!n) return;
        const created = addItem(st.libraries[cfg.listKey], String(n), content, 'template');
        st[cfg.activeIdKey] = created.id;
        st[cfg.fieldKey] = content;
        saveSettings();
        refreshLibraryDropdowns();
        toastr.success('Added to library.', 'ComfyVideo');
    });

    document.getElementById(cfg.deleteId)?.addEventListener('click', async () => {
        const st = getSettings();
        const id = st[cfg.activeIdKey];
        if (!id) {
            toastr.info('Select a library item first.');
            return;
        }
        const ok = await callGenericPopup('Delete this prompt preset from the library?', POPUP_TYPE.CONFIRM);
        if (!ok) return;
        removeItem(st.libraries[cfg.listKey], id);
        st[cfg.activeIdKey] = '';
        saveSettings();
        refreshLibraryDropdowns();
    });
}

/**
 * ST-style wide popup workflow editor with placeholder checklist.
 * @param {{ name: string, json: string, placeholders: string[] }} opts
 * @returns {Promise<string|null>}
 */
async function openWorkflowEditor(opts) {
    let html;
    try {
        html = await renderExtensionTemplateAsync(`third-party/${EXT_NAME}`, 'workflow-editor');
    } catch {
        const res = await fetch(`/scripts/extensions/third-party/${EXT_NAME}/workflow-editor.html`);
        html = await res.text();
    }

    const $root = $(html);
    let workflow = opts.json || '';

    const saveValue = () => {
        workflow = String($root.find('#comfyvideo_workflow_editor_json').val() ?? '');
        return true;
    };

    const popup = new Popup($root, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        onClosing: saveValue,
    });
    const resultPromise = popup.show();

    $root.find('#comfyvideo_workflow_editor_name').text(opts.name || 'Workflow');
    const $ta = $root.find('#comfyvideo_workflow_editor_json');
    $ta.val(workflow);

    const $list = $root.find('#comfyvideo_workflow_editor_placeholders');
    $list.empty();
    for (const key of opts.placeholders) {
        const li = $(`<li data-placeholder="${key}" class="comfyvideo_workflow_editor_not_found" title="Click to copy">"%${key}%"</li>`);
        li.on('click', () => {
            navigator.clipboard?.writeText(`"%${key}%"`);
            toastr.info(`Copied "%${key}%"`);
        });
        $list.append(li);
    }

    const checkPlaceholders = () => {
        workflow = String($ta.val() ?? '');
        $list.find('li[data-placeholder]').each(function () {
            const key = this.getAttribute('data-placeholder');
            const found = workflow.includes(`"%${key}%"`) || workflow.includes(`%${key}%`);
            this.classList.toggle('comfyvideo_workflow_editor_not_found', !found);
        });
    };
    $ta.on('input', checkPlaceholders);
    checkPlaceholders();

    const ok = await resultPromise;
    if (!ok) return null;
    return workflow;
}

function applySettingsToUi() {
    const st = getSettings();
    const set = (id, val, kind = 'value') => {
        const el = document.getElementById(id);
        if (!el) return;
        if (kind === 'checked') /** @type {HTMLInputElement} */ (el).checked = !!val;
        else /** @type {HTMLInputElement} */ (el).value = val ?? '';
    };
    set('comfyvideo_enabled', st.enabled, 'checked');
    set('comfyvideo_comfy_url', st.comfyUrl);
    set('comfyvideo_resolution', st.resolution === 'landscape' ? 'landscape' : 'portrait');
    set('comfyvideo_image_quality', st.imageQuality);
    set('comfyvideo_prompt_mode', st.promptMode);
    set('comfyvideo_llm_profile', st.llmProfileId);
    set('comfyvideo_max_prompt_tokens', st.maxPromptTokens);
    set('comfyvideo_use_llm_preset', st.useLlmPreset, 'checked');
    set('comfyvideo_context_messages', st.contextMessages);
    set('comfyvideo_include_character', st.includeCharacter, 'checked');
    set('comfyvideo_confirm_prompt', st.confirmImagePrompt, 'checked');
    set('comfyvideo_image_prompt_template', st.imagePromptTemplate);
    set('comfyvideo_frames', st.frames);
    set('comfyvideo_fps', st.fps);
    set('comfyvideo_motion_intensity', st.motionIntensity);
    set('comfyvideo_motion_prompt_template', st.motionPromptTemplate);
    set('comfyvideo_confirm_motion', st.confirmMotionPrompt, 'checked');
    set('comfyvideo_seed_mode', st.seedMode);
    set('comfyvideo_fixed_seed', st.fixedSeed);
    set('comfyvideo_negative', st.negativePrompt);
    set('comfyvideo_image_style', st.imageStylePreset);
    set('comfyvideo_custom_image_style', st.customImageStyle);
    document.getElementById('comfyvideo_custom_image_style_wrap')?.classList.toggle(
        'displayNone', st.imageStylePreset !== 'custom');
    set('comfyvideo_attach_image', st.attachImageMode);
}

async function onTestConnection() {
    const st = getSettings();
    const status = document.getElementById('comfyvideo_conn_status');
    if (status) {
        status.textContent = 'Testing…';
        status.className = 'comfyvideo-status';
    }
    try {
        const ok = await comfy.ping(st.comfyUrl);
        if (status) {
            status.textContent = ok ? 'Connected' : 'Failed';
            status.className = 'comfyvideo-status ' + (ok ? 'ok' : 'err');
        }
        if (ok) toastr.success('ComfyUI reachable via ST proxy.', 'ComfyVideo');
        else toastr.error('ComfyUI ping failed.', 'ComfyVideo');
    } catch (e) {
        if (status) {
            status.textContent = 'Error';
            status.className = 'comfyvideo-status err';
        }
        toastr.error(String(e.message || e), 'ComfyVideo');
    }
}

function addWandButton() {
    const target = document.getElementById('extensionsMenu')
        || document.getElementById('sd_wand_container');
    if (!target || document.getElementById('comfyvideo_wand_button')) return;
    const btn = document.createElement('div');
    btn.id = 'comfyvideo_wand_button';
    btn.className = 'list-group-item flex-container flexGap5';
    btn.title = 'ComfyVideo: open generation panel';
    btn.innerHTML = '<div class="fa-solid fa-clapperboard extensionsMenuExtensionButton"></div><span>ComfyVideo</span>';
    btn.addEventListener('click', () => {
        // Close extensions menu if open
        document.body.click();
        panel?.open().catch(err => {
            console.error(LOG, err);
            toastr.error(String(err.message || err), 'ComfyVideo');
        });
    });
    target.append(btn);
}

function registerSlashCommands() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sceneimage',
        aliases: ['videoimage', 'comfyimage'],
        callback: async () => {
            await generateSceneImage();
            return '';
        },
        helpString: 'ComfyVideo: generate a scene still from recent RP chat.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'comfyvideo',
        aliases: ['cvpanel'],
        callback: async () => {
            await panel?.open();
            return '';
        },
        helpString: 'ComfyVideo: open the floating generation panel.',
    }));
}

async function previewPrompt(title, initial, okLabel) {
    const autoSubmitSeconds = 10;
    let timer = null;
    let secondsLeft = autoSubmitSeconds;
    let editedByUser = false;
    const label = () => editedByUser ? okLabel : `${okLabel} (${secondsLeft}s)`;
    const stopTimer = () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
    };

    const popup = new Popup(title, POPUP_TYPE.INPUT, initial, {
        okButton: label(),
        cancelButton: 'Cancel',
        rows: 10,
        wide: true,
        onOpen: current => {
            const stopOnInteraction = () => {
                editedByUser = true;
                stopTimer();
                current.okButton.textContent = okLabel;
            };
            // Taking focus or tapping the field is an intent to review or edit it.
            for (const eventName of ['focus', 'pointerdown', 'input']) {
                current.mainInput.addEventListener(eventName, stopOnInteraction, { once: true });
            }
            timer = setInterval(() => {
                secondsLeft--;
                if (secondsLeft <= 0) {
                    stopTimer();
                    void current.complete(POPUP_RESULT.AFFIRMATIVE);
                    return;
                }
                current.okButton.textContent = label();
            }, 1000);
        },
        onClose: stopTimer,
    });
    const edited = await popup.show();
    if (edited === false || edited === null || edited === undefined) return null;
    return String(edited).trim();
}

async function generateSceneImage(promptKind = 'scene', opts = {}) {
    const st = getSettings();
    const {
        targetMessage = null,
        skipPromptConfirmation = false,
        regenerationMedia = null,
    } = opts;
    if (!st.enabled) {
        toastr.warning('ComfyVideo is disabled in settings.');
        return;
    }
    if (busy) {
        toastr.info('ComfyVideo is already working.');
        return;
    }
    const savedRecipe = regenerationMedia?.comfyVideo
        || targetMessage?.extra?.comfyVideo
        || null;
    const imageWorkflow = String(savedRecipe?.imageWorkflow || st.imageWorkflow || '').trim();
    if (!imageWorkflow) {
        toastr.error('Add an Image workflow (library → Edit / Save as…).');
        return;
    }

    const ctx = getContext();
    const sourceChatId = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : null;
    if (targetMessage && !ctx.chat?.includes(targetMessage)) {
        toastr.error('The selected message is no longer available in this chat.', 'ComfyVideo');
        return;
    }

    const promptVariant = resolveImagePromptVariant(st, savedRecipe?.imagePromptKind || promptKind);
    st.activeImagePromptId = promptVariant.id || st.activeImagePromptId;
    st.imagePromptTemplate = promptVariant.template;
    saveSettings();
    applySettingsToUi();
    refreshLibraryDropdowns();

    busy = true;
    const savedWidth = Number(savedRecipe?.width);
    const savedHeight = Number(savedRecipe?.height);
    const dims = Number.isFinite(savedWidth) && Number.isFinite(savedHeight)
        && savedWidth > 0 && savedHeight > 0
        ? { width: savedWidth, height: savedHeight }
        : resolveImageDimensions(st.resolution, st.imageQuality);
    /** @type {ReturnType<typeof showStatus>|null} */
    let status = null;

    try {
        status = showStatus({
            title: 'ComfyVideo',
            message: regenerationMedia
                ? 'Preparing image regeneration…'
                : `Building ${promptVariant.label.toLowerCase()} prompt…`,
            onStop: () => comfy.interrupt(st.comfyUrl),
        });

        // Quick Regen must replay the selected image's actual Comfy request,
        // not ask the LLM to describe the scene again. The saved prompt is
        // already the final, style-appended prompt sent to ComfyUI.
        let imagePrompt = regenerationMedia
            ? String(savedRecipe?.imagePrompt || regenerationMedia.title || '').trim()
            : await prompts.buildImagePrompt(st, {
                signal: status.signal,
                targetMessage,
            });
        if (!regenerationMedia) imagePrompt = appendVisualStyle(imagePrompt, st);
        if (regenerationMedia && !imagePrompt) {
            throw new Error('This gallery image has no saved ComfyVideo prompt and cannot be regenerated.');
        }
        if (status.aborted) throw new DOMException('Aborted', 'AbortError');

        if (st.confirmImagePrompt && !skipPromptConfirmation) {
            status.close();
            status = null;
            const edited = await previewPrompt(`Edit ${promptVariant.label.toLowerCase()} prompt, then generate`, imagePrompt, 'Generate');
            if (edited === null) return;
            if (!edited) {
                toastr.warning('Empty prompt cancelled.');
                return;
            }
            imagePrompt = edited;
            status = showStatus({
                title: 'ComfyVideo',
                message: 'Generating image in ComfyUI…',
                onStop: () => comfy.interrupt(st.comfyUrl),
            });
        } else {
            status.setMessage('Generating image in ComfyUI…');
        }

        const clientId = newClientId();
        status.watchComfy(st.comfyUrl, clientId);
        status.setProgress(null);

        const nodes = parseWorkflow(imageWorkflow);
        validateWorkflow(nodes, 'image');
        const seed = resolveSeed(st);
        const filled = fillPlaceholders(nodes, {
            prompt: imagePrompt,
            negative_prompt: st.negativePrompt,
            seed,
            width: dims.width,
            height: dims.height,
        });
        const result = await comfy.generate(st.comfyUrl, wrapPromptBody(filled, clientId), status.signal);

        status.setMessage('Saving…');
        status.setProgress(100);

        const charName = ctx.name2 || 'ComfyVideo';
        const path = await saveBase64AsFile(result.data, charName, `ComfyVideo_${humanizedDateTime()}`, result.format);

        await attachGeneratedMedia({
            context: ctx,
            url: path,
            format: result.format,
            prompt: imagePrompt,
            meta: {
                imagePrompt,
                imagePromptKind: promptVariant.kind,
                imagePromptPresetId: promptVariant.id,
                imagePromptPresetName: promptVariant.name,
                imageWorkflow,
                imageWorkflowId: savedRecipe?.imageWorkflowId || st.activeImageWorkflowId,
                imageWorkflowName: savedRecipe?.imageWorkflowName
                    || findItem(st.libraries.imageWorkflows, st.activeImageWorkflowId)?.name
                    || '',
                seed,
                step: 'image',
                sourceMessageId: targetMessage ? ctx.chat.indexOf(targetMessage) : undefined,
                width: dims.width,
                height: dims.height,
            },
            attachMode: regenerationMedia
                ? 'same'
                : (targetMessage ? 'after' : (st.attachImageMode === 'new' ? 'new' : 'last')),
            insertAfterMessage: targetMessage,
            sourceChatId,
            appendMediaToMessage,
            eventSource,
            event_types,
            getMessageTimeStamp,
            systemUserName,
        });

        toastr.success(regenerationMedia
            ? 'Image regeneration added to this gallery.'
            : `${promptVariant.label} image attached.`, 'ComfyVideo');
        injectMessageActions();
    } catch (e) {
        if (isAbortError(e)) toastr.info('Stopped.', 'ComfyVideo');
        else {
            console.error(LOG, e);
            toastr.error(String(e.message || e), 'ComfyVideo');
        }
    } finally {
        status?.close();
        busy = false;
    }
}

/**
 * @param {number} messageId
 */
async function generateVideoForMessage(messageId) {
    const st = getSettings();
    if (!st.enabled) {
        toastr.warning('ComfyVideo is disabled.');
        return;
    }
    if (busy) {
        toastr.info('ComfyVideo is already working.');
        return;
    }
    if (!st.i2vWorkflow?.trim()) {
        toastr.error('Add an I2V workflow (library → Edit / Save as…).');
        return;
    }

    const ctx = getContext();
    const sourceChatId = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : null;
    const message = ctx.chat[messageId];
    if (!message) {
        toastr.error('Message not found.');
        return;
    }
    const imageUrl = getMessageImageUrl(message);
    if (!imageUrl) {
        toastr.error('No image on this message to animate.');
        return;
    }

    const alignedFrames = alignH3FrameCount(st.frames);
    if (alignedFrames !== Number(st.frames)) {
        st.frames = alignedFrames;
        saveSettings();
        panel?.refresh();
        applySettingsToUi();
    }

    busy = true;
    const dims = resolveVideoDimensions(st, message);
    /** @type {ReturnType<typeof showStatus>|null} */
    let status = null;
    const sourceImagePrompt = message.extra?.comfyVideo?.imagePrompt || '';

    try {
        status = showStatus({
            title: 'ComfyVideo I2V',
            message: 'Building motion prompt (LLM)…',
            onStop: () => comfy.interrupt(st.comfyUrl),
        });

        let motionPrompt = await prompts.buildMotionPrompt(st, {
            sourceImagePrompt,
            signal: status.signal,
            targetMessage: message,
        });
        motionPrompt = appendMotionVisualStyle(motionPrompt, st);
        if (status.aborted) throw new DOMException('Aborted', 'AbortError');

        if (st.confirmMotionPrompt) {
            status.close();
            status = null;
            const edited = await previewPrompt('Edit motion prompt, then generate video', motionPrompt, 'Generate Video');
            if (edited === null) return;
            motionPrompt = edited || motionPrompt;
            status = showStatus({
                title: 'ComfyVideo I2V',
                message: 'Uploading source image…',
                onStop: () => comfy.interrupt(st.comfyUrl),
            });
        } else {
            status.setMessage('Uploading source image…');
        }

        const blob = await comfy.fetchImageBlob(imageUrl, status.signal);
        const uploaded = await comfy.uploadImage(st.comfyUrl, blob, `comfyvideo_${Date.now()}.png`, status.signal);
        const imageName = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;

        status.setMessage('Generating video in ComfyUI…');
        const clientId = newClientId();
        status.watchComfy(st.comfyUrl, clientId);
        status.setProgress(null);

        const seed = resolveSeed(st);
        const placeholders = {
            prompt: motionPrompt,
            negative_prompt: st.negativePrompt,
            seed,
            frames: st.frames,
            fps: st.fps,
            width: dims.width,
            height: dims.height,
            image: imageName,
            image_name: uploaded.name,
            image_subfolder: uploaded.subfolder || '',
        };

        const nodes = parseWorkflow(st.i2vWorkflow);
        validateWorkflow(nodes, 'i2v').forEach(w => console.warn(LOG, w));
        const result = await comfy.generate(
            st.comfyUrl,
            wrapPromptBody(fillPlaceholders(nodes, placeholders), clientId),
            status.signal,
        );

        status.setMessage('Saving…');
        status.setProgress(100);

        const path = await saveBase64AsFile(
            result.data,
            ctx.name2 || 'ComfyVideo',
            `ComfyVideo_I2V_${humanizedDateTime()}`,
            result.format,
        );

        const meta = {
            motionPrompt,
            seed,
            step: 'i2v',
            sourceMessageId: ctx.chat.indexOf(message),
            frames: st.frames,
            fps: st.fps,
            width: dims.width,
            height: dims.height,
        };

        await attachGeneratedMedia({
            context: ctx,
            url: path,
            format: result.format,
            prompt: motionPrompt,
            meta,
            attachMode: 'after',
            insertAfterMessage: message,
            sourceChatId,
            appendMediaToMessage,
            eventSource,
            event_types,
            getMessageTimeStamp,
            systemUserName,
        });

        toastr.success(`${isVideoFormat(result.format) ? 'Video' : 'Output'} attached.`, 'ComfyVideo');
        injectMessageActions();
    } catch (e) {
        if (isAbortError(e)) toastr.info('Stopped.', 'ComfyVideo');
        else {
            console.error(LOG, e);
            toastr.error(String(e.message || e), 'ComfyVideo');
        }
    } finally {
        status?.close();
        busy = false;
    }
}

function createMessageAction(className, iconClass, title, onClick) {
    const button = document.createElement('div');
    button.className = `mes_button ${className} ${iconClass} interactable`;
    button.title = title;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', title);
    button.setAttribute('tabindex', '0');
    button.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    button.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        button.click();
    });
    return button;
}

function injectMessageActions() {
    const st = getSettings();
    if (!st.enabled) return;
    const ctx = getContext();
    document.querySelectorAll('#chat .mes').forEach(mesEl => {
        const id = Number(mesEl.getAttribute('mesid'));
        if (Number.isNaN(id)) return;
        const message = ctx.chat[id];
        if (!message) return;
        const buttons = mesEl.querySelector('.mes_buttons');
        if (!buttons) return;

        if (!buttons.querySelector('.comfyvideo-message-panel-btn')) {
            const button = createMessageAction(
                'comfyvideo-message-panel-btn',
                'fa-solid fa-clapperboard',
                'ComfyVideo: open image and video generator for this message',
                () => panel?.open({ targetMessage: message }).catch(err => {
                    console.error(LOG, err);
                    toastr.error(String(err.message || err), 'ComfyVideo');
                }),
            );
            buttons.prepend(button);
        }

        if (!buttons.querySelector('.comfyvideo-quick-gen-btn')) {
            const button = createMessageAction(
                'comfyvideo-quick-gen-btn',
                'fa-solid fa-bolt',
                isComfyVideoMessage(message)
                    ? 'ComfyVideo: quickly regenerate the selected gallery image'
                    : 'ComfyVideo: quick generate whole-scene image for this message',
                () => {
                    const media = message.extra?.media;
                    const selectedIndex = Number(message.extra?.media_index);
                    const selectedMedia = Array.isArray(media)
                        ? (media[selectedIndex] || media[media.length - 1])
                        : null;
                    const regenerationMedia = selectedMedia?.comfyVideo && !isVideoFormat(selectedMedia.type)
                        ? selectedMedia
                        : null;
                    return generateSceneImage('scene', {
                        targetMessage: message,
                        regenerationMedia,
                        // A gallery regeneration should honor the normal
                        // prompt-preview preference; ordinary Quick Generate
                        // remains a one-tap action.
                        skipPromptConfirmation: !regenerationMedia,
                    }).catch(err => {
                        console.error(LOG, err);
                        toastr.error(String(err.message || err), 'ComfyVideo');
                    });
                },
            );
            buttons.prepend(button);
        }

        if (!isComfyVideoMessage(message) || !getMessageImageUrl(message)) return;
        if (buttons.querySelector('.comfyvideo-i2v-btn')) return;
        const button = createMessageAction(
            'comfyvideo-i2v-btn',
            'fa-solid fa-film',
            'ComfyVideo: Generate Video (I2V)',
            () => generateVideoForMessage(id).catch(err => {
                console.error(LOG, err);
                toastr.error(String(err.message || err), 'ComfyVideo');
            }),
        );
        buttons.prepend(button);
    });
}

function setupMessageHooks() {
    const events = [
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.USER_MESSAGE_RENDERED,
        event_types.MESSAGE_UPDATED,
        event_types.MESSAGE_SWIPED,
        event_types.MORE_MESSAGES_LOADED,
        event_types.CHAT_CHANGED,
    ].filter(Boolean);
    for (const ev of events) {
        eventSource.on(ev, () => setTimeout(injectMessageActions, 50));
    }
    setTimeout(injectMessageActions, 500);
}

jQuery(async () => {
    console.info(LOG, 'Loading…');
    getSettings();
    try {
        await addBundledWorkflows();
    } catch (err) {
        console.warn(LOG, 'Bundled workflows were not loaded', err);
    }
    comfy = createComfyClient(getRequestHeaders);
    prompts = createPromptBuilder({
        getContext,
        generateQuietPrompt,
        ConnectionManagerRequestService,
    });
    panel = createPanel({
        getSettings,
        saveSettings,
        syncSettingsUi: () => {
            applySettingsToUi();
            refreshLibraryDropdowns();
            updateClipLengthHint();
        },
        generateSceneImage,
        generateVideoForMessage,
        getContext,
        isComfyVideoMessage,
        getMessageImageUrl,
        extName: EXT_NAME,
    });
    await loadSettingsHtml();
    addWandButton();
    registerSlashCommands();
    setupMessageHooks();
    console.info(LOG, 'Ready');
});
