/**
 * Status panel with stop button and progress bar for ComfyVideo jobs.
 */

/**
 * @typedef {object} StatusHandle
 * @property {(msg: string) => void} setMessage
 * @property {(pct: number|null) => void} setProgress  null = indeterminate
 * @property {(comfyUrl: string, clientId: string) => void} watchComfy
 * @property {() => void} close
 * @property {AbortSignal} signal
 * @property {boolean} aborted
 */

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {() => void} [opts.onStop]
 * @returns {StatusHandle}
 */
export function showStatus({ title, message = '', onStop } = {}) {
    const abort = new AbortController();
    let ws = null;
    let closed = false;

    const root = document.createElement('div');
    root.className = 'comfyvideo-status-panel';
    root.innerHTML = `
        <div class="comfyvideo-status-panel__header">
            <strong class="comfyvideo-status-panel__title"></strong>
            <button type="button" class="comfyvideo-status-panel__stop menu_button" title="Stop">
                <i class="fa-solid fa-stop"></i> Stop
            </button>
        </div>
        <div class="comfyvideo-status-panel__message"></div>
        <div class="comfyvideo-status-panel__bar-wrap">
            <div class="comfyvideo-status-panel__bar indeterminate"></div>
        </div>
        <div class="comfyvideo-status-panel__pct"></div>
    `;

    const titleEl = root.querySelector('.comfyvideo-status-panel__title');
    const msgEl = root.querySelector('.comfyvideo-status-panel__message');
    const barEl = root.querySelector('.comfyvideo-status-panel__bar');
    const pctEl = root.querySelector('.comfyvideo-status-panel__pct');
    const stopBtn = root.querySelector('.comfyvideo-status-panel__stop');

    titleEl.textContent = title || 'ComfyVideo';
    msgEl.textContent = message || '';

    document.body.appendChild(root);

    function setMessage(msg) {
        if (closed) return;
        msgEl.textContent = msg || '';
    }

    /**
     * @param {number|null} pct
     */
    function setProgress(pct) {
        if (closed) return;
        if (pct == null || Number.isNaN(pct)) {
            barEl.classList.add('indeterminate');
            barEl.style.width = '40%';
            pctEl.textContent = '';
            return;
        }
        const v = Math.max(0, Math.min(100, Number(pct)));
        barEl.classList.remove('indeterminate');
        barEl.style.width = `${v}%`;
        pctEl.textContent = `${Math.round(v)}%`;
    }

    function closeWs() {
        if (ws) {
            try { ws.close(); } catch { /* ignore */ }
            ws = null;
        }
    }

    /**
     * Watch ComfyUI WebSocket for progress (requires CORS-friendly WS).
     * @param {string} comfyUrl
     * @param {string} clientId
     */
    function watchComfy(comfyUrl, clientId) {
        closeWs();
        try {
            const u = new URL(comfyUrl);
            const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${proto}//${u.host}/ws?clientId=${encodeURIComponent(clientId)}`;
            ws = new WebSocket(wsUrl);
            ws.addEventListener('message', ev => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data.type === 'progress' && data.data) {
                        const { value, max } = data.data;
                        if (max > 0) {
                            setProgress((value / max) * 100);
                        }
                    } else if (data.type === 'executing' && data.data?.node) {
                        setMessage(`Executing node ${data.data.node}…`);
                    } else if (data.type === 'execution_cached') {
                        setMessage('Using cached nodes…');
                    } else if (data.type === 'status' && data.data?.status?.exec_info) {
                        const q = data.data.status.exec_info.queue_remaining;
                        if (typeof q === 'number' && q > 0) {
                            setMessage(`Queue remaining: ${q}`);
                        }
                    }
                } catch {
                    // ignore non-JSON
                }
            });
            ws.addEventListener('error', () => {
                // Fall back to indeterminate; generate still works via ST proxy
                setProgress(null);
            });
        } catch {
            setProgress(null);
        }
    }

    function close() {
        if (closed) return;
        closed = true;
        closeWs();
        root.remove();
    }

    stopBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (abort.signal.aborted) return;
        abort.abort('user');
        setMessage('Stopping…');
        stopBtn.disabled = true;
        if (typeof onStop === 'function') {
            try { onStop(); } catch { /* ignore */ }
        }
    });

    abort.signal.addEventListener('abort', () => {
        stopBtn.disabled = true;
    });

    setProgress(null);

    return {
        setMessage,
        setProgress,
        watchComfy,
        close,
        signal: abort.signal,
        get aborted() {
            return abort.signal.aborted;
        },
    };
}

/**
 * @returns {string}
 */
export function newClientId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `cv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAbortError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const msg = String(err.message || err);
    return /abort|cancell?ed|user/i.test(msg);
}
