/**
 * ComfyUI client for ComfyVideo.
 * - Generate / ping via SillyTavern server proxy (no CORS for long jobs)
 * - Image upload via ComfyUI POST /upload/image (primary I2V input path)
 * Does not use extension_settings.sd.
 */

/**
 * @param {() => Record<string, string>} getHeaders from ST getRequestHeaders
 */
export function createComfyClient(getHeaders) {
    /**
     * @param {string} comfyUrl
     * @returns {Promise<boolean>}
     */
    async function ping(comfyUrl) {
        const res = await fetch('/api/sd/comfy/ping', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ url: comfyUrl }),
        });
        return res.ok;
    }

    /**
     * Upload an image file/blob to ComfyUI input folder.
     * @param {string} comfyUrl
     * @param {Blob} blob
     * @param {string} [filename]
     * @returns {Promise<{ name: string, subfolder: string, type: string }>}
     */
    async function uploadImage(comfyUrl, blob, filename = 'comfyvideo_input.png') {
        const base = String(comfyUrl).replace(/\/+$/, '');
        const form = new FormData();
        form.append('image', blob, filename);
        form.append('overwrite', 'true');
        form.append('type', 'input');

        const res = await fetch(`${base}/upload/image`, {
            method: 'POST',
            body: form,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(
                `ComfyUI upload failed (${res.status}). ` +
                `If this is CORS-related, start ComfyUI with CORS enabled (e.g. --enable-cors-header *). ` +
                text.slice(0, 200),
            );
        }

        const data = await res.json();
        if (!data?.name) {
            throw new Error('ComfyUI upload returned no filename.');
        }
        return {
            name: data.name,
            subfolder: data.subfolder || '',
            type: data.type || 'input',
        };
    }

    /**
     * Run a filled Comfy workflow via ST proxy.
     * @param {string} comfyUrl
     * @param {string} promptBody JSON string: {"prompt": { ...nodes }}
     * @param {AbortSignal} [signal]
     * @returns {Promise<{ format: string, data: string }>}
     */
    async function generate(comfyUrl, promptBody, signal) {
        const res = await fetch('/api/sd/comfy/generate', {
            method: 'POST',
            headers: getHeaders(),
            signal,
            body: JSON.stringify({
                url: comfyUrl,
                prompt: promptBody,
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            throw new Error(text || 'ComfyUI generate failed');
        }

        const result = await res.json();
        if (!result?.data) {
            throw new Error('ComfyUI generate returned no data.');
        }
        return {
            format: String(result.format || 'png').toLowerCase(),
            data: result.data,
        };
    }

    /**
     * Fetch an image from a ST-relative or absolute URL as a Blob.
     * @param {string} url
     * @returns {Promise<Blob>}
     */
    async function fetchImageBlob(url) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch source image: ${res.status}`);
        }
        return res.blob();
    }

    /**
     * Convert blob to raw base64 (no data: prefix).
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    async function blobToBase64(blob) {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(/** @type {string} */ (reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        const comma = dataUrl.indexOf(',');
        return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    }

    return {
        ping,
        uploadImage,
        generate,
        fetchImageBlob,
        blobToBase64,
    };
}
