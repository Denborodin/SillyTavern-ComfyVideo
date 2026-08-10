# ComfyVideo for SillyTavern

Two-step **scene image → I2V** using local **ComfyUI**. Separate from built-in Image Generation.

## Libraries

Save and switch on the fly:

| Library | UI |
|--------|-----|
| Image workflows | Dropdown · **Edit** (API JSON popup, same idea as ST Image Gen) · Save as · Delete |
| I2V workflows | same |
| Image LLM instructions | Dropdown · textarea · Save / Save as / Delete |
| Video LLM instructions | same (`{{clip_seconds}}`, `{{motion_lines}}`) |

Export / Import JSON under **Library backup**.

## LLM prompts (defaults)

Tuned for **natural language**:

- **Image composition presets (Z-Image / FLUX.2 Klein)** — Whole scene,
  single-character Portrait, precise two-person Interaction, and wide
  Environment prompts. Each remains editable in the prompt library.
- **MiniMax H3 (video)** — official I2VA structure with a first-frame
  `<Picture 1>` anchor, `integrated_multimodal_description`,
  `overall_soundscape`, and `non_diegetic_music`. Action density still scales
  from **frames ÷ fps**.

Motion prompts **always** use the LLM (no fixed-only mode). Prompt previews
auto-submit after 10 seconds unless you edit the prompt; then they remain open
until you Generate or Cancel.

## Generation panel

Wand menu → **ComfyVideo** (or `/comfyvideo`) opens a floating panel (Pathweaver-style):

- Portrait / landscape  
- Video length presets: 5s / 8s / 10s at 24 FPS (120 / 192 / 240 frames)
- Pick image and I2V workflows; edit all LLM instruction presets in Full settings
- Choose Realistic, Western comic, or a saved custom image style
- **Whole scene**, **Portrait**, **Interaction**, or **Environment** image actions
- **Generate video** from a selectable ComfyVideo still
- Link to full extension settings  

Per-message film button still works for I2V on a specific message.

## Setup

1. ComfyUI + CORS for upload/WS  
2. LLM: connection profile (recommended) or quiet gen  
3. Full settings → library → **Edit** paste API workflows  
4. Wand **ComfyVideo** panel for day-to-day generation  


### Placeholders

**Image:** `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`  

**I2V:** `"%image%"`, `"%prompt%"`, `"%frames%"`, `"%fps%"`, …  

**Video resolution:** 864×1152 (3:4) or 1152×864 (4:3). Z-Image still quality is
selectable: video-safe 1×, High 1.5× (1296×1728 / 1728×1296), or Ultra 2×
(1728×2304 / 2304×1728). The bundled H3 v2 workflow resizes the uploaded source
still with ComfyUI's built-in Lanczos `ImageScale` node before conditioning, so
the original high-resolution still remains in chat while H3 receives a safe size.

Photo, realistic digital-art, and Western detailed-comic styles are appended
to image prompts and inserted into H3's `[Shot 1]`, so the official field order
remains valid. Both final prompts are shown in their previews. Instruction
library entries remain user-editable and customized entries are not replaced
when the extension loads. See the official
[MiniMax H3 prompt guides](https://huggingface.co/MiniMaxAI/MiniMax-H3/tree/main/docs).

## Bundled workflows

The extension includes editable copies of the tested local workflows below.
They are added only once and are never overwritten; use **Add missing bundled
workflows** in Library backup to explicitly restore a deleted copy.

- **Z-Image Turbo** uses `z_image_turbo_bf16.safetensors`, `ae.safetensors`,
  and `qwen_3_4b.safetensors`. It accepts prompt, negative prompt, seed, width,
  and height placeholders.
- **FLUX.2 Klein 9B** uses the distilled `flux-2-klein-9b-fp8.safetensors`,
  `qwen_3_8b_fp8mixed.safetensors`, and `full_encoder_small_decoder.safetensors`.
  It follows the official four-step, CFG 1, Euler configuration and accepts
  prompt, seed, width, and height placeholders. It uses only built-in ComfyUI
  nodes and intentionally zeroes negative conditioning.
- **MiniMax H3 I2V v2** uses the MiniMax H3 UNet, Qwen3-VL clip, video/audio
  VAEs, built-in `ImageScale`, `MiniMaxH3ImageToVideo`, and video nodes. It
  resizes its source image to the H3 dimensions before generation and accepts
  image, prompt, seed, frames, FPS, width, and height placeholders.

You can edit, duplicate, delete, or replace any workflow in the normal
library. The committed assets include only the workflows supplied by the local
tested setup; other models remain supported through user-imported API JSON.

## License

AGPL-3.0
