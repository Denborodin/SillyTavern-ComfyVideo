/**
 * ComfyUI workflow placeholder substitution and light validation.
 * Independent of native Image Generation (extension_settings.sd).
 */

/** @type {Record<string, { width: number, height: number, label: string }>} */
export const RESOLUTIONS = {
    portrait: { width: 864, height: 1152, label: '864 × 1152 (portrait)' },
    landscape: { width: 1152, height: 864, label: '1152 × 864 (landscape)' },
};

export const IMAGE_QUALITY_MULTIPLIERS = {
    compatible: 1,
    high: 1.5,
    ultra: 2,
};

/**
 * @param {string} [key]
 * @returns {{ width: number, height: number, label: string }}
 */
export function resolveDimensions(key) {
    return RESOLUTIONS[key] || RESOLUTIONS.portrait;
}

/**
 * Resolve the T2I dimensions independently from the H3-safe output size.
 * @param {string} resolution
 * @param {string} quality
 * @returns {{ width: number, height: number, label: string }}
 */
export function resolveImageDimensions(resolution, quality) {
    const base = resolveDimensions(resolution);
    const multiplier = IMAGE_QUALITY_MULTIPLIERS[quality] || IMAGE_QUALITY_MULTIPLIERS.high;
    const width = Math.round(base.width * multiplier);
    const height = Math.round(base.height * multiplier);
    return { width, height, label: `${width} × ${height}` };
}

/**
 * Parse a workflow from a string (API format object or full {prompt: ...} wrapper).
 * @param {string} raw
 * @returns {object}
 */
export function parseWorkflow(raw) {
    if (!raw || !String(raw).trim()) {
        throw new Error('Workflow is empty. Paste an API-format ComfyUI workflow in ComfyVideo settings.');
    }
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        throw new Error('Workflow JSON is invalid: ' + e.message);
    }
    if (data && typeof data === 'object' && data.prompt && typeof data.prompt === 'object' && !data.class_type) {
        return data.prompt;
    }
    return data;
}

/**
 * @param {object|string} workflow
 * @param {Record<string, string|number|boolean|null|undefined>} placeholders
 * @returns {string}
 */
export function fillPlaceholders(workflow, placeholders) {
    const nodes = typeof workflow === 'string' ? JSON.parse(workflow) : workflow;
    const replace = value => {
        if (typeof value === 'string') {
            const exact = /^%([^%]+)%$/.exec(value);
            if (exact && Object.hasOwn(placeholders, exact[1]) && placeholders[exact[1]] !== undefined) {
                return placeholders[exact[1]];
            }
            // Replace once in the original string; never scan inserted prompt text.
            return value.replace(/%([^%]+)%/g, (token, key) =>
                Object.hasOwn(placeholders, key) && placeholders[key] !== undefined
                    ? String(placeholders[key]) : token);
        }
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
        }
        return value;
    };
    return JSON.stringify(replace(nodes));
}

/**
 * @param {object} nodes
 * @param {'image'|'i2v'} kind
 * @returns {string[]}
 */
export function validateWorkflow(nodes, kind) {
    const warnings = [];
    if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) {
        throw new Error('Workflow must be a JSON object of ComfyUI nodes.');
    }
    const types = Object.values(nodes).map(n => n?.class_type).filter(Boolean);
    if (types.length === 0) {
        throw new Error('Workflow has no nodes with class_type.');
    }
    if (kind === 'i2v') {
        const hasLoad = types.some(t => /LoadImage|LoadImageBase64|Image Load/i.test(t));
        if (!hasLoad) {
            warnings.push('I2V workflow has no obvious LoadImage node. Ensure %image% maps to your input image filename.');
        }
    }
    return warnings;
}

/**
 * @param {string} filledNodesJson
 * @param {string} [clientId]
 * @returns {string}
 */
export function wrapPromptBody(filledNodesJson, clientId) {
    if (clientId) {
        return `{"prompt": ${filledNodesJson}, "client_id": ${JSON.stringify(clientId)}}`;
    }
    return `{"prompt": ${filledNodesJson}}`;
}
