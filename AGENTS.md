# Project instructions

This repository contains a frontend-only SillyTavern extension that generates a scene image through ComfyUI and can animate that image with MiniMax H3.

## Hard constraints

- Do not modify SillyTavern core.
- Keep every change inside this extension repository.
- Preserve compatibility with existing saved settings, workflow libraries, instruction libraries, and imported ComfyUI API workflow JSON.
- Ship proven sample ComfyUI API workflows in Git as versioned extension assets.
- Bundled workflows must be copied into the user's editable workflow library; users can edit, duplicate, delete, import, and add their own workflows.
- Never overwrite a user-edited workflow merely because a newer bundled version exists.
- MiniMax H3 is the only supported video model in this iteration.
- Image workflows remain generic ComfyUI API workflows and may target Z-Image Turbo, Krea 2 Turbo, FLUX.2 Klein, or other natural-language T2I models.
- The repository should include tested sample workflows for Z-Image Turbo, Krea 2 Turbo, FLUX.2 Klein T2I, and MiniMax H3 I2V.
- Do not add reference-image or character-reference support in this iteration.
- Do not add multiple ComfyUI backends, server-side components, proxy endpoints, job infrastructure, model autodetection, or a structured SceneSpec.
- Avoid new runtime dependencies unless there is a clear and documented need.
- Prefer small changes that fit the current project structure and coding style.
- The extension UI must work well in both desktop and narrow mobile SillyTavern layouts.

## Product direction

- Keep one universal natural-language image-prompt generator.
- Keep model-specific behavior inside the selected ComfyUI workflow wherever possible.
- Add simple visual-style selection for realistic and Western-comic output.
- Keep the current two-stage flow:
  1. Generate a complete still-image prompt from roleplay context.
  2. Generate a motion-focused H3 prompt from the still and recent context.
- Optimize for actual roleplay usage rather than benchmark-oriented prompting.

## Mobile UI rules

- Design mobile-first for widths down to 360 CSS pixels.
- Do not rely on hover.
- Avoid fixed widths that can exceed the viewport.
- No horizontal scrolling in the extension panel, settings sections, editors, or dialogs.
- Inputs, selects, textareas, buttons, and media previews must shrink within their containers.
- Use single-column layout on narrow screens.
- Let action rows wrap; use full-width primary actions where appropriate.
- Keep touch targets approximately 44 CSS pixels high where practical.
- Account for Android virtual-keyboard resizing.
- Keep important actions reachable without forcing users through long, permanently expanded advanced sections.
- Reuse SillyTavern theme variables and existing UI conventions.

## Expected workflow

Before editing:

1. Read `docs/implementation-plan.md`.
2. Inspect the existing code, especially:
   - `index.js`
   - `panel.html`
   - `settings.html`
   - `workflow-editor.html`
   - `style.css`
   - files under `lib/`
3. Identify current settings keys and persistence behavior.
4. Inspect how workflow-library entries are created, identified, imported, exported, edited, deleted, and selected.
5. Inspect supplied ComfyUI API JSONs and validate their placeholder contract.
6. Summarize the smallest file-level implementation plan.

During implementation:

- Work in the phases defined in the implementation plan.
- Do not mix unrelated refactors into feature changes.
- Preserve existing defaults unless the plan explicitly replaces them.
- Add comments only where behavior is non-obvious.
- Keep user-visible wording concise and suitable for mobile layouts.

After implementation:

- Run any existing checks available in the repository.
- Check for JavaScript errors and broken imports.
- Review the final diff against every acceptance criterion.
- Manually verify desktop and mobile layouts at approximately 360, 390, 412, 768, and desktop widths.
- Verify settings persistence and backward compatibility.
- Report any validation that could not be performed locally.
