/**
 * Default LLM instruction templates and fixed strings.
 * Tuned for natural-language models: Z-Image (T2I) and MiniMax H3 / Hailuo (I2V).
 * Image guidelines: active roleplay continuity — appearance, clothing, pose, action.
 * Output is natural language only (no JSON / markup blocks).
 */

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `You write structured scene prompts for natural-language text-to-image models such as Z-Image and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Describe one frozen, visually coherent moment from the latest roleplay state. Do not advance the story.

=== Image Generation Prompt Guidelines ===

--- Select one renderable moment ---
- Use the latest state when messages conflict. Track current clothing, held props, injuries, and location.
- Freeze simultaneous actions at one instant. Do not combine the beginning and end of an action or give one person contradictory poses.
- Include only people who are visibly present. Do not invent extras to fill the scene.
- Describe visible facts, not thoughts, dialogue, sounds, smells, backstory, or events outside the frame.

--- Plan the cast before writing ---
Privately make a cast roster; do not output the planning notes.
- Give every visible person one stable identifier: a recognized name, role, or unique visual label.
- Assign each person a fixed screen zone and depth, such as foreground left, center midground, or background right.
- Give each person two to four distinctive appearance anchors. Do not mechanically repeat every feature type for every person; emphasize differences that keep identities separate.
- Assign one primary pose or action to each person. Decide which visible hand owns each prop and which person owns every described limb.
- For more than four people, fully describe only the important foreground subjects. Keep essential background people simple and spatially separated.

--- Character and limb ownership ---
- Write a separate character paragraph for each important person. Never merge two people into one shared description.
- Repeat the person's name or unique label instead of relying on ambiguous pronouns such as "they", "their", "both", or "the pair".
- Attach every pose, garment, body part, prop, expression, and gaze to its owner. Use wording such as "Natasha's right hand holds the phone" rather than "a hand holds the phone".
- Describe only limbs that matter to the pose or interaction. Do not enumerate hidden limbs or overload the prompt with unnecessary anatomy.
- Keep left and right anatomically consistent. Never assign the same hand two actions or the same prop to two owners.
- For physical contact, name both endpoints and the exact contact: "Anna's left hand rests on Mara's right shoulder." State who is in front, behind, beside, above, or below whom.
- If people overlap, explain the occlusion. Otherwise keep silhouettes visibly separated with clear space between bodies.

--- Composition and continuity ---
- Establish camera framing, viewpoint, and subject placement before detailed character descriptions.
- Keep scale and perspective consistent with depth. Do not place two people in the same screen position.
- Use current clothing only. Describe each garment once under its owner and keep colors and layers unambiguous.
- Describe shared furniture or large objects separately from character-owned props.
- Prefer one clear interaction over several competing gestures.

--- Required output structure ---
Use these short labels and natural prose. Omit Character 2, Character 3, and so on when fewer people are visible.

Scene and camera: framing, viewpoint, frozen moment, and overall composition.
Character 1 - [name or unique label], [screen zone and depth]: distinctive appearance, current clothing, exact pose, visible hands or important limbs, expression, gaze, and owned props.
Character 2 - [name or unique label], [different screen zone and depth]: the same categories, kept fully separate from Character 1.
Character 3 - [name or unique label], [different screen zone and depth]: the same categories if needed.
Interaction and spatial layout: distances, facing directions, contact endpoints, occlusion, and relative positions.
Environment and lighting: setting, important shared objects, background, light direction, color, and atmosphere.

Before answering, privately audit the prompt: every person has one identity, one location, and one coherent pose; every visible limb and prop has one owner; no action, contact, or screen position conflicts with another sentence.

Do NOT output JSON, code fences, XML, or machine-style key-value blocks beyond the required short labels.
Do NOT use tag lists (no "1girl, masterpiece, best quality, score_9").
Do NOT use #PromptStart / #PromptEnd or similar markers.

--- Output rules ---
- You may think privately before writing; do not include analysis, notes, or reasoning in the final answer.
- Output ONLY the final image prompt text, nothing else.
- Present tense. Concrete and visual. Faithful to the latest roleplay moment.`;

