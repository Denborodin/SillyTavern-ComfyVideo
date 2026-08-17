/**
 * Default LLM instruction templates and fixed strings.
 * Tuned for natural-language models: Z-Image (T2I) and MiniMax H3 / Hailuo (I2V).
 * Image guidelines: active roleplay continuity — appearance, clothing, pose, action.
 * Output is natural language only (no JSON / markup blocks).
 */

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `You write structured scene prompts for natural-language text-to-image models such as Z-Image, Krea 2, and FLUX.2 Klein from roleplay chat.

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
- Default to a neutral, observational camera at eye or chest height with natural perspective. For scenes with people, prefer a medium-wide, three-quarter, or full-body view from enough distance to show the subjects and their surroundings clearly.
- Use camera distance, not an ultra-wide lens, to fit more into frame. Favor a normal lens feel around 50mm; do not place the camera extremely close to faces or bodies.
- Do not invent dramatic high-angle, low-angle, overhead, Dutch-angle, fisheye, action-camera, or exaggerated foreshortened views. Use an unusual viewpoint only when the latest roleplay explicitly establishes it or the physical scene makes it necessary.
- Keep faces and bodies naturally proportioned. No foreground head, hand, chest, hip, or other body part should dominate through perspective distortion unless that emphasis is explicitly requested.
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

export const CHARACTER_PORTRAIT_IMAGE_PROMPT_TEMPLATE = `You write focused character-portrait prompts for natural-language text-to-image models such as Z-Image, Krea 2, and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Choose the single most visually important adult character in the latest roleplay beat. Create a portrait of that character without advancing the story.

=== Portrait Prompt Guidelines ===

- Use the latest state for identity, current clothing, injuries, expression, props, and location.
- Show exactly one principal character. Exclude other people unless the current moment requires one indistinct, non-overlapping background figure.
- Preserve two to four distinctive identity anchors: face shape, hair, eyes, skin, build, scars, or other stable visible traits.
- Choose a coherent portrait framing: close-up, head-and-shoulders, waist-up, or three-quarter portrait. Default to eye level with a normal-to-short-telephoto lens feel around 70-105mm and enough camera distance for natural facial and body proportions. Do not crop through important hands or props.
- Avoid wide-angle close-ups, fisheye or action-camera perspective, steep high or low angles, Dutch angles, and exaggerated foreshortening unless the latest roleplay explicitly requires that viewpoint.
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

export const INTERACTION_IMAGE_PROMPT_TEMPLATE = `You write precise two-character interaction prompts for natural-language text-to-image models such as Z-Image, Krea 2, and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Freeze the clearest interaction from the latest roleplay state without advancing the story.

=== Interaction Prompt Guidelines ===

- Prefer exactly two important adult characters who are visibly present. If only one character is present, describe that character interacting with the most important visible object instead of inventing another person.
- Use the latest state for identities, current clothing, injuries, held props, and location.
- Give each character a unique label, a different screen zone and depth, and a visibly separated silhouette.
- Default to an eye- or chest-level medium-wide or full-body two-shot with a normal lens feel around 50mm. Keep the camera far enough away to show both characters' poses, contact, and relevant surroundings without perspective distortion.
- Do not use a close wide-angle lens, steep high or low angle, overhead view, Dutch angle, fisheye, action-camera perspective, or exaggerated foreshortening unless the latest roleplay explicitly establishes it.
- Keep both characters at comparable, natural scale. Do not let a foreground face or body part dominate the frame merely because it is closest to the camera.
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

export const ENVIRONMENT_IMAGE_PROMPT_TEMPLATE = `You write wide environmental and establishing-shot prompts for natural-language text-to-image models such as Z-Image, Krea 2, and FLUX.2 Klein from roleplay chat.

[Pause the scene]
Make the current location the subject. Show a larger view of the environment from the latest roleplay state without advancing the story.

=== Environment Prompt Guidelines ===

