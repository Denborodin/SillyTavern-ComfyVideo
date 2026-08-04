/**
 * Default LLM instruction templates and fixed strings.
 * Tuned for natural-language models: Z-Image (T2I) and MiniMax H3 / Hailuo (I2V).
 * Focus: active roleplay (appearance, clothing, pose, action) — not VN illustration style.
 */

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `You turn roleplay chat into ONE image prompt for a natural-language image model (Z-Image).

This is for active roleplay, not a static visual novel portrait. Prioritize, in order:
1) Character appearance (face, body, hair, distinctive features) — stay consistent with any provided appearance notes
2) Clothing and how it sits on the body right now (state of dress, damage, wetness, accessories)
3) Body positions, poses, proximity, and contact between characters
4) Actions and expressions in this exact moment (what they are doing / reacting to)
5) Only then: immediate environment and lighting needed to read the scene

Write 1–3 fluent present-tense sentences (natural language, not tag lists).

Rules:
- Output ONLY the image prompt. No title, quotes, bullets, or commentary.
- Faithful to the latest messages; do not invent major plot beats or extra characters.
- Concrete and visual: pose, hands, gaze, clothing details, spatial relation (who is where).
- Do NOT use quality-tag spam (masterpiece, best quality, score_9, ultra detailed, etc.).
- Do NOT use comma-separated danbooru-style tags; write natural prose.`;

export const DEFAULT_MOTION_PROMPT_TEMPLATE = `You write a motion prompt for an image-to-video model (MiniMax Hailuo / H3).
A still image is already provided — do NOT redesign characters, outfits, or the full scene.

Clip length: {{clip_seconds}} seconds.
Write about one clear line (or one short sentence) of motion description per 1–2 seconds of clip
(so roughly {{motion_lines}} lines / short sentences total). Cover:
- Primary subject action and pose change driven by the roleplay moment
- Secondary motion (hair, cloth, breath, hands, environment)
- Camera (static, slow push-in, slight pan, gentle handheld) — keep framing stable
- Pacing appropriate for a {{clip_seconds}}s clip

Rules:
- Output ONLY the motion prompt. No preamble.
- No hard cuts, no new characters, no scene changes.
- Prefer physically plausible, continuous motion.
- No quality tags or empty cinematic buzzword lists.
- If a source still prompt is provided, keep motion consistent with that moment.`;

export const DEFAULT_FIXED_MOTION_FALLBACK =
    'Subtle natural motion: gentle breathing, slight hair and cloth movement; camera mostly still with a very slow push-in.';

/**
 * @param {number} frames
 * @param {number} fps
 * @returns {{ seconds: number, motionLines: number }}
 */
export function clipTiming(frames, fps) {
    const f = Math.max(1, Number(frames) || 16);
    const p = Math.max(1, Number(fps) || 8);
    const seconds = Math.round((f / p) * 10) / 10;
    const motionLines = Math.max(1, Math.ceil(seconds / 1.5));
    return { seconds, motionLines };
}

/**
 * Fill {{clip_seconds}} / {{motion_lines}} in motion template.
 * @param {string} template
 * @param {number} frames
 * @param {number} fps
 */
export function applyClipPlaceholders(template, frames, fps) {
    const { seconds, motionLines } = clipTiming(frames, fps);
    return String(template || '')
        .replaceAll('{{clip_seconds}}', String(seconds))
        .replaceAll('{{motion_lines}}', String(motionLines));
}
