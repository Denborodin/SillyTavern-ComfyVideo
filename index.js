/**
 * ComfyVideo – SillyTavern UI extension
 * Scene image (T2I) → per-message I2V, via local ComfyUI.
 * Settings are fully separate from the built-in Image Generation extension.
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
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { ConnectionManagerRequestService } from '../../shared.js';

import { createComfyClient } from './lib/comfy-client.js';
import { parseWorkflow, fillPlaceholders, validateWorkflow, wrapPromptBody } from './lib/workflow.js';
import { createPromptBuilder } from './lib/prompt-builder.js';
import {
    attachGeneratedMedia,
    attachVideoToMessage,
    getMessageImageUrl,
    isComfyVideoMessage,
    isVideoFormat,
} from './lib/media.js';

const MODULE = 'ComfyVideo';
const LOG = '[ComfyVideo]';
const EXT_NAME = 'ComfyVideo'; // folder name under third-party / user extensions

const DEFAULT_IMAGE_PROMPT_TEMPLATE =
    'You are an expert image prompt engineer for anime/illustration stills. ' +
    'From the scene context, write ONE detailed image generation prompt: composition, characters, pose, clothing, ' +
    'expression, lighting, environment, camera angle, art style. Output only the prompt text.';

const defaultSettings = Object.freeze({
    enabled: true,
    comfyUrl: 'http://127.0.0.1:8188',

    imageWorkflow: '',
    contextMessages: 5,
    includeCharacter: true,
    confirmImagePrompt: true,
    imageWidth: 832,
    imageHeight: 1216,
    imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,

    promptMode: 'profile',
    llmProfileId: '',
    maxPromptTokens: 400,
    manualImagePrompt: '',

    i2vWorkflow: '',
    frames: 16,
    fps: 8,
    motionPromptMode: 'fixed',
    fixedMotionPrompt: 'subtle natural movement, gentle camera motion',
    seedMode: 'random',
    fixedSeed: 0,
    negativePrompt: 'blurry, static, low quality, text, watermark',
    imageInputMode: 'upload',

    attachImageMode: 'last',
    attachVideoMode: 'same',
});

/** @type {ReturnType<typeof createComfyClient>} */
let comfy;
/** @type {ReturnType<typeof createPromptBuilder>} */
let prompts;
let busy = false;

function getSettings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE];
}

function saveSettings() {
    saveSettingsDebounced();
}

function resolveSeed(settings) {
    if (settings.seedMode === 'fixed') {
        return Number(settings.fixedSeed) || 0;
    }
    return Math.floor(Math.random() * 2 ** 32);
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
        // Fallback: fetch settings.html relative to this extension
        const res = await fetch(`/scripts/extensions/third-party/${EXT_NAME}/settings.html`);
        html = await res.text();
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    container.append(wrap);

    bindSettingsUi();
    applySettingsToUi();
    populateProfileDropdown();
}

function bindSettingsUi() {
    const s = () => getSettings();
    const map = [
        ['comfyvideo_enabled', 'enabled', 'checked'],
        ['comfyvideo_comfy_url', 'comfyUrl', 'value'],
        ['comfyvideo_prompt_mode', 'promptMode', 'value'],
        ['comfyvideo_llm_profile', 'llmProfileId', 'value'],
        ['comfyvideo_max_prompt_tokens', 'maxPromptTokens', 'number'],
        ['comfyvideo_manual_prompt', 'manualImagePrompt', 'value'],
        ['comfyvideo_image_workflow', 'imageWorkflow', 'value'],
        ['comfyvideo_context_messages', 'contextMessages', 'number'],
        ['comfyvideo_include_character', 'includeCharacter', 'checked'],
        ['comfyvideo_confirm_prompt', 'confirmImagePrompt', 'checked'],
        ['comfyvideo_image_width', 'imageWidth', 'number'],
        ['comfyvideo_image_height', 'imageHeight', 'number'],
        ['comfyvideo_image_prompt_template', 'imagePromptTemplate', 'value'],
        ['comfyvideo_i2v_workflow', 'i2vWorkflow', 'value'],
        ['comfyvideo_frames', 'frames', 'number'],
        ['comfyvideo_fps', 'fps', 'number'],
        ['comfyvideo_motion_mode', 'motionPromptMode', 'value'],
        ['comfyvideo_fixed_motion', 'fixedMotionPrompt', 'value'],
        ['comfyvideo_seed_mode', 'seedMode', 'value'],
        ['comfyvideo_fixed_seed', 'fixedSeed', 'number'],
        ['comfyvideo_negative', 'negativePrompt', 'value'],
        ['comfyvideo_image_input_mode', 'imageInputMode', 'value'],
        ['comfyvideo_attach_image', 'attachImageMode', 'value'],
        ['comfyvideo_attach_video', 'attachVideoMode', 'value'],
    ];

    for (const [id, key, kind] of map) {
        const el = document.getElementById(id);
        if (!el) continue;
        const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            const st = s();
            if (kind === 'checked') {
                st[key] = /** @type {HTMLInputElement} */ (el).checked;
            } else if (kind === 'number') {
                st[key] = Number(/** @type {HTMLInputElement} */ (el).value);
            } else {
                st[key] = /** @type {HTMLInputElement} */ (el).value;
            }
            saveSettings();
        });
    }

    document.getElementById('comfyvideo_test_btn')?.addEventListener('click', onTestConnection);
    document.getElementById('comfyvideo_reset_btn')?.addEventListener('click', () => {
        extension_settings[MODULE] = structuredClone(defaultSettings);
        saveSettings();
        applySettingsToUi();
        populateProfileDropdown();
        toastr.info('ComfyVideo settings reset.');
    });
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
    set('comfyvideo_prompt_mode', st.promptMode);
    set('comfyvideo_llm_profile', st.llmProfileId);
    set('comfyvideo_max_prompt_tokens', st.maxPromptTokens);
    set('comfyvideo_manual_prompt', st.manualImagePrompt);
    set('comfyvideo_image_workflow', st.imageWorkflow);
    set('comfyvideo_context_messages', st.contextMessages);
    set('comfyvideo_include_character', st.includeCharacter, 'checked');
    set('comfyvideo_confirm_prompt', st.confirmImagePrompt, 'checked');
    set('comfyvideo_image_width', st.imageWidth);
    set('comfyvideo_image_height', st.imageHeight);
    set('comfyvideo_image_prompt_template', st.imagePromptTemplate);
    set('comfyvideo_i2v_workflow', st.i2vWorkflow);
    set('comfyvideo_frames', st.frames);
    set('comfyvideo_fps', st.fps);
    set('comfyvideo_motion_mode', st.motionPromptMode);
    set('comfyvideo_fixed_motion', st.fixedMotionPrompt);
    set('comfyvideo_seed_mode', st.seedMode);
    set('comfyvideo_fixed_seed', st.fixedSeed);
    set('comfyvideo_negative', st.negativePrompt);
    set('comfyvideo_image_input_mode', st.imageInputMode);
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
        else toastr.error('ComfyUI ping failed. Is Comfy running at the URL?', 'ComfyVideo');
    } catch (e) {
        if (status) {
            status.textContent = 'Error';
            status.className = 'comfyvideo-status err';
        }
        toastr.error(String(e.message || e), 'ComfyVideo');
    }
}

