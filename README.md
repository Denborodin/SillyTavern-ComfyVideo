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

## Setup

1. ComfyUI + CORS for upload/WS  
2. LLM: connection profile (recommended) or quiet gen  
3. Library → **Edit** paste API workflows with placeholders  
4. `/sceneimage` or wand → film button on message for I2V  

### Placeholders

**Image:** `"%prompt%"`, `"%negative_prompt%"`, `"%seed%"`, `"%width%"`, `"%height%"`  

**I2V:** `"%image%"`, `"%prompt%"`, `"%frames%"`, `"%fps%"`, …  

**Resolution:** 768×1344 or 1344×768 (shared).

## License

AGPL-3.0
