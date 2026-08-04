# ComfyVideo for SillyTavern

Two-step **scene image → image-to-video (I2V)** UI extension using **local ComfyUI**.

**Not** the built-in Image Generation extension — all settings live under `extension_settings.ComfyVideo`.

## Install

```text
SillyTavern/data/<user>/extensions/ComfyVideo/
```

Or clone into that path. Restart SillyTavern / reload extensions.

## Requirements

1. **ComfyUI** at e.g. `http://127.0.0.1:8188`
2. **CORS** on ComfyUI for browser upload + progress WebSocket, e.g.  
   `--enable-cors-header *` or your ST origin
3. API-format **Image** and **I2V** workflows pasted in settings
4. Optional: Connection Manager **profile** for background prompt LLM

## Usage

1. Set Comfy URL → **Test Connection**
2. Choose resolution: **768×1344** or **1344×768** (shared by image + video)
3. Paste Image + I2V API workflows  
   - Image: `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`  
   - I2V: `"%image%"` (LoadImage filename after upload), motion `"%prompt%"`, `"%frames%"`, `"%fps%"`, etc.
4. Pick LLM mode: **connection profile** (recommended) or **quiet** (main model). **Use completion preset** is **off** by default so RP presets don’t pollute prompts.  
   Set **Image LLM instructions** and **Video LLM instructions** (used when motion source = Auto).
5. Wand → **Generate Scene Image** (or `/sceneimage`) → optional prompt preview → still in chat  
6. Film button on that message → optional **motion prompt preview** → upload → I2V → video

Status panel shows **Stop** and a **progress bar** (Comfy WebSocket when available; otherwise indeterminate).

## Notes

| Topic | Behavior |
|--------|----------|
| Settings | `ComfyVideo` only — never `extension_settings.sd` |
| Generate / ping | ST `/api/sd/comfy/*` |
| I2V image | Comfy `POST /upload/image` only (no base64 path) |
| LLM preset | Ignored by default; optional checkbox |
| Resolution | One setting for both steps |

## License

AGPL-3.0
