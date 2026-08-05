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
import { callGenericPopup, Popup, POPUP_TYPE } from '../../../popup.js';
import { ConnectionManagerRequestService } from '../../shared.js';

import { createComfyClient } from './lib/comfy-client.js';
import {
    parseWorkflow,
    fillPlaceholders,
    validateWorkflow,
    wrapPromptBody,
    resolveDimensions,
} from './lib/workflow.js';
import { createPromptBuilder } from './lib/prompt-builder.js';
import {
    attachGeneratedMedia,
    attachVideoToMessage,
    getMessageImageUrl,
    isComfyVideoMessage,
    isVideoFormat,
} from './lib/media.js';
import { showStatus, newClientId, isAbortError } from './lib/status-ui.js';
import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
    clipTiming,
} from './lib/defaults.js';
import {
    ensureLibraries,
    findItem,
    overwriteItem,
    addItem,
    removeItem,
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
    realistic: 'Photorealistic cinematic still, natural adult anatomy, credible skin texture, realistic practical lighting, detailed environment, coherent depth and perspective.',
    western_comic: 'Western graphic-novel illustration, realistic adult proportions, expressive natural faces, controlled ink contours, painted shading, textured brushwork, cinematic panel composition, no anime or manga styling.',
});

const defaultSettings = Object.freeze({
    enabled: true,
    comfyUrl: 'http://127.0.0.1:8188',
    resolution: 'portrait',

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
    frames: 16,
    fps: 8,
    motionPromptTemplate: DEFAULT_MOTION_PROMPT_TEMPLATE,
    confirmMotionPrompt: true,
    seedMode: 'random',
    fixedSeed: 0,
    negativePrompt: 'blurry, static, low quality, text, watermark',
    imageStylePreset: 'realistic',
    customImageStyle: '',
    installedBundledWorkflowVersions: {},

    attachImageMode: 'last',
    attachVideoMode: 'same',

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
    if (!['realistic', 'western_comic', 'custom'].includes(st.imageStylePreset)) {
        st.imageStylePreset = defaultSettings.imageStylePreset;
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

async function addBundledWorkflows(restore = false) {
    const settings = getSettings();
    const bundled = await loadBundledWorkflows(EXT_NAME);
    const added = seedBundledWorkflows(settings, bundled, restore);
    if (added) saveSettings();
    return added;
}

function resolveSeed(settings) {
    if (settings.seedMode === 'fixed') return Number(settings.fixedSeed) || 0;
    return Math.floor(Math.random() * 2 ** 32);
}

function appendImageStyle(prompt, settings) {
    const scene = String(prompt || '').trim();
    const style = settings.imageStylePreset === 'custom'
        ? String(settings.customImageStyle || '').trim()
        : (IMAGE_STYLE_PROMPTS[settings.imageStylePreset] || '');
    return style ? `${scene}\n\nVisual style: ${style}` : scene;
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
        ['comfyvideo_motion_prompt_template', 'motionPromptTemplate', 'value'],
        ['comfyvideo_confirm_motion', 'confirmMotionPrompt', 'checked'],
        ['comfyvideo_seed_mode', 'seedMode', 'value'],
        ['comfyvideo_fixed_seed', 'fixedSeed', 'number'],
        ['comfyvideo_negative', 'negativePrompt', 'value'],
        ['comfyvideo_image_style', 'imageStylePreset', 'value'],
        ['comfyvideo_custom_image_style', 'customImageStyle', 'value'],
        ['comfyvideo_attach_image', 'attachImageMode', 'value'],
        ['comfyvideo_attach_video', 'attachVideoMode', 'value'],
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
    set('comfyvideo_attach_video', st.attachVideoMode);
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
    const edited = await callGenericPopup(
        title,
        POPUP_TYPE.INPUT,
        initial,
        { okButton: okLabel, cancelButton: 'Cancel', rows: 10, wide: true },
    );
    if (edited === false || edited === null || edited === undefined) return null;
    return String(edited).trim();
}

async function generateSceneImage() {
    const st = getSettings();
    if (!st.enabled) {
        toastr.warning('ComfyVideo is disabled in settings.');
        return;
    }
    if (busy) {
        toastr.info('ComfyVideo is already working.');
        return;
    }
    if (!st.imageWorkflow?.trim()) {
        toastr.error('Add an Image workflow (library → Edit / Save as…).');
        return;
    }

    busy = true;
    const dims = resolveDimensions(st.resolution);
    /** @type {ReturnType<typeof showStatus>|null} */
    let status = null;

    try {
        status = showStatus({
            title: 'ComfyVideo',
            message: 'Building image prompt…',
            onStop: () => comfy.interrupt(st.comfyUrl),
        });

        let imagePrompt = await prompts.buildImagePrompt(st, status.signal);
        imagePrompt = appendImageStyle(imagePrompt, st);
        if (status.aborted) throw new DOMException('Aborted', 'AbortError');

        if (st.confirmImagePrompt) {
            status.close();
            status = null;
            const edited = await previewPrompt('Edit image prompt, then generate', imagePrompt, 'Generate');
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

        const nodes = parseWorkflow(st.imageWorkflow);
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

        const ctx = getContext();
        const charName = ctx.name2 || 'ComfyVideo';
        const path = await saveBase64AsFile(result.data, charName, `ComfyVideo_${humanizedDateTime()}`, result.format);

        await attachGeneratedMedia({
            context: ctx,
            url: path,
            format: result.format,
            prompt: imagePrompt,
            meta: {
                imagePrompt,
                seed,
                step: 'image',
                width: dims.width,
                height: dims.height,
            },
            attachMode: st.attachImageMode === 'new' ? 'new' : 'last',
            appendMediaToMessage,
            eventSource,
            event_types,
            getMessageTimeStamp,
            systemUserName,
        });

        toastr.success('Scene image attached.', 'ComfyVideo');
        injectI2vButtons();
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

    busy = true;
    const dims = resolveDimensions(st.resolution);
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
        });
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
            frames: st.frames,
            fps: st.fps,
            width: dims.width,
            height: dims.height,
        };

        if (st.attachVideoMode === 'new') {
            await attachGeneratedMedia({
                context: ctx,
                url: path,
                format: result.format,
                prompt: motionPrompt,
                meta,
                attachMode: 'new',
                appendMediaToMessage,
                eventSource,
                event_types,
                getMessageTimeStamp,
                systemUserName,
            });
        } else {
            await attachVideoToMessage({
                context: ctx,
                messageId,
                url: path,
                format: result.format,
                prompt: motionPrompt,
                meta,
                appendMediaToMessage,
            });
        }

        toastr.success(`${isVideoFormat(result.format) ? 'Video' : 'Output'} attached.`, 'ComfyVideo');
        injectI2vButtons();
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

function injectI2vButtons() {
    const st = getSettings();
    if (!st.enabled) return;
    const ctx = getContext();
    document.querySelectorAll('#chat .mes').forEach(mesEl => {
        const id = Number(mesEl.getAttribute('mesid'));
        if (Number.isNaN(id)) return;
        const message = ctx.chat[id];
        if (!message || !isComfyVideoMessage(message)) return;
        if (!getMessageImageUrl(message)) return;
        const buttons = mesEl.querySelector('.mes_buttons');
        if (!buttons || buttons.querySelector('.comfyvideo-i2v-btn')) return;
        const btn = document.createElement('div');
        btn.className = 'mes_button comfyvideo-i2v-btn fa-solid fa-film interactable';
        btn.title = 'ComfyVideo: Generate Video (I2V)';
        btn.setAttribute('tabindex', '0');
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            generateVideoForMessage(id).catch(err => {
                console.error(LOG, err);
                toastr.error(String(err.message || err), 'ComfyVideo');
            });
        });
        buttons.prepend(btn);
    });
}

function setupMessageHooks() {
    const events = [
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.USER_MESSAGE_RENDERED,
        event_types.MESSAGE_UPDATED,
        event_types.MESSAGE_SWIPED,
        event_types.CHAT_CHANGED,
    ].filter(Boolean);
    for (const ev of events) {
        eventSource.on(ev, () => setTimeout(injectI2vButtons, 50));
    }
    setTimeout(injectI2vButtons, 500);
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
