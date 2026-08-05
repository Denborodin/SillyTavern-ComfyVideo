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

## License

AGPL-3.0
