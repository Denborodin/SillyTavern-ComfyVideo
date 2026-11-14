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

- **Image composition presets (Z-Image / Krea 2 / FLUX.2 Klein)** — Whole scene,
  single-character Chest-up portrait and Full-body portrait (head to toe), and
  precise two- or three-person Interaction. The legacy Environment preset remains
  in the library. They default to natural camera distance and perspective,
  avoiding close wide-angle and dramatic viewpoints unless the scene calls for
  them. Each remains editable in the prompt library.
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
- Video length presets: 5s / 8s / 10s at 24 FPS (124 / 192 / 243 frames, H3 17k+5 grid)
- Pick image and I2V workflows; edit all LLM instruction presets in Full settings
- Choose Realistic, Western comic, or a saved custom image style
- Choose `Auto`, no characters, or an explicit one-to-three-character cast for the next image
- **Whole scene**, **Chest-up portrait**, **Interaction**, or **Full-body portrait** image actions
- **Generate video** from a selectable ComfyVideo still
- Link to full extension settings  

Per-message film button still works for I2V on a specific message.

Image generation from a message's quickbar uses that message as its reference
and inserts the result immediately after it. The global ComfyVideo menu uses
the latest roleplay message and follows the attachment setting (New message
appends at the end). Quick Regen adds another image to the existing gallery.

The panel shows the reference message number, actual output dimensions, and
attachment destination. References survive earlier message insertions; changing
chats or deleting/editing the reference requires reopening the panel.

Current-model mode (the saved `quiet` setting) sends only the selected context
through SillyTavern's cancellable Chat Completion or Text Completion request
service. Other backends require a connection profile. It no longer adds the
host's full chat history. Each job snapshots extension settings when started.

Fresh images use the current workflow, size, and composition. Quick Regen uses
the selected image's saved recipe. A selected custom image instruction is used
for its composition; legacy custom presets without a composition apply to all
image actions. Save as preserves the original preset's composition.

Completed media is saved before chat attachment. If the chat changes or saving
the attachment fails, open **Saved results** in the panel to open the saved media
and copy its prompt, even after reloading. Successfully attached results remain
in their chat and are removed from this recovery list.

## Setup

1. ComfyUI + CORS for upload/WS  
2. LLM: connection profile (recommended) or quiet gen  
3. Full settings → library → **Edit** paste API workflows  
4. Wand **ComfyVideo** panel for day-to-day generation  


### Placeholders

**Image:** `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`  

**I2V:** `"%image%"`, `"%prompt%"`, `"%frames%"`, `"%fps%"`, …  

**Video resolution:** 864×1152 (3:4) or 1152×864 (4:3). **Image size** follows
the selected workflow's model. Portrait sizes (width/height swap for landscape):

| Model | Small | Medium | Large |
| --- | --- | --- | --- |
| Z-Image Turbo | 768×1024 | 864×1152 | 1104×1472 |
| Krea 2 Turbo, both variants | 864×1152 | 1056×1408 | 1200×1600 |
| MOSS-Image SFT | 864×1152 | 1056×1408 | 1200×1600 |
| Custom / generic | 864×1152 | 1296×1728 | 1728×2304 |

All dimensions are multiples of 16. Krea and MOSS stay near 1–2 MP.
Choose **Image model** in a workflow's editor to bind an imported or customized
workflow to its prompt guidance and size presets. Save as and library backups
preserve this choice. Generic workflows keep their previous dimensions.

The bundled H3 v2 workflow resizes the uploaded source
still with ComfyUI's built-in Lanczos `ImageScale` node before conditioning, so
the original high-resolution still remains in chat while H3 receives a safe size.
Turbo A v2 instead passes the source still directly to `MiniMaxH3ImageToVideo`,
matching the supplied API graph; its output dimensions still come from the panel.

