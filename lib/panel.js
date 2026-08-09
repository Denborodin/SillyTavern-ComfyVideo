/**
 * Pathweaver-style floating generation panel for ComfyVideo.
 */

import { clipTiming } from './defaults.js';

/**
 * @param {object} api
 * @param {() => object} api.getSettings
 * @param {() => void} api.saveSettings
 * @param {() => void} api.syncSettingsUi  refresh extension settings form if open
 * @param {(promptKind?: string) => Promise<void>} api.generateSceneImage
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
    let selectedVideoSourceId = null;

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
        wireSelect('comfyvideo_panel_motion_prompt', 'motionPrompts', 'activeMotionPromptId', 'motionPromptTemplate', 'template');

        overlay.querySelectorAll('#comfyvideo_panel_image_style .cv_seg_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const st = api.getSettings();
                st.imageStylePreset = btn.getAttribute('data-value') || 'photo';
                api.saveSettings();
                paintStyle();
                api.syncSettingsUi?.();
            });
        });

        overlay.querySelectorAll('#comfyvideo_panel_motion_intensity .cv_seg_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const st = api.getSettings();
                st.motionIntensity = btn.getAttribute('data-value') || 'normal';
                api.saveSettings();
                paintMotionIntensity();
                api.syncSettingsUi?.();
            });
        });

        overlay.querySelectorAll('#comfyvideo_panel_image_quality .cv_seg_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const st = api.getSettings();
                st.imageQuality = btn.getAttribute('data-value') || 'high';
                api.saveSettings();
                paintImageQuality();
                api.syncSettingsUi?.();
            });
        });

        overlay.querySelector('#comfyvideo_panel_video_source')?.addEventListener('change', e => {
            const value = Number(/** @type {HTMLSelectElement} */ (e.target).value);
            selectedVideoSourceId = Number.isInteger(value) ? value : null;
            paintVideoHint();
        });

        overlay.querySelectorAll('.cv_image_action_btn[data-prompt-kind]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const promptKind = btn.getAttribute('data-prompt-kind') || 'scene';
                close();
                try {
                    await api.generateSceneImage(promptKind);
                } catch (e) {
                    console.error(e);
                    toastr.error(String(e.message || e), 'ComfyVideo');
                }
            });
        });

        overlay.querySelector('#comfyvideo_panel_gen_video')?.addEventListener('click', async () => {
            const id = resolveSelectedVideoSourceId();
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

        overlay.querySelector('#comfyvideo_panel_open_settings')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void openFullSettings();
        });
    }

    async function openFullSettings() {
        close();

        const extensionsDrawer = document.getElementById('extensions-settings-button');
        const drawerToggle = extensionsDrawer?.querySelector('.drawer-toggle');
        const drawerIcon = drawerToggle?.querySelector('.drawer-icon');
        const drawerContent = extensionsDrawer?.querySelector('.drawer-content');
        if (!extensionsDrawer || !drawerToggle || !drawerIcon || !drawerContent) {
            toastr.error('Could not open SillyTavern extension settings.', 'ComfyVideo');
            return;
        }

        if (!drawerContent.classList.contains('openDrawer')) {
            // Clicking the icon mirrors ST's normal drawer interaction and avoids
            // its document-level outside-click handler immediately closing it.
            /** @type {HTMLElement} */ (drawerIcon).click();
        }

        // Another navbar drawer may need to finish closing before Extensions opens.
        const deadline = Date.now() + 1500;
        while (!drawerContent.classList.contains('openDrawer') && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const target = document.getElementById('comfyvideo_settings');
        const header = /** @type {HTMLElement|null} */ (target?.querySelector('.inline-drawer-toggle'));
        const content = /** @type {HTMLElement|null} */ (target?.querySelector('.inline-drawer-content'));
        if (!target || !header || !content) {
            toastr.error('ComfyVideo settings are not available.', 'ComfyVideo');
            return;
        }

        if (getComputedStyle(content).display === 'none') {
            header.click();
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        header.scrollIntoView({
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
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
        fillSelect('comfyvideo_panel_motion_prompt', L.motionPrompts, st.activeMotionPromptId);
    }

    function paintStyle() {
        const st = api.getSettings();
        overlay?.querySelectorAll('#comfyvideo_panel_image_style .cv_seg_btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === st.imageStylePreset);
        });
    }

    function paintMotionIntensity() {
        const st = api.getSettings();
        overlay?.querySelectorAll('#comfyvideo_panel_motion_intensity .cv_seg_btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === st.motionIntensity);
        });
    }

    function findLatestComfyVideoMessageId() {
        return getVideoSourceMessageIds()[0] ?? null;
    }

    function paintImageQuality() {
        const st = api.getSettings();
        overlay?.querySelectorAll('#comfyvideo_panel_image_quality .cv_seg_btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === st.imageQuality);
        });
    }

    function getVideoSourceMessageIds() {
        const chat = api.getContext().chat || [];
        const ids = [];
        for (let i = chat.length - 1; i >= 0; i--) {
            if (api.isComfyVideoMessage(chat[i]) && api.getMessageImageUrl(chat[i])) ids.push(i);
        }
        return ids;
    }

    function resolveSelectedVideoSourceId() {
        const sources = getVideoSourceMessageIds();
        if (sources.includes(selectedVideoSourceId)) return selectedVideoSourceId;
        selectedVideoSourceId = sources[0] ?? null;
        return selectedVideoSourceId;
    }

    function paintVideoSourceSelect(sources, selectedId) {
        const select = /** @type {HTMLSelectElement|null} */ (overlay?.querySelector('#comfyvideo_panel_video_source'));
        if (!select) return;
        select.innerHTML = '';
        for (const id of sources) {
            const message = api.getContext().chat[id];
            const meta = message?.extra?.comfyVideo || {};
            const dimensions = Number(meta.width) > 0 && Number(meta.height) > 0
                ? ` ${meta.width}x${meta.height}` : '';
            const option = document.createElement('option');
            option.value = String(id);
            option.textContent = `Message #${id + 1}${dimensions}`;
            select.append(option);
        }
        select.value = selectedId == null ? '' : String(selectedId);
        select.hidden = sources.length < 2;
    }

    function paintVideoHint() {
        const hint = overlay?.querySelector('#comfyvideo_panel_video_hint');
        const preview = /** @type {HTMLImageElement|null} */ (overlay?.querySelector('#comfyvideo_panel_video_preview'));
        if (!hint) return;
        const sources = getVideoSourceMessageIds();
        const id = resolveSelectedVideoSourceId();
        paintVideoSourceSelect(sources, id);
        if (id == null) {
            hint.textContent = 'No ComfyVideo still in this chat yet — generate a scene image first.';
            hint.classList.add('warn');
            if (preview) preview.hidden = true;
        } else {
            hint.textContent = `Video will use the selected ComfyVideo still (message #${id + 1}).`;
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
        paintImageQuality();
        paintLength();
        paintLibraries();
        paintStyle();
        paintMotionIntensity();
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

    return { open, close, destroy, refresh: () => { paintLibraries(); paintLength(); paintResolution(); paintImageQuality(); paintStyle(); paintMotionIntensity(); } };
}