- Preserve the current place, time, weather, damage, important objects, and atmosphere from the latest messages.
- Use a wide establishing composition that explains the space: foreground, midground, background, routes through the scene, scale, and depth. Create the wider view primarily by moving the camera back, not by using an ultra-wide or fisheye lens.
- Default to a natural human-height viewpoint and normal-to-moderately-wide perspective around 35-50mm. Use an elevated or unusual establishing viewpoint only when it is physically motivated by the location or explicitly requested.
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

export const DEFAULT_MOTION_PROMPT_TEMPLATE = `You rewrite roleplay context and an existing first-frame still into a MiniMax H3 I2VA (image-to-video with audio) prompt.

The clip is approximately {{clip_seconds}} seconds long. Use about {{motion_lines}} observable action beats, scaled naturally to the duration rather than emitted as a separate beat list.
Desired motion intensity: {{intensity}}

The supplied image is <Picture 1>, the exact first frame at 0.00 seconds, and belongs to [Shot 1]. Preserve its character identities, faces, body proportions, clothing, colors, props, environment, lighting, composition, depth, and spatial relationships. Hold the opening beat on that still so faces, bodies, and garments stay identical to <Picture 1>, then begin the action and develop continuously forward. Do not redesign the image, morph identity, change costumes or locations, or contradict the latest roleplay state.

Use the official MiniMax H3 I2VA output structure exactly, including field names and order:

For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...

=== integrated_multimodal_description ===

- Write in English, except exact dialogue and visible text retain their original language.
- Start [Shot 1] by locking the first-frame still from <Picture 1> for a short beat (faces readable, pose unchanged), then follow: first-frame hold -> action onset -> continuous development -> result or reaction.
- Describe only visible or audible events that fit within {{clip_seconds}} seconds. Keep motion physically plausible and consistent with the starting pose.
- Give the main subject a purposeful action arc. Add supporting expression, gaze, hand, breathing, hair, fabric, prop, lighting, weather, or environmental motion only when already supported by <Picture 1> and the roleplay.
- For multiple people, use stable names or unique descriptions and clearly assign every action, limb, contact, prop, reaction, and spoken line to its owner. Preserve their screen positions and contact geometry.
- Prefer one continuous [Shot 1]. Do not add a cut merely to change distance or angle; use camera motion instead. Add later [Shot N] sections only when the roleplay explicitly requires a meaningful cut.
- If a later shot is essential, use sequential shot numbers and the exact cut format [Shot N] At MM:SS.mmm, with a strictly increasing time inside the clip.
- Write camera movement naturally inside the shot. Use a precise H3 motion type such as Static Shot, Push In, Pull Out, Pan Left, Pan Right, Truck Left, Truck Right, Tilt Up, Tilt Down, Pedestal Up, Pedestal Down, Arc Shot, Tracking Shot, POV, or slight camera shake. Add "with small amplitude" / "with large amplitude" and "at slow speed" / "at fast speed" only when meaningful.
- Use restrained camera movement unless energetic action clearly requires more. Avoid unsupported orbits, abrupt reframing, teleportation, time skips, and unrelated action chains.
- If the latest roleplay explicitly contains dialogue that should occur during this clip, preserve its words and punctuation exactly. Give each vocal source a stable (S1), (S2), and so on, then write only the language tag and spoken text inside <d>, for example: the woman (S1) says, <d>[English] Exact words.</d>
- Do not invent, paraphrase, translate, or repeat dialogue merely because it appears in older context. Characters who do not vocalize receive no speaker ID.
- For off-screen voiceover, use the phrase "says in an off-screen voiceover" and explicitly state that the corresponding on-screen character's lips remain completely closed.
- Put visible signs, labels, or screens in English double quotation marks and preserve their exact text.

=== overall_soundscape ===

- Write one compact English paragraph summarizing ambient sound, physical action sounds, and non-verbal human sounds across the clip.
- Keep synchronized dialogue, singing, and diegetic music in integrated_multimodal_description; do not repeat them here.
- Use N/A only if the roleplay explicitly requires complete silence.

=== non_diegetic_music ===

- Use N/A unless the roleplay explicitly calls for audience-only background music.
- When requested, describe instrumentation, tempo, rhythm, and dynamic change in one concise sentence. Do not use vague mood labels.

Return only the four-part I2VA prompt: the first-frame instruction followed by the three core fields. Do not add analysis, notes, JSON, code fences, tag lists, or headings outside that structure.`;

