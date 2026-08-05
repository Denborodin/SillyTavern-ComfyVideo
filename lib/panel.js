/**
 * Pathweaver-style floating generation panel for ComfyVideo.
 */

import { clipTiming } from './defaults.js';

/**
 * @param {object} api
 * @param {() => object} api.getSettings
 * @param {() => void} api.saveSettings
 * @param {() => void} api.syncSettingsUi  refresh extension settings form if open
 * @param {() => Promise<void>} api.generateSceneImage
 * @param {() => Promise<void>} api.generateSceneVideo
 * @param {(messageId: number) => Promise<void>} api.generateVideoForMessage
 * @param {() => any} api.getContext
 * @param {(msg: any) => boolean} api.isComfyVideoMessage
 * @param {(msg: any) => string|null} api.getMessageImageUrl
 * @param {string} api.extName folder name for template fetch
 */
export function createPanel(api) {
    /** @type {HTMLElement|null} */
    let overlay = null;
    let bound = false;

    async function ensureDom() {
        if (overlay && document.body.contains(overlay)) return overlay;

        let html;
        try {
            const res = await fetch(`/scripts/extensions/third-party/${api.extName}/panel.html`);
            html = await res.text();
        } catch (e) {
            console.error('[ComfyVideo] panel.html load failed', e);
            throw e;
        }

        const wrap = document.createElement('div');
        wrap.innerHTML = html.trim();
        overlay = /** @type {HTMLElement} */ (wrap.firstElementChild);
        document.body.appendChild(overlay);
        bindOnce();
        return overlay;
    }

    function bindOnce() {
        if (bound || !overlay) return;
        bound = true;

        overlay.querySelector('#comfyvideo_panel_close')?.addEventListener('click', close);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', onKey);

        // Resolution segment
        overlay.querySelectorAll('#comfyvideo_panel_resolution .cv_seg_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const st = api.getSettings();
                st.resolution = btn.getAttribute('data-value') || 'portrait';
                api.saveSettings();
                paintResolution();
                api.syncSettingsUi?.();
            });
        });

        // Length presets
        overlay.querySelectorAll('#comfyvideo_panel_length .cv_seg_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = Number(btn.getAttribute('data-seconds'));
                const fps = Number(btn.getAttribute('data-fps')) || 8;
                const st = api.getSettings();
                st.fps = fps;
                st.frames = Math.max(1, Math.round(seconds * fps));
                api.saveSettings();
                paintLength();
                api.syncSettingsUi?.();
            });
        });

        const framesEl = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#comfyvideo_panel_frames'));
        const fpsEl = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#comfyvideo_panel_fps'));
        framesEl?.addEventListener('input', () => {
            const st = api.getSettings();
            st.frames = Number(framesEl.value) || st.frames;
            api.saveSettings();
            paintLength(false);
            api.syncSettingsUi?.();
        });
        fpsEl?.addEventListener('input', () => {
            const st = api.getSettings();
            st.fps = Number(fpsEl.value) || st.fps;
            api.saveSettings();
            paintLength(false);
            api.syncSettingsUi?.();
        });

        // Library selects
        wireSelect('comfyvideo_panel_image_wf', 'imageWorkflows', 'activeImageWorkflowId', 'imageWorkflow', 'json');
        wireSelect('comfyvideo_panel_i2v_wf', 'i2vWorkflows', 'activeI2vWorkflowId', 'i2vWorkflow', 'json');
        wireSelect('comfyvideo_panel_image_prompt', 'imagePrompts', 'activeImagePromptId', 'imagePromptTemplate', 'template');
        wireSelect('comfyvideo_panel_motion_prompt', 'motionPrompts', 'activeMotionPromptId', 'motionPromptTemplate', 'template');

        const styleSelect = /** @type {HTMLSelectElement|null} */ (overlay.querySelector('#comfyvideo_panel_image_style'));
        const customStyle = /** @type {HTMLTextAreaElement|null} */ (overlay.querySelector('#comfyvideo_panel_custom_image_style'));
        styleSelect?.addEventListener('change', () => {
            const st = api.getSettings();
            st.imageStylePreset = styleSelect.value;
            api.saveSettings();
            paintStyle();
            api.syncSettingsUi?.();
        });
        customStyle?.addEventListener('input', () => {
            const st = api.getSettings();
            st.customImageStyle = customStyle.value;
            api.saveSettings();
            api.syncSettingsUi?.();
        });

        overlay.querySelector('#comfyvideo_panel_gen_image')?.addEventListener('click', async () => {
            close();
            try {
                await api.generateSceneImage();
            } catch (e) {
                console.error(e);
                toastr.error(String(e.message || e), 'ComfyVideo');
            }
        });

        overlay.querySelector('#comfyvideo_panel_gen_scene_video')?.addEventListener('click', async () => {
            close();
            try {
                await api.generateSceneVideo();
            } catch (e) {
                console.error(e);
                toastr.error(String(e.message || e), 'ComfyVideo');
            }
        });

        overlay.querySelector('#comfyvideo_panel_gen_video')?.addEventListener('click', async () => {
            const id = findLatestComfyVideoMessageId();
            if (id == null) {
                toastr.warning('No ComfyVideo still in this chat. Generate a scene image first.', 'ComfyVideo');
                return;
            }
            close();
            try {
                await api.generateVideoForMessage(id);
            } catch (e) {
                console.error(e);
                toastr.error(String(e.message || e), 'ComfyVideo');
            }
        });

        overlay.querySelector('#comfyvideo_panel_open_settings')?.addEventListener('click', () => {
            close();
            // Open ST extensions drawer and scroll to ComfyVideo
            const drawer = document.querySelector('#rm_extensions_block .inline-drawer-toggle, #extensions_settings .inline-drawer-toggle');
            const target = document.getElementById('comfyvideo_settings');
            if (target) {
                const header = target.querySelector('.inline-drawer-toggle');
                const content = target.querySelector('.inline-drawer-content');
                if (header && content && content.style.display === 'none') {
                    header.click();
                }
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // try open extensions panel
                document.getElementById('extensions-settings-button')?.click();
                setTimeout(() => {
                    document.getElementById('comfyvideo_settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
            void drawer;
        });
    }

    /**
     * @param {string} selectId
     * @param {string} listKey
     * @param {string} activeIdKey
     * @param {string} fieldKey
     * @param {'json'|'template'} contentKey
     */
    function wireSelect(selectId, listKey, activeIdKey, fieldKey, contentKey) {
        const sel = /** @type {HTMLSelectElement|null} */ (overlay?.querySelector(`#${selectId}`));
        if (!sel) return;
        sel.addEventListener('change', () => {
            const st = api.getSettings();
            const id = sel.value;
            st[activeIdKey] = id;
            if (id) {
                const item = st.libraries?.[listKey]?.find(x => x.id === id);
                if (item?.[contentKey] != null) {
                    st[fieldKey] = item[contentKey];
                }
            }
            api.saveSettings();
            api.syncSettingsUi?.();
        });
    }

    function onKey(e) {
        if (e.key === 'Escape' && overlay?.classList.contains('active')) {
            close();
        }
    }

    function fillSelect(selectId, list, activeId) {
        const sel = /** @type {HTMLSelectElement|null} */ (overlay?.querySelector(`#${selectId}`));
        if (!sel) return;
        sel.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = list?.length ? '(select…)' : '(empty — use Full settings)';
        sel.append(none);
        for (const item of list || []) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name;
            sel.append(opt);
        }
        sel.value = activeId && list?.some(x => x.id === activeId) ? activeId : '';
    }

    function paintResolution() {
        const st = api.getSettings();
        overlay?.querySelectorAll('#comfyvideo_panel_resolution .cv_seg_btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === st.resolution);
        });
    }

    function paintLength(updateInputs = true) {
        const st = api.getSettings();
        const { seconds, motionLines } = clipTiming(st.frames, st.fps);
        if (updateInputs) {
            const framesEl = /** @type {HTMLInputElement|null} */ (overlay?.querySelector('#comfyvideo_panel_frames'));
            const fpsEl = /** @type {HTMLInputElement|null} */ (overlay?.querySelector('#comfyvideo_panel_fps'));
            if (framesEl) framesEl.value = String(st.frames);
            if (fpsEl) fpsEl.value = String(st.fps);
        }
        const hint = overlay?.querySelector('#comfyvideo_panel_clip_hint');
        if (hint) hint.textContent = `≈ ${seconds}s · ~${motionLines} motion lines`;

        overlay?.querySelectorAll('#comfyvideo_panel_length .cv_seg_btn').forEach(btn => {
            const sec = Number(btn.getAttribute('data-seconds'));
            const fps = Number(btn.getAttribute('data-fps')) || 8;
            const frames = Math.round(sec * fps);
            const match = st.fps === fps && st.frames === frames;
            btn.classList.toggle('active', match);
        });
    }

    function paintLibraries() {
        const st = api.getSettings();
        const L = st.libraries || {};
        fillSelect('comfyvideo_panel_image_wf', L.imageWorkflows, st.activeImageWorkflowId);
        fillSelect('comfyvideo_panel_i2v_wf', L.i2vWorkflows, st.activeI2vWorkflowId);
        fillSelect('comfyvideo_panel_image_prompt', L.imagePrompts, st.activeImagePromptId);
        fillSelect('comfyvideo_panel_motion_prompt', L.motionPrompts, st.activeMotionPromptId);
    }

    function paintStyle() {
        const st = api.getSettings();
        const select = /** @type {HTMLSelectElement|null} */ (overlay?.querySelector('#comfyvideo_panel_image_style'));
        const custom = /** @type {HTMLTextAreaElement|null} */ (overlay?.querySelector('#comfyvideo_panel_custom_image_style'));
        if (select) select.value = st.imageStylePreset || 'realistic';
        if (custom) {
            custom.value = st.customImageStyle || '';
            custom.hidden = st.imageStylePreset !== 'custom';
        }
    }

    function findLatestComfyVideoMessageId() {
        const ctx = api.getContext();
        const chat = ctx.chat || [];
        for (let i = chat.length - 1; i >= 0; i--) {
            const m = chat[i];
            if (api.isComfyVideoMessage(m) && api.getMessageImageUrl(m)) {
                return i;
            }
        }
        return null;
    }

    function paintVideoHint() {
        const hint = overlay?.querySelector('#comfyvideo_panel_video_hint');
        const preview = /** @type {HTMLImageElement|null} */ (overlay?.querySelector('#comfyvideo_panel_video_preview'));
        if (!hint) return;
        const id = findLatestComfyVideoMessageId();
        if (id == null) {
            hint.textContent = 'No ComfyVideo still in this chat yet — generate a scene image first.';
            hint.classList.add('warn');
            if (preview) preview.hidden = true;
        } else {
            hint.textContent = `Video will use the latest ComfyVideo still (message #${id + 1}).`;
            hint.classList.remove('warn');
            const imageUrl = api.getMessageImageUrl(api.getContext().chat[id]);
            if (preview && imageUrl) {
                preview.src = imageUrl;
                preview.hidden = false;
            }
        }
    }

    async function open() {
        await ensureDom();
        paintResolution();
        paintLength();
        paintLibraries();
        paintStyle();
        paintVideoHint();
        overlay?.classList.add('active');
    }

    function close() {
        overlay?.classList.remove('active');
    }

    function destroy() {
        document.removeEventListener('keydown', onKey);
        overlay?.remove();
        overlay = null;
        bound = false;
    }

    return { open, close, destroy, refresh: () => { paintLibraries(); paintLength(); paintResolution(); paintStyle(); } };
}
