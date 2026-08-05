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
- Video length presets (2s–6s) + frames/FPS  
- Pick image & I2V workflows and LLM instruction presets  
- Choose Realistic, Western comic, or a saved custom image style
- **Generate scene image** / **Generate video** (latest ComfyVideo still)  
- Link to full extension settings  

Per-message film button still works for I2V on a specific message.

**Generate scene video** runs the existing scene-image flow followed by H3 for
the exact still it just attached. Image and motion prompt previews still appear
when enabled in settings.

## Setup

1. ComfyUI + CORS for upload/WS  
2. LLM: connection profile (recommended) or quiet gen  
3. Full settings → library → **Edit** paste API workflows  
4. Wand **ComfyVideo** panel for day-to-day generation  


### Placeholders

**Image:** `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`  

**I2V:** `"%image%"`, `"%prompt%"`, `"%frames%"`, `"%fps%"`, …  

**Resolution:** 768×1344 or 1344×768 (shared).

Custom styles are appended to the final image prompt and shown in the prompt
preview. Instruction-library entries remain user-editable and are not replaced
when the extension loads.

## Bundled workflows

The extension includes editable copies of the tested local workflows below.
They are added only once and are never overwritten; use **Add missing bundled
workflows** in Library backup to explicitly restore a deleted copy.

- **Z-Image Turbo** uses `z_image_turbo_bf16.safetensors`, `ae.safetensors`,
  and `qwen_3_4b.safetensors`. It accepts prompt, negative prompt, seed, width,
  and height placeholders.
- **MiniMax H3 I2V** uses the MiniMax H3 UNet, Qwen3-VL clip, video/audio VAEs,
  and the built-in `MiniMaxH3ImageToVideo` plus video nodes. It accepts image,
  prompt, seed, frames, FPS, width, and height placeholders.

You can edit, duplicate, delete, or replace either workflow in the normal
library. The committed assets include only the workflows supplied by the local
tested setup; other models remain supported through user-imported API JSON.

## License

AGPL-3.0