The image LLM receives the selected model, actual canvas size, orientation,
and visual style alongside the composition instructions. It integrates the
style into the caption; no style suffix is added afterwards. H3 still receives
style guidance inside `[Shot 1]`, preserving its field order. Both final prompts
are shown in their previews. Quick Regen reuses the original prompt, workflow,
and dimensions, including images created before these size presets. Instruction
library entries remain user-editable and customized entries are not replaced
when the extension loads. See the official
[MiniMax H3 prompt guides](https://huggingface.co/MiniMaxAI/MiniMax-H3/tree/main/docs).

## Bundled workflows

The extension includes editable copies of the tested local workflows below.
They are added once per version. User-edited copies are never overwritten;
untouched ZIT v1 copies are upgraded to v2. Use **Add missing bundled
workflows** in Library backup to explicitly restore a deleted copy.
The T2I catalog contains Z-Image Turbo, Krea 2 Turbo, and MOSS-Image SFT.
Untouched bundled FLUX.2 Klein copies are removed on reload; customized and
imported copies remain in the editable library.

- **Z-Image Turbo v2** uses `z_image_turbo_bf16.safetensors`, `ae.safetensors`,
  and `qwen_3_4b.safetensors`. It follows the [official ComfyUI template](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_z_image_turbo.json):
  one sampler, 8 `res_multistep` / `simple` steps, CFG 1, shift 3, and zero
  negative conditioning. It accepts prompt, seed, width, and height placeholders
  and needs only built-in nodes. Untouched saved v1 and legacy single-workflow
  copies upgrade on reload; edited copies receive a separate v2 entry.
- **Krea 2 Turbo + KNP V4.1** uses `krea2_turbo_fp8_scaled.safetensors`,
  `qwen3vl_4b_fp8_scaled.safetensors`, `qwen_image_vae.safetensors`, and the
  `KNPV4.1_pre.safetensors` LoRA at strength 1. It uses 12 Euler/simple steps,
  CFG 1, zero negative conditioning, and accepts prompt, seed, width, and height
  placeholders. It requires a ComfyUI build with Krea 2 loader support; all
  workflow nodes are built in.
- **Krea 2 Turbo — Standard** uses the same model, encoder and VAE as the KNP
  variant, with no LoRA and 8 Euler/simple steps at CFG 1. Both variants remain
  available in the main **Image workflow** selector.
- **MOSS-Image SFT** uses native nodes in [ComfyUI 0.42.1 or later](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.42.1).
  Put these [Comfy-Org weights](https://huggingface.co/Comfy-Org/MOSS-Image) under
  ComfyUI's `models/` directory: `diffusion_models/moss_image_sft_int8_convrot.safetensors`,
  `text_encoders/qwen3.5_9b_w4a8_gptq.safetensors`, and `vae/flux2-vae_small.safetensors`.
  The workflow uses 25 `er_sde` / `simple` steps at CFG 2.5. It accepts prompt,
  optional negative prompt, seed, width, and height placeholders. Select it in
  the **Image workflow** dropdown. Start with image size **Small**
  for 864 × 1152 or 1152 × 864, close to the [recommended 1 MP starting size](https://docs.comfy.org/tutorials/image/moss-image/moss-image#prompting-tips).
- **MiniMax H3 I2V Turbo A v2** is the default I2V workflow, adapted from
  `minimax_h3_i2v_turbo_A_api.json`. It uses the same H3 base files as H3 I2V v2
  and passes the loaded image directly to H3 without an `ImageScale` node. It applies
  `minimax_h3_turbo_v4_step600_ema.safetensors` at strength 1.0 through
  `MiniMaxH3TurboLoRA` and samples 8 `simple` steps with
  `MiniMaxH3TurboSampler`. `H3SLAAttention` sits between the Turbo LoRA and both
  the scheduler and guider: sparsity 0.9, block size 64, minimum sequence length
  8192, zero dense last steps, and audio protection enabled. It accepts image,
  prompt, seed, frames, FPS, width, and height placeholders; the sample's fixed
  prompt, input filename, seed, 832×1248 size, 362 frames, and 24 FPS are replaced
  by panel values. Negative prompting is not used by this graph. Required
  extras: [ComfyUI-MiniMax-H3-Turbo](https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo)
  and the [Turbo v4 600 EMA LoRA](https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora),
  plus a node installation providing `H3SLAAttention`. ComfyUI must also support
  the supplied H3 loaders, video/audio VAEs, and MP4/H.264 output nodes.
  Fresh installs select it automatically. Existing installs still on bundled
  H3 I2V v2 are switched once; a custom or later I2V selection is left alone.
  Existing Turbo users receive a separate **MiniMax H3 I2V Turbo A v2** library
  entry on reload; select it in the I2V workflow dropdown to use the update.
  Saved older workflows and custom edits are preserved. The imported graph and
  placeholder substitutions are validated locally; GPU generation has not been rerun.
- **MiniMax H3 I2V v2** remains as a fallback that does not need the Turbo
  custom nodes. It uses the MiniMax H3 UNet, Qwen3-VL clip, video/audio VAEs,
  built-in `ImageScale`, `MiniMaxH3ImageToVideo`, and video nodes. It samples
  20 `res_multistep` / simple steps and accepts image, prompt, seed, frames,
  FPS, width, and height placeholders.

You can edit, duplicate, delete, or replace any workflow in the normal
library. The committed assets include only the workflows supplied by the local
tested setup; other models remain supported through user-imported API JSON.

## License

AGPL-3.0
