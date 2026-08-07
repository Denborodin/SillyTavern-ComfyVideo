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

- **Z-Image (photo/still)** — roleplay focus: appearance, clothing, positions, actions (not VN-style tag dumps).
- **MiniMax H3 (video)** — I2V motion only; clip length from **frames ÷ fps** (≈ one line per 1–2 seconds).

Motion prompts **always** use the LLM (no fixed-only mode). Optional preview before generate.

## Generation panel

Wand menu → **ComfyVideo** (or `/comfyvideo`) opens a floating panel (Pathweaver-style):

- Portrait / landscape  
- Video length presets: 5s / 8s / 10s at 24 FPS (120 / 192 / 240 frames)
- Pick image & I2V workflows and LLM instruction presets  
- Choose Realistic, Western comic, or a saved custom image style
- **Generate scene image** / **Generate video** (selectable ComfyVideo still)
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

**Video resolution:** 768×1344 or 1344×768. Z-Image still quality is selectable:
video-safe 1×, High 1.5× (1152×2016 / 2016×1152), or Ultra 2×
(1536×2688 / 2688×1536). The bundled H3 v2 workflow resizes the uploaded source
still with ComfyUI's built-in Lanczos `ImageScale` node before conditioning, so
the original high-resolution still remains in chat while H3 receives a safe size.

Photo, realistic digital-art, and Western detailed-comic styles are appended
to both final image and motion prompts, and shown in their previews. Instruction
library entries remain user-editable and are not replaced when the extension loads.

## Bundled workflows

The extension includes editable copies of the tested local workflows below.
They are added only once and are never overwritten; use **Add missing bundled
workflows** in Library backup to explicitly restore a deleted copy.

- **Z-Image Turbo** uses `z_image_turbo_bf16.safetensors`, `ae.safetensors`,
  and `qwen_3_4b.safetensors`. It accepts prompt, negative prompt, seed, width,
  and height placeholders.
- **MiniMax H3 I2V v2** uses the MiniMax H3 UNet, Qwen3-VL clip, video/audio
  VAEs, built-in `ImageScale`, `MiniMaxH3ImageToVideo`, and video nodes. It
  resizes its source image to the H3 dimensions before generation and accepts
  image, prompt, seed, frames, FPS, width, and height placeholders.

You can edit, duplicate, delete, or replace either workflow in the normal
library. The committed assets include only the workflows supplied by the local
tested setup; other models remain supported through user-imported API JSON.

## License

AGPL-3.0