export const DEFAULT_FIXED_MOTION_FALLBACK =
    'Subtle natural motion: gentle breathing, slight hair and cloth movement; camera mostly still with a very slow push-in.';

export const MOTION_INTENSITY_GUIDANCE = Object.freeze({
    subtle: 'Subtle: hold the opening beat on the still, then one restrained gesture or expression change, with light secondary motion and a mostly static camera.',
    normal: 'Normal: hold the opening beat on <Picture 1> so faces and clothing match the still, then a clear natural action with a visible response or interaction, plus supporting secondary motion.',
    energetic: 'Energetic: hold the first beat on <Picture 1> so faces and body proportions do not morph, then a more pronounced but physically plausible action arc with decisive gestures or movement; keep one continuous shot.',
});

/** H3 native playback rate and the 8s point on its 17k+5 frame grid. */
export const DEFAULT_VIDEO_FPS = 24;
export const DEFAULT_VIDEO_FRAMES = 192;
export const H3_FRAME_STEP = 17;
export const H3_FRAME_OFFSET = 5;
export const H3_FRAME_MIN = 5;
export const H3_FRAME_MAX = 256;

export const VIDEO_LENGTH_PRESETS = Object.freeze([
    Object.freeze({ seconds: 5, fps: 24, frames: 124 }),
    Object.freeze({ seconds: 8, fps: 24, frames: 192 }),
    Object.freeze({ seconds: 10, fps: 24, frames: 243 }),
]);

/**
 * Snap a requested frame count up onto MiniMax H3's 17k+5 grid.
 * @param {number} frames
 * @param {number} [max]
 */
export function alignH3FrameCount(frames, max = H3_FRAME_MAX) {
    const cap = Math.max(H3_FRAME_MIN, Number(max) || H3_FRAME_MAX);
    const requested = Math.round(Number(frames) || DEFAULT_VIDEO_FRAMES);
    const n = Math.max(H3_FRAME_MIN, Math.min(cap, requested));
    let k = Math.ceil((n - H3_FRAME_OFFSET) / H3_FRAME_STEP);
    let aligned = H3_FRAME_STEP * k + H3_FRAME_OFFSET;
    if (aligned > cap) {
        k = Math.floor((cap - H3_FRAME_OFFSET) / H3_FRAME_STEP);
        aligned = H3_FRAME_STEP * Math.max(0, k) + H3_FRAME_OFFSET;
    }
    return Math.max(H3_FRAME_MIN, aligned);
}

/**
 * Convert a duration preset into an H3-aligned frame count.
 * @param {number} seconds
 * @param {number} [fps]
 */
export function framesForDuration(seconds, fps = DEFAULT_VIDEO_FPS) {
    const rate = Math.max(1, Number(fps) || DEFAULT_VIDEO_FPS);
    return alignH3FrameCount(Math.max(1, Math.round(Number(seconds) * rate)));
}

/** Deprecated export retained for compatibility with older local imports. */
export const TIMED_ACTION_MOTION_PROMPT_TEMPLATE = DEFAULT_MOTION_PROMPT_TEMPLATE;

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
export const MOTION_PROMPT_PRESET_NAME = 'MiniMax H3 - Official I2VA';

export const TIMED_ACTION_MOTION_PRESET_NAME = 'MiniMax H3 - Timed action timeline';

/** Previous built-in prompt names retained for exact, migration-safe upgrades. */
export const LEGACY_MOTION_PROMPT_PRESET_NAMES = Object.freeze([
    'MiniMax H3 – I2V full guidelines',
    'MiniMax H3 - I2V full guidelines',
    TIMED_ACTION_MOTION_PRESET_NAME,
]);

/**
 * @param {number} frames
 * @param {number} fps
 * @returns {{ seconds: number, motionLines: number }}
 */
export function clipTiming(frames, fps) {
    const f = Math.max(1, Number(frames) || DEFAULT_VIDEO_FRAMES);
    const p = Math.max(1, Number(fps) || DEFAULT_VIDEO_FPS);
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