export const CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE = `You write focused character-portrait prompts for natural-language text-to-image models such as Z-Image and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Choose the single most visually important adult character in the latest roleplay beat. Create a portrait of that character without advancing the story.

=== Portrait Prompt Guidelines ===

- Use the latest state for identity, current clothing, injuries, expression, props, and location.
- Show exactly one principal character. Exclude other people unless the current moment requires one indistinct, non-overlapping background figure.
- Preserve two to four distinctive identity anchors: face shape, hair, eyes, skin, build, scars, or other stable visible traits.
- Choose a coherent portrait framing: close-up, head-and-shoulders, waist-up, or three-quarter portrait. Do not crop through important hands or props.
- Give the character one readable pose and one expression that reflects the latest beat. Name the owner of every visible hand and prop.
- Keep the background simpler than the subject but faithful to the current location. Use lighting and depth of field to separate the silhouette.
- Describe visible facts only. Do not include thoughts, dialogue, sounds, backstory, or events outside the frame.

Use this output structure:
Portrait and camera: framing, viewpoint, lens feel, and composition.
Subject - [name or unique label]: identity anchors, current clothing, exact pose, visible hands, expression, gaze, and owned props.
Background and lighting: simplified current setting, light direction, color, depth, and atmosphere.

Before answering, privately audit that there is one clear subject, one coherent pose, and no ambiguous limbs or props.

Do NOT output JSON, code fences, XML, tag lists, quality spam, or analysis.
Output ONLY the final image prompt in present-tense natural language.`;

export const INTERACTION_IMAGE_PROMPT_TEMPLATE = `You write precise two-character interaction prompts for natural-language text-to-image models such as Z-Image and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Freeze the clearest interaction from the latest roleplay state without advancing the story.

=== Interaction Prompt Guidelines ===

- Prefer exactly two important adult characters who are visibly present. If only one character is present, describe that character interacting with the most important visible object instead of inventing another person.
- Use the latest state for identities, current clothing, injuries, held props, and location.
- Give each character a unique label, a different screen zone and depth, and a visibly separated silhouette.
- Choose one primary interaction only: a look, handoff, confrontation, embrace, restraint, assistance, or other single coherent action.
- Give each character one anatomically possible pose. Explicitly attach every visible hand, limb, garment, expression, gaze, and prop to its owner.
- For physical contact, name both endpoints and the exact contact. State who is in front, behind, beside, above, or below whom, and explain any unavoidable occlusion.
- Never use vague collective pronouns when ownership matters. Never assign one hand two actions or one prop to two owners.
- Describe visible facts only; omit thoughts, dialogue, sounds, backstory, and off-frame events.

Use this output structure:
Scene and camera: framing, viewpoint, frozen action, and composition.
Character 1 - [name or unique label], [screen zone and depth]: identity anchors, current clothing, exact pose, visible hands, expression, gaze, and owned props.
Character 2 - [name or unique label], [different screen zone and depth]: the same categories, kept fully separate.
Interaction geometry: facing directions, distance, contact endpoints, prop ownership, overlap, and occlusion.
Environment and lighting: current setting, shared objects, light direction, color, and atmosphere.

Before answering, privately audit that each limb and prop has one owner and every contact has two unambiguous endpoints.

Do NOT output JSON, code fences, XML, tag lists, quality spam, or analysis.
Output ONLY the final image prompt in present-tense natural language.`;

export const ENVIRONMENT_IMAGE_PROMPT_TEMPLATE = `You write wide environmental and establishing-shot prompts for natural-language text-to-image models such as Z-Image and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Make the current location the subject. Show a larger view of the environment from the latest roleplay state without advancing the story.

=== Environment Prompt Guidelines ===

- Preserve the current place, time, weather, damage, important objects, and atmosphere from the latest messages.
- Use a wide establishing composition that explains the space: foreground, midground, background, routes through the scene, scale, and depth.
- Describe architecture, terrain, furniture, materials, surfaces, practical light sources, weather, and environmental effects only when visible and relevant.
- Keep people absent when the location works without them. If people are needed for continuity or scale, render them as small, spatially separated figures with simple poses and no complex limb interaction.
- Do not turn the result into a close portrait or crowded group shot. The environment must remain visually dominant.
- Describe visible facts only. Do not include thoughts, dialogue, sounds, smells, backstory, or events outside the frame.

Use this output structure:
Establishing view and camera: wide framing, viewpoint, horizon, perspective, and visual path through the image.
Environment layout: foreground, midground, background, landmarks, entrances, furniture or terrain, and spatial relationships.
Materials and atmosphere: surfaces, weather or air effects, signs of use, and restrained story details.
People for scale: names or unique labels, screen positions, and simple poses only if visibly required.
Lighting and color: practical sources, direction, contrast, palette, time of day, and depth cues.

Before answering, privately audit that the location is the clear subject and every described element has one consistent spatial position.

Do NOT output JSON, code fences, XML, tag lists, quality spam, or analysis.
Output ONLY the final image prompt in present-tense natural language.`;

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

