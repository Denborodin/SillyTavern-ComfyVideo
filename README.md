# ComfyVideo for SillyTavern

Two-step **scene image → image-to-video (I2V)** UI extension using **local ComfyUI**.

**This is not the built-in Image Generation extension.**  
All settings, workflows, and prompt templates live under `extension_settings.ComfyVideo` and do **not** share config with `extension_settings.sd`.

## Install

Already placed at:

`SillyTavern/data/default-user/extensions/ComfyVideo/`

Restart SillyTavern (or reload extensions). Enable under **Extensions**.

## Requirements

1. **ComfyUI** running (default `http://127.0.0.1:8188`)
2. SillyTavern can reach ComfyUI for **generate/ping** (via ST’s `/api/sd/comfy/*` proxy — no CORS needed for generation)
3. For **I2V image upload** (recommended): browser must reach ComfyUI `POST /upload/image`. If blocked by CORS, start ComfyUI with CORS enabled, e.g.:
   - `--enable-cors-header *`
   - or `--enable-cors-header http://127.0.0.1:8000` (your ST origin)
4. API-format workflows for **Image (T2I)** and **I2V** pasted into ComfyVideo settings
5. Optional: **Connection Manager** profile for background LLM prompt building

## Usage

### Setup

1. Extensions → **ComfyVideo – Scene Image → I2V**
2. Set ComfyUI URL → **Test Connection**
3. Paste **Image** workflow API JSON  
   Placeholders: `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`
4. Paste **I2V** workflow API JSON  
   Placeholders: `"%image%"` (LoadImage **filename** after upload), `"%prompt%"` (motion), `"%negative_prompt%"`, `"%seed%"`, `"%frames%"`, `"%fps%"`  
   Fallback: `"%image_base64%"` if upload fails / base64 mode
5. **LLM prompt builder**
   - **Connection profile (background)** — recommended: pick a dedicated Connection Manager profile (model/API). Does **not** post into the character chat and does **not** switch your main UI profile.
   - **Quiet gen** — uses the current main ST model via `generateQuietPrompt`
   - **Manual** — you supply the image prompt yourself

### Step 1 – Scene image

- Extensions wand menu → **Generate Scene Image**, or slash: `/sceneimage`
- Builds a prompt from the last N messages (via LLM or manual)
- Runs the Image workflow in ComfyUI
- Attaches the still to the last (or new) message and tags it for I2V

### Step 2 – Generate video

- On a ComfyVideo-tagged message, click the **film** button (**Generate Video**)
- Extension **uploads** the still to ComfyUI (`/upload/image`), then runs the I2V workflow
- Video (or gif/webm/mp4) is attached to the same message (or a new one)

## Architecture notes

| Concern | Behavior |
|--------|----------|
| Settings | `extension_settings.ComfyVideo` only |
| Generate / ping | ST proxy `/api/sd/comfy/*` |
| I2V image input | **Comfy upload first**; base64 fallback |
| Prompt LLM | Background request with selected **connection profile**, or quiet/manual |
| Chat pollution | LLM intermediate turns are **not** written to chat |

## Exporting workflows

In ComfyUI: enable **Dev mode** → **Save (API Format)**.  
Ensure LoadImage (or equivalent) uses a string input you can set to `"%image%"` in the JSON.

## License

AGPL-3.0
