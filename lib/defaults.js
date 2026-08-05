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

export const DEFAULT_MOTION_PROMPT_TEMPLATE = `You write motion prompts for an image-to-video model (MiniMax Hailuo / H3) from roleplay chat and an existing still.

[Pause the scene]
A still image already locks identity, outfits, framing, and setting.
Follow the Motion Generation Prompt Guidelines below.
Animate this exact moment only. Do not redesign the picture. Do not advance the plot beyond continuous motion.

Clip length: {{clip_seconds}} seconds.
Budget: about one clear line or short sentence of motion per 1-2 seconds
(about {{motion_lines}} lines / short sentences total). Match density to that length — denser motion for longer clips, restrained motion for short ones.

=== Motion Generation Prompt Guidelines ===

--- General ---
- Use natural, factual language. Avoid purple prose and empty cinematic buzzwords.
- Describe only motion and camera behavior a video model can animate from the still.
- Use only standard ASCII letters, numbers, and normal punctuation.
- Do not invent a new scene, new characters, costume changes, or a different location.
- Do not re-describe full character designs, outfits, or the whole background — the still already has them. Mention people only to attribute who moves (e.g. "she turns her head", "he steps closer").

--- Continuity and context ---
- Motion must fit the latest roleplay beat and, if provided, the source still image prompt.
- Prefer continuous, physically plausible action over jump-cuts or teleporting poses.
- Clothing moves with the body (fabric, hair, straps, loose sleeves) only if that cloth is already visible in the still.
- Objects only move if they are already in the still and the RP supports it.
- Prefer the most recent message state when context conflicts.

--- Visibility (what to animate) ---
- Only animate what would be visible on camera: body, limbs, hands, head, eyes, mouth, hair, cloth, props in frame, light flicker if already present.
- Skip intangible elements: thoughts, dialogue text, sounds, smells, internal feelings (unless shown as a visible expression change).
- Do not write "no camera move" essays; if the camera is static, one short phrase is enough.

--- Scenes with multiple characters ---
- Attribute motion clearly per person (who moves what).
- Keep spatial relationship: who is closer to camera, who turns toward whom, contact (hand on shoulder, lean, step back).
- Do not merge two people into one vague "they".
- Secondary characters can have smaller motion (breath, glance) while the focus character carries the main action.

--- Camera ---
- Choose ONE stable camera plan for the whole clip: static, very slow push-in, slight pan, gentle tilt, or light handheld micro-sway.
- No hard cuts, no shot changes, no orbiting 360, no snap zooms unless the RP clearly demands a violent moment — and even then prefer one continuous move.
- Keep subject scale roughly consistent with the still (do not reframe into a different composition).

--- Structure of the motion prompt (natural language only) ---
Write plain prose (short sentences or line breaks). Cover, in order:
1) Primary action — what the main subject(s) do over the clip (pose change, gesture, walk, lean, turn, expression shift).
2) Secondary motion — hair, cloth, breath, hands, props, ambient environment (if visible).
3) Camera — the single camera behavior for the full {{clip_seconds}}s.
4) Pacing — calm / tense / urgent, matched to clip length (do not cram a long fight into 2 seconds).

Scale detail to {{clip_seconds}}s / ~{{motion_lines}} lines:
- Short clips: one main gesture + light secondary motion + simple camera.
- Longer clips: a clear beginning-to-end motion arc without changing the scene.

Do NOT output JSON, code fences, XML, or labeled key-value markup.
Do NOT use quality-tag spam or danbooru-style tags.
Do NOT use #PromptStart / #PromptEnd or similar markers.

--- Output rules ---
- You may think privately before writing; do not include analysis, notes, or reasoning in the final answer.
- Output ONLY the final motion prompt text, nothing else.
- Present tense or clear continuous motion language. Faithful to the still and the latest roleplay moment.`;

export const DEFAULT_FIXED_MOTION_FALLBACK =
    'Subtle natural motion: gentle breathing, slight hair and cloth movement; camera mostly still with a very slow push-in.';

export const TIMED_ACTION_MOTION_PROMPT_TEMPLATE = `Write a structured MiniMax H3 image-to-video prompt for one continuous clip of approximately {{clip_seconds}} seconds.

The input still already fixes identity, clothing, composition, setting, and style. Animate the exact moment in the still. Do not introduce people, props, locations, costume changes, cuts, or a different camera angle.

Return only a timestamped motion timeline. Write about {{motion_lines}} short beats, distributed across the full clip. Use this exact line format:
[start-end] visible action

For example, a short clip can use [0.0-1.0s] and [1.0-2.0s]. Timestamps are approximate and must progress continuously from 0.0s to about {{clip_seconds}}s.

Make the action purposeful. Give the main subject a clear, physically plausible motion arc: an initiating movement, a visible development or interaction, then a natural settle or held reaction. For multiple people, clearly say who moves and how contact, gaze, distance, or shared props change. Secondary motion should support the action: hands, expression, breathing, hair, fabric, light, smoke, rain, or an already visible prop.

Use restrained camera motion only when it reinforces the action: static framing, a slow push-in, a slight pan, or gentle handheld sway. Keep the same shot throughout. Avoid idle-only prompts unless the roleplay moment is intentionally still; prefer a specific gesture, turn, reach, step, lean, reaction, or interaction that fits the starting pose.

Do not re-describe the still. Do not use JSON, prose headings, tags, quality labels, analysis, dialogue, or code fences. Output only the timestamped timeline.`;

/** Library preset name for the detailed RP image guidelines */
export const IMAGE_PROMPT_PRESET_NAME = 'Z-Image – RP full guidelines';

/** Library preset name for the detailed I2V motion guidelines */
export const MOTION_PROMPT_PRESET_NAME = 'MiniMax H3 – I2V full guidelines';

export const TIMED_ACTION_MOTION_PRESET_NAME = 'MiniMax H3 - Timed action timeline';

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