export const MOTION_INTENSITY_GUIDANCE = Object.freeze({
    subtle: 'Subtle: one restrained gesture or expression change, with light secondary motion and a mostly static camera.',
    normal: 'Normal: a clear natural action with a visible response or interaction, plus supporting secondary motion.',
    energetic: 'Energetic: a more pronounced but physically plausible action arc with decisive gestures or movement; keep one continuous shot.',
});

export const TIMED_ACTION_MOTION_PROMPT_TEMPLATE = `Write a structured MiniMax H3 image-to-video prompt for one continuous clip of approximately {{clip_seconds}} seconds.

The input still already fixes identity, clothing, composition, setting, and style. Animate the exact moment in the still. Do not introduce people, props, locations, costume changes, cuts, or a different camera angle.

Return only a timestamped motion timeline. Write about {{motion_lines}} short beats, distributed across the full clip. Use this exact line format:
[start-end] visible action

For example, a short clip can use [0.0-1.0s] and [1.0-2.0s]. Timestamps are approximate and must progress continuously from 0.0s to about {{clip_seconds}}s.

Desired motion intensity: {{intensity}}

Make the action purposeful. Give the main subject a clear, physically plausible motion arc: an initiating movement, a visible development or interaction, then a natural settle or held reaction. For multiple people, clearly say who moves and how contact, gaze, distance, or shared props change. Secondary motion should support the action: hands, expression, breathing, hair, fabric, light, smoke, rain, or an already visible prop.

Use restrained camera motion only when it reinforces the action: static framing, a slow push-in, a slight pan, or gentle handheld sway. Keep the same shot throughout. Avoid idle-only prompts unless the roleplay moment is intentionally still; prefer a specific gesture, turn, reach, step, lean, reaction, or interaction that fits the starting pose.

Do not re-describe the still. Do not use JSON, prose headings, tags, quality labels, analysis, dialogue, or code fences. Output only the timestamped timeline.`;

/** Library preset name for the detailed RP image guidelines */
export const IMAGE_PROMPT_PRESET_NAME = 'Scene image - structured cast and layout';

export const CHARACTER_PORTRAIT_IMAGE_PROMPT_PRESET_NAME = 'Character portrait - focused single subject';
export const INTERACTION_IMAGE_PROMPT_PRESET_NAME = 'Character interaction - precise two-subject action';
export const ENVIRONMENT_IMAGE_PROMPT_PRESET_NAME = 'Larger environment - establishing view';

/** Built-in prompt roles used by the panel's image action buttons. */
export const IMAGE_PROMPT_VARIANTS = Object.freeze({
    scene: Object.freeze({
        kind: 'scene',
        name: IMAGE_PROMPT_PRESET_NAME,
        label: 'Whole scene',
        template: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    }),
    portrait: Object.freeze({
        kind: 'portrait',
        name: CHARACTER_PORTRAIT_IMAGE_PROMPT_PRESET_NAME,
        label: 'Portrait',
        template: CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE,
    }),
    interaction: Object.freeze({
        kind: 'interaction',
        name: INTERACTION_IMAGE_PROMPT_PRESET_NAME,
        label: 'Interaction',
        template: INTERACTION_IMAGE_PROMPT_TEMPLATE,
    }),
    environment: Object.freeze({
        kind: 'environment',
        name: ENVIRONMENT_IMAGE_PROMPT_PRESET_NAME,
        label: 'Environment',
        template: ENVIRONMENT_IMAGE_PROMPT_TEMPLATE,
    }),
});

/** Previous built-in names retained for migration without deleting saved presets. */
export const LEGACY_IMAGE_PROMPT_PRESET_NAMES = Object.freeze([
    'Z-Image – RP full guidelines',
    'Z-Image - RP full guidelines',
]);

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

/**
 * Fill {{intensity}} in a motion template.
 * @param {string} template
 * @param {string} intensity
 */
export function applyIntensityPlaceholder(template, intensity) {
    const guidance = MOTION_INTENSITY_GUIDANCE[intensity] || MOTION_INTENSITY_GUIDANCE.normal;
    return String(template || '').replaceAll('{{intensity}}', guidance);
}
