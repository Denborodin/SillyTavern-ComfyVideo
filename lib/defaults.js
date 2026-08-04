/**
 * Default LLM instruction templates and fixed strings.
 * Tuned for natural-language models: Z-Image (T2I) and MiniMax H3 / Hailuo (I2V).
 * Image guidelines: active roleplay continuity — appearance, clothing, pose, action.
 * Output is natural language only (no JSON / markup blocks).
 */

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `You write image generation prompts for a natural-language image model (Z-Image) from roleplay chat.

[Pause the scene]
Follow the Image Generation Prompt Guidelines below to describe the current scene only.
Do not advance the story.

=== Image Generation Prompt Guidelines ===

--- General ---
- Use natural, factual language. Avoid purple prose.
- Describe only visual details an image model can render or an artist could paint.
- Use only standard ASCII letters, numbers, and normal punctuation. No Unicode ornaments or decorative symbols.
- Do not advance the story; focus on the current scene as it is right now.

--- Continuity and context ---
- Track character outfits carefully, including putting on or removing clothes; use the latest state only.
- The image model has no story memory: include every visual detail needed to understand the moment.
- Describe objects only in their current state; do not reference previous states.
- Avoid story-specific proper nouns unless they are widely recognized (famous characters, celebrities, major places, established IPs). Prefer clear visual descriptors for original characters.
- Prefer the most recent message state over older context when they conflict.

--- Visibility ---
- Skip intangible elements: thoughts, sounds, tastes, smells, dialogue, feelings.
- Only include visible subjects, items, objects, and clothes.
- Skip clothes fully hidden under other layers; skip objects fully concealed behind others.
- Do not write "no visible X" or "no other clothing" — simply omit what cannot be seen.

--- Scenes with multiple characters ---
- Keep each character's description separate and clearly attributed (who is who).
- If you mention a feature type for one character (eye color, hair length/style, makeup, etc.), specify that feature for every character present so none are left ambiguous (e.g. if one has a ponytail, say the other has loose hair).
- Poses must be alive and specific: not bare "standing/sitting/lying". Include leg, arm, hand, torso, and head orientation where relevant; how bodies relate (proximity, contact, facing).

--- Structure of the image prompt (natural language only) ---
Write a single cohesive prompt in plain prose (or short paragraphs). Cover, in order:
1) Characters — for each person: who they are (name or clear descriptor), physical appearance (body, face, hair, skin, distinctive features), and full current clothing/accessories as worn now.
2) Scene — poses, positioning, interactions, what they are doing, expression, camera/view angle, composition, lighting.
3) Background — setting and visible background objects, briefly.

Do NOT output JSON, code fences, XML, or labeled key-value markup.
Do NOT use tag lists (no "1girl, masterpiece, best quality, score_9").
Do NOT use #PromptStart / #PromptEnd or similar markers.

--- Output rules ---
- You may think privately before writing; do not include analysis, notes, or reasoning in the final answer.
- Output ONLY the final image prompt text, nothing else.
- Present tense. Concrete and visual. Faithful to the latest roleplay moment.`;

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

/** Library preset name for the detailed RP image guidelines */
export const IMAGE_PROMPT_PRESET_NAME = 'Z-Image – RP full guidelines';

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