function addWandButton() {
    const container = document.getElementById('sd_wand_container')
        || document.getElementById('extensionsMenu')
        || document.querySelector('#extensions_menu')
        || document.getElementById('leftSendForm');

    // Prefer Extensions menu (wand)
    const extensionsMenu = document.getElementById('extensionsMenu');
    const target = extensionsMenu || container;
    if (!target) {
        console.warn(LOG, 'No menu container for wand button');
        return;
    }
    if (document.getElementById('comfyvideo_wand_button')) return;

    const btn = document.createElement('div');
    btn.id = 'comfyvideo_wand_button';
    btn.className = 'list-group-item flex-container flexGap5';
    btn.title = 'ComfyVideo: Generate Scene Image';
    btn.innerHTML = '<div class="fa-solid fa-clapperboard extensionsMenuExtensionButton"></div><span>Generate Scene Image</span>';
    btn.addEventListener('click', () => {
        const close = document.getElementById('extensionsMenuButton');
        // best-effort close menu
        void close;
        generateSceneImage().catch(err => {
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
        helpString: 'ComfyVideo: generate a scene still image from recent chat (then use Generate Video on the message).',
    }));
}

/**
 * Step 1 – scene image
 */
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
        toastr.error('Paste an Image workflow (API JSON) in ComfyVideo settings.');
        return;
    }

    busy = true;
    const toast = toastr.info('Building image prompt…', 'ComfyVideo', { timeOut: 0, extendedTimeOut: 0 });
    try {
        let imagePrompt = await prompts.buildImagePrompt(st);

        if (st.confirmImagePrompt) {
            toastr.clear(toast);
            const edited = await callGenericPopup(
                'Edit image prompt, then generate',
                POPUP_TYPE.INPUT,
                imagePrompt,
                { okButton: 'Generate', cancelButton: 'Cancel', rows: 10, wide: true },
            );
            // INPUT: string on OK, false on cancel, null on dismiss
            if (edited === false || edited === null || edited === undefined) {
                busy = false;
                return;
            }
            imagePrompt = String(edited).trim();
            if (!imagePrompt) {
                toastr.warning('Empty prompt cancelled.');
                busy = false;
                return;
            }
        }

        toastr.clear(toast);
        const genToast = toastr.info('Generating image in ComfyUI…', 'ComfyVideo', { timeOut: 0, extendedTimeOut: 0 });

        const nodes = parseWorkflow(st.imageWorkflow);
        validateWorkflow(nodes, 'image');
        const seed = resolveSeed(st);
        const filled = fillPlaceholders(nodes, {
            prompt: imagePrompt,
            negative_prompt: st.negativePrompt,
            seed,
            width: st.imageWidth,
            height: st.imageHeight,
        });
        const body = wrapPromptBody(filled);
        const result = await comfy.generate(st.comfyUrl, body);

        const ctx = getContext();
        const charName = ctx.name2 || 'ComfyVideo';
        const filename = `ComfyVideo_${humanizedDateTime()}`;
        const path = await saveBase64AsFile(result.data, charName, filename, result.format);

        await attachGeneratedMedia({
            context: ctx,
            url: path,
            format: result.format,
            prompt: imagePrompt,
            meta: {
                imagePrompt,
                seed,
                step: 'image',
                workflow: 'image',
            },
            attachMode: st.attachImageMode === 'new' ? 'new' : 'last',
            appendMediaToMessage,
            eventSource,
            event_types,
            getMessageTimeStamp,
            systemUserName,
        });

        toastr.clear(genToast);
        toastr.success('Scene image attached. Use Generate Video on the message for I2V.', 'ComfyVideo');
        injectI2vButtons();
    } catch (e) {
        console.error(LOG, e);
        toastr.error(String(e.message || e), 'ComfyVideo');
    } finally {
        toastr.clear(toast);
        busy = false;
    }
}

