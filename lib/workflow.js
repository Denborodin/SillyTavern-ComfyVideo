/**
 * ComfyUI workflow placeholder substitution and light validation.
 * Independent of native Image Generation (extension_settings.sd).
 */

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
    // Accept either bare node map or { prompt: { ... } }
    if (data && typeof data === 'object' && data.prompt && typeof data.prompt === 'object' && !data.class_type) {
        return data.prompt;
    }
    return data;
}

/**
 * Replace "%key%" style placeholders. Values are JSON-stringified when replacing
 * quoted placeholders (" %key% ") and inserted raw when the token is unquoted.
 * Mirrors SillyTavern native Comfy placeholder style.
 * @param {object|string} workflow
 * @param {Record<string, string|number|boolean|null|undefined>} placeholders
 * @returns {string} JSON string of the node graph (no outer {prompt} wrapper)
 */
export function fillPlaceholders(workflow, placeholders) {
    let text = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);

    for (const [key, value] of Object.entries(placeholders)) {
        if (value === undefined) continue;
        const token = `%${key}%`;
        // Prefer replacing JSON-string form of quoted placeholder: "%key%"
        const quotedToken = `"%${key}%"`;
        if (text.includes(quotedToken)) {
            text = text.split(quotedToken).join(JSON.stringify(value));
        }
        // Also replace bare %key% occurrences
        if (text.includes(token)) {
            text = text.split(token).join(typeof value === 'string' ? value : String(value));
        }
    }
    return text;
}

/**
 * Basic checks for image vs I2V workflows.
 * @param {object} nodes
 * @param {'image'|'i2v'} kind
 * @returns {string[]} warnings (non-fatal)
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
 * Wrap filled node graph for ST /api/sd/comfy/generate body.prompt field.
 * @param {string} filledNodesJson
 * @returns {string}
 */
export function wrapPromptBody(filledNodesJson) {
    return `{"prompt": ${filledNodesJson}}`;
}
