# ComfyVideo roadmap

## Current state

ComfyVideo provides a two-step scene image to MiniMax H3 video flow with
editable libraries, prompt previews, workflow validation, mobile-friendly UI,
and bundled Z-Image Turbo, FLUX.2 Klein 9B, and MiniMax H3 workflows.

Completed recently:

- Compact panel with portrait/landscape controls and shared Photo, Digital art,
  and Western comic styles.
- H3 motion intensity: Subtle, Normal, and Energetic.
- Official MiniMax H3 I2VA prompt preset with first-frame alignment, structured
  audiovisual description, soundscape, and non-diegetic music fields.
- Immediate extension-side cancellation for quiet and connection-profile LLM
  prompt generation.
- Image and motion prompt previews auto-submit unchanged after 10 seconds and
  remain open after an edit.
- Bundled workflow seeding, safe restore, and editable user copies.
- Last-still thumbnail preview for the separate Generate video action.
- Selectable video source picker, preserving the selected still's orientation
  while H3 stays at its supported output dimensions.
- Quick video-duration presets: 5s / 120 frames, 8s / 192 frames, and
  10s / 240 frames, all at 24 FPS.
- Z-Image still-quality selector: video-safe 1×, High 1.5×, and Ultra 2×.
  The bundled H3 v2 workflow resizes the selected still with ComfyUI before
  conditioning, retaining the original high-resolution still in chat.
- Exact 3:4 portrait and 4:3 landscape presets at H3-safe 864×1152 and
  1152×864, with matching Z-Image quality multipliers that avoid cropping.
- Bundled FLUX.2 Klein 9B distilled text-to-image workflow using the official
  four-step, CFG 1, Euler configuration and the installed FP8 model set.
- Structured multi-character image prompting shared by Z-Image and FLUX.2
  Klein, with separate cast blocks, fixed screen positions, and explicit limb,
  contact, and prop ownership.
- Purpose-built Whole scene, Portrait, Interaction, and Environment image
  actions in a compact mobile-friendly grid, backed by editable prompt presets.

The combined Scene to Image to Video button was deliberately removed. The
day-to-day flow remains separate composition-specific image and Generate video
actions.

## Next recommended slice

### 1. Make results reproducible

- Store workflow ID, workflow version, style, intensity, dimensions, frames,
  FPS, seed, and final prompts with each generated image/video.
- Add Retry video, Edit and retry, and New motion prompt actions without
  needing to regenerate the still.

### 2. Verify MiniMax H3 timing

- Test the bundled H3 workflow with 120, 192, and 240 frame requests at
  24 FPS.
- Document any model-specific length alignment or maximum-duration rules.

## Backlog

### Roleplay quality

- Character appearance override for persistent visual traits.
- Prompt history and prompt variants on generated messages.
- Few-shot image and H3 prompt examples.
- Group-chat context that identifies active visible speakers.
- Negative-prompt library.

### Panel and workflow UX

- In-panel generation status and stop control.
- Quick instruction editor next to each preset selector.
- Keyboard shortcuts.
- ComfyUI availability indicator and disabled actions when offline.
- Import workflows from SillyTavern user workflow files.
- Placeholder auto-map assistance for imported API JSON.
- Named workflow/profile packs.

### Reliability

- Unit tests for placeholder substitution, clip timing, library migration,
  style/intensity assembly, and cancellation.
- Persist large libraries outside extension settings if settings-size limits
  become a problem.
- Theme and i18n pass.

### Later

- Auto-animate generated stills.
- Generated-media gallery.
- Lip-sync/TTS integration.
- Character reference images.
- Publish to the SillyTavern extension index.