/**
 * Step 2 – I2V for a message
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
        toastr.error('Paste an I2V workflow (API JSON) in ComfyVideo settings.');
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
    try {
        let motionPrompt = await prompts.buildMotionPrompt(st);
        if (st.motionPromptMode === 'ask') {
            const edited = await callGenericPopup(
                'Motion prompt for I2V',
                POPUP_TYPE.INPUT,
                motionPrompt,
                { okButton: 'Generate Video', cancelButton: 'Cancel', rows: 6, wide: true },
            );
            if (edited === false || edited === null || edited === undefined) {
                busy = false;
                return;
            }
            motionPrompt = String(edited).trim() || motionPrompt;
        }

        const genToast = toastr.info('Preparing I2V (upload + ComfyUI)…', 'ComfyVideo', { timeOut: 0, extendedTimeOut: 0 });

        const blob = await comfy.fetchImageBlob(imageUrl);
        const seed = resolveSeed(st);
        /** @type {Record<string, string|number>} */
        const placeholders = {
            prompt: motionPrompt,
            negative_prompt: st.negativePrompt,
            seed,
            frames: st.frames,
            fps: st.fps,
            width: st.imageWidth,
            height: st.imageHeight,
        };

        if (st.imageInputMode === 'base64') {
            placeholders.image_base64 = await comfy.blobToBase64(blob);
            placeholders.image = placeholders.image_base64;
        } else {
            // Primary: Comfy upload
            try {
                const uploaded = await comfy.uploadImage(st.comfyUrl, blob, `comfyvideo_${Date.now()}.png`);
                placeholders.image = uploaded.subfolder
                    ? `${uploaded.subfolder}/${uploaded.name}`
                    : uploaded.name;
                placeholders.image_name = uploaded.name;
                placeholders.image_subfolder = uploaded.subfolder || '';
            } catch (uploadErr) {
                console.warn(LOG, 'Upload failed, trying base64 fallback', uploadErr);
                toastr.warning('Comfy upload failed (CORS?). Falling back to base64.', 'ComfyVideo');
                placeholders.image_base64 = await comfy.blobToBase64(blob);
                placeholders.image = placeholders.image_base64;
            }
        }

        const nodes = parseWorkflow(st.i2vWorkflow);
        const warnings = validateWorkflow(nodes, 'i2v');
        warnings.forEach(w => console.warn(LOG, w));

        const filled = fillPlaceholders(nodes, placeholders);
        const body = wrapPromptBody(filled);
        toastr.clear(genToast);
        const runToast = toastr.info('Generating video in ComfyUI…', 'ComfyVideo', { timeOut: 0, extendedTimeOut: 0 });
        const result = await comfy.generate(st.comfyUrl, body);
        toastr.clear(runToast);

        const charName = ctx.name2 || 'ComfyVideo';
        const filename = `ComfyVideo_I2V_${humanizedDateTime()}`;
        const path = await saveBase64AsFile(result.data, charName, filename, result.format);

        const meta = {
            motionPrompt,
            seed,
            step: 'i2v',
            frames: st.frames,
            fps: st.fps,
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

        const kind = isVideoFormat(result.format) ? 'Video' : 'Output';
        toastr.success(`${kind} attached.`, 'ComfyVideo');
        injectI2vButtons();
    } catch (e) {
        console.error(LOG, e);
        toastr.error(String(e.message || e), 'ComfyVideo');
    } finally {
        busy = false;
    }
}

/**
 * Inject "Generate Video" into message action bars for ComfyVideo-tagged messages.
 */
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
        if (!buttons) return;
        if (buttons.querySelector('.comfyvideo-i2v-btn')) return;

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
        eventSource.on(ev, () => {
            setTimeout(injectI2vButtons, 50);
        });
    }
    // initial
    setTimeout(injectI2vButtons, 500);
}

jQuery(async () => {
    console.info(LOG, 'Loading…');
    getSettings();
    comfy = createComfyClient(getRequestHeaders);
    prompts = createPromptBuilder({
        getContext,
        generateQuietPrompt,
        ConnectionManagerRequestService,
    });

    await loadSettingsHtml();
    addWandButton();
    registerSlashCommands();
    setupMessageHooks();
    console.info(LOG, 'Ready');
});
