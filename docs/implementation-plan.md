# ComfyVideo improvement plan

## 1. Goal

Improve the existing SillyTavern ComfyVideo extension without changing SillyTavern core or expanding the backend architecture.

This iteration should:

1. Make the floating generation panel and extension settings usable on mobile.
2. Replace the image prompt default with a stronger universal natural-language instruction suitable for:
   - Z-Image Turbo
   - Krea 2 Turbo
   - FLUX.2 Klein text-to-image
3. Add simple visual-style selection:
   - Realistic
   - Western comic
   - Custom
4. Improve the MiniMax H3 motion-prompt default.
5. Commit tested sample ComfyUI API workflows to the repository.
6. Seed bundled workflows into the existing user-editable workflow library.
7. Preserve existing workflows, instruction libraries, settings, and normal desktop use.

The implementation should stay modest. The extension already has the right basic product flow; this work is refinement, not a rewrite.

---

## 2. Current product assumptions

The repository currently provides:

- separate image and I2V ComfyUI workflow libraries;
- separate image and video LLM instruction libraries;
- a floating generation panel;
- scene-image generation followed by image-to-video generation;
- prompt preview;
- workflow placeholders for prompt, seed, dimensions, frames, FPS, and image input;
- per-message video generation;
- extension settings and workflow editors;
- no versioned sample ComfyUI API workflow JSONs currently committed.

The current architecture should remain intact unless a small change is necessary to satisfy this specification.

Relevant files likely include:

- `index.js`
- `panel.html`
- `settings.html`
- `workflow-editor.html`
- `style.css`
- `lib/defaults.js`
- `lib/prompt-builder.js`
- `lib/workflow.js`
- `lib/comfy-client.js`

Codex must inspect the repository before assuming exact ownership of behavior.

---

## 3. Scope

### 3.1 In scope

- Responsive mobile layout for the generation panel.
- Responsive mobile layout for extension settings and workflow/instruction editors.
- One universal image-prompt instruction for natural-language T2I models.
- Realistic and Western-comic style presets.
- A custom editable style value.
- Appending the chosen style to the generated image prompt.
- H3-only video support.
- Improved H3 motion-prompt instruction.
- Clearer and shorter mobile-friendly labels where useful.
- Backward-compatible settings migration.
- Versioned bundled ComfyUI API workflow JSON files committed to Git.
- Migration-safe seeding of bundled workflows into the editable user library.
- A restore/add-missing action for bundled workflows.
- Documentation updates where existing README behavior changes.

### 3.2 Out of scope

- Reference-image inputs.
- Character-reference libraries.
- Character LoRA management.
- Changes to SillyTavern core.
- Changes requiring a SillyTavern server plugin.
- Multiple ComfyUI backends.
- Generic job queues or concurrency redesign.
- Other video models.
- Audio-specific feature design.
- Model autodetection.
- Automatic workflow generation.
- Locking bundled workflows against editing or deletion.
- Silently synchronizing or overwriting user-edited workflows from Git assets.
- Structured scene JSON or SceneSpec.
- New databases or backend services.
- Large refactors unrelated to the requested behavior.

---

## 4. Bundled sample workflows

### 4.1 Goal

Commit a small set of tested ComfyUI API workflow JSON files so a fresh install works without requiring the user to paste every workflow manually.

Bundled workflows are defaults and examples, not a closed catalog. After import into the library, users must be able to edit, duplicate, rename, delete, export, and replace them, and add arbitrary custom workflows later.

### 4.2 Proposed repository layout

```text
workflows/
  manifest.json
  image/
    z-image-turbo.json
    krea-2-turbo.json
    flux-2-klein.json
  video/
    minimax-h3-i2v.json
```

The actual filenames may be adjusted after validating the supplied workflows.

`workflows/manifest.json` should contain lightweight metadata:

```json
{
  "schemaVersion": 1,
  "workflows": [
    {
      "id": "builtin.image.z-image-turbo",
      "version": 1,
      "name": "Z-Image Turbo",
      "kind": "image",
      "file": "image/z-image-turbo.json",
      "description": "Fast realistic text-to-image sample workflow",
      "requiredPlaceholders": [
        "%prompt%",
        "%seed%",
        "%width%",
        "%height%"
      ],
      "optionalPlaceholders": [
        "%negative_prompt%"
      ]
    }
  ]
}
```

Do not commit model weights, generated media, secrets, private URLs, absolute local paths, or ComfyUI cache data.

### 4.3 Library seeding and migration

On a fresh install:

- load the bundled manifest;
- load each bundled API JSON;
- add each workflow to the existing editable image or video workflow library;
- select sensible defaults only when the user has no existing selection.

On upgrade:

- add a bundled workflow only when that bundled ID and version have not been seeded before;
- never replace an entry based only on its display name;
- never overwrite a user-edited copy;
- preserve existing custom workflows and current selections;
- allow users to delete bundled copies;
- do not restore deleted copies on every reload;
- provide an explicit `Restore bundled workflows` or `Add missing bundled workflows` action.

Track imported versions separately from mutable workflow content. A small settings record is enough:

```js
installedBundledWorkflowVersions: {
  "builtin.image.z-image-turbo": 1,
  "builtin.video.minimax-h3-i2v": 1
}
```

A future version should be added as a separate, clearly versioned library entry or restored only through an explicit user action. It must not silently replace an edited older copy.

### 4.4 Editable library entries

Once copied into the user's library, a bundled workflow behaves like any other workflow.

Recommended optional provenance metadata:

```js
{
  id: "user-library-entry-id",
  name: "Z-Image Turbo",
  workflow: {},
  source: {
    type: "bundled",
    bundledId: "builtin.image.z-image-turbo",
    bundledVersion: 1
  }
}
```

If the current library schema only stores a name and serialized workflow JSON, make the smallest compatible extension. Do not redesign the whole settings model merely to admire the purity of its abstractions.

### 4.5 Required initial set

Image workflows:

- Z-Image Turbo, fast realistic default.
- Krea 2 Turbo, aesthetic realistic alternative.
- FLUX.2 Klein, natural-language text-to-image sample.

Video workflow:

- MiniMax H3 image-to-video.

Reference-image workflows remain out of scope.

### 4.6 Workflow validation

Before committing each sample:

- export from ComfyUI in API format;
- verify valid JSON;
- remove machine-specific paths where possible;
- document required models and custom nodes;
- confirm extension placeholders are present in the correct nodes;
- test generation through the extension;
- test the supported width, height, seed, prompt, frames, FPS, and image substitutions;
- verify an empty optional negative prompt does not break execution;
- confirm the workflow produces the expected output type.

The extension should show a readable ComfyUI error when required nodes or models are unavailable. It must not attempt to install ComfyUI dependencies.

### 4.7 README documentation

For every bundled workflow, document:

- intended model and model-file naming assumptions;
- required custom nodes;
- expected ComfyUI version if relevant;
- required and optional placeholders;
- tested resolution or duration defaults;
- how to edit or duplicate the workflow;
- how to restore bundled workflows;
- that user-created workflows remain supported.

---

## 5. Universal image prompt

### 4.1 Requirement

Use one default LLM instruction for Z-Image Turbo, Krea 2 Turbo, and FLUX.2 Klein text-to-image.

Do not build model-specific prompt adapters in this iteration.

Model-specific loaders, samplers, guidance, steps, negative prompts, and LoRAs remain the responsibility of the imported ComfyUI workflow.

### 4.2 Proposed default image instruction

Use the following content as the new built-in default, adjusted only where the current templating system requires existing placeholders:

```text
Write a concise natural-language image-generation prompt depicting the latest visually significant moment in the roleplay.

Describe only visible information.

Include:
- every visible adult character's stable appearance;
- current clothing and exposed areas;
- exact positions and poses;
- actions and physical interactions;
- facial expressions and gaze direction;
- environment and important props;
- camera framing and viewpoint;
- lighting and atmosphere.

Preserve continuity with the recent conversation. Clearly distinguish each character. Describe spatial relationships unambiguously.

Prefer a complete scene over a posed portrait. Do not mention dialogue, internal thoughts, character names that mean nothing to the image model, or events outside the frame.

Use straightforward descriptive prose. Do not use booru tags, quality-score tags, prompt weights, or negative-prompt syntax.

Return only the positive image prompt.
```

### 4.3 Compatibility

- Existing saved image instruction presets must remain unchanged.
- The new instruction should become the default only for:
  - fresh installs; or
  - users who explicitly reset/add the built-in default.
- Do not silently overwrite a user's customized instruction.
- If defaults are versioned, add the new preset without destroying old library entries.

---

## 6. Visual style selection

### 5.1 User-facing behavior

Add a simple style control to the everyday generation panel.

Options:

- `Realistic`
- `Western comic`
- `Custom`

The selected style is appended to the LLM-generated scene prompt before workflow substitution.

Suggested labels may be shortened on mobile, but their meaning must remain obvious.

### 5.2 Built-in style text

#### Realistic

```text
Photorealistic cinematic still, natural adult anatomy, credible skin texture, realistic practical lighting, detailed environment, coherent depth and perspective.
```

#### Western comic

```text
Western graphic-novel illustration, realistic adult proportions, expressive natural faces, controlled ink contours, painted shading, textured brushwork, cinematic panel composition, no anime or manga styling.
```

### 5.3 Custom style

- Selecting `Custom` reveals an editable textarea or compact expandable editor.
- The custom value must persist in extension settings.
- The custom editor should not permanently consume large vertical space on mobile.
- An empty custom style should append nothing and must not break generation.

### 5.4 Prompt assembly

Expected conceptual behavior:

```js
const scenePrompt = generatedPrompt.trim();
const stylePrompt = selectedStyleText.trim();

const finalPrompt = stylePrompt
    ? `${scenePrompt}\n\nVisual style: ${stylePrompt}`
    : scenePrompt;
```

The implementation may differ to match existing code.

### 5.5 Do not overfit by model

Do not add separate style prompts for Z-Image, Krea, or FLUX unless the user creates them manually through existing instruction/workflow mechanisms.

---

## 7. Negative prompts

- Keep the current `%negative_prompt%` placeholder behavior.
- Do not add another LLM call to generate negatives.
- Do not require a negative prompt.
- Preserve any existing global or workflow-level negative-prompt setting.
- Workflows that do not use negative prompting must continue to work with an empty value.

---

## 8. H3 motion prompt

### 7.1 Product behavior

MiniMax H3 remains the only supported video model.

Keep the current conceptual split:

1. The image prompt defines the visible still.
2. The H3 prompt describes how that still moves over the requested clip duration.

### 7.2 Proposed default H3 instruction

Adapt placeholders to the current implementation, preserving existing clip-duration calculations:

```text
Write a concise MiniMax H3 image-to-video prompt for a clip of approximately {{clip_seconds}} seconds.

The input image already fixes character appearance, clothing, environment, composition, and visual style. Do not unnecessarily re-describe them and do not introduce new characters, clothing, props, locations, or scene cuts.

Describe a single continuous shot. Prioritize:
1. the main subject action;
2. subtle facial expression and gaze changes;
3. physical interaction between visible characters;
4. small secondary motion such as breathing, hair, fabric, rain, smoke, or lighting;
5. restrained camera motion when useful.

Keep motion physically plausible and consistent with the starting pose. Avoid abrupt pose changes, large rotations, rapid camera orbits, teleportation, cuts, time skips, and multiple unrelated actions.

Use approximately {{motion_lines}} short sentences, with each sentence covering roughly one to two seconds of motion.

Return only the video prompt.
```

### 7.3 Motion style guidance

The generated prompt should favor motion such as:

- breathing;
- blinking;
- gaze changes;
- small hand or head movement;
- restrained body shifts;
- controlled interaction between characters;
- subtle environmental motion;
- slow push-in, slight pan, or mostly static camera.

It should avoid:

- recreating the image description;
- large unsupported choreography;
- adding objects or people;
- scene transitions;
- aggressive camera movement;
- dialogue unless already part of the existing implementation and intentionally requested.

### 7.4 Compatibility

- Existing saved video-instruction presets must remain unchanged.
- Do not remove the current instruction library.
- Add or replace only the built-in default in a migration-safe manner.

---

## 9. Mobile UI requirements

### 8.1 Target sizes

Manually review at approximately:

- 360 × 800
- 390 × 844
- 412 × 915
- 768 × 1024
- a normal desktop viewport

The design should also tolerate short landscape mobile viewports.

### 8.2 Floating panel

At narrow widths:

- The panel width must not exceed the viewport.
- Use viewport-aware width such as `min()`/`calc()` rather than a large fixed width.
- Leave a small safe margin from screen edges.
- The panel must remain reachable after the Android virtual keyboard opens.
- The panel body may scroll vertically.
- Header and close controls must remain usable.
- No child control may force horizontal scrolling.
- Preview media must use `max-width: 100%` and preserve aspect ratio.

Recommended behavior:

```css
width: min(100% - 16px, <desktop-max-width>);
max-height: calc(100dvh - 16px);
overflow: auto;
```

Exact selectors and values should follow the existing project.

### 8.3 Form layout

At narrow widths:

- Switch multi-column rows to one column.
- Inputs and selects use `width: 100%` and `min-width: 0`.
- Flex children that contain text use `min-width: 0`.
- Button rows wrap.
- Primary generate actions may become full-width.
- Secondary actions may share wrapped rows if labels remain readable.
- Long workflow and instruction names must truncate or wrap without stretching the panel.
- Textareas must be resizable only in a way that does not break the layout.

### 8.4 Progressive disclosure

Mobile layout should not show every advanced setting as one long wall of controls.

Use existing SillyTavern patterns where available:

- collapsible advanced sections;
- `<details>` elements;
- compact section headers;
- hidden custom-style editor until `Custom` is selected.

Do not hide core actions:

- generate scene image;
- generate video;
- orientation/aspect choice;
- selected workflow;
- style selection;
- prompt preview toggle if currently central.

### 8.5 Touch behavior

- Do not rely on hover-only tooltips or buttons.
- Keep icon-only actions understandable through title/ARIA labeling.
- Avoid tiny adjacent destructive controls.
- Aim for approximately 44 CSS pixels for important touch targets.
- Ensure dropdowns and textareas can be operated without precision tapping.

### 8.6 Settings and editors

Apply the same responsive rules to:

- extension settings;
- workflow editor;
- instruction editor/library controls;
- import/export controls.

Specific requirements:

- Save, Save As, Delete, Import, and Export rows wrap cleanly.
- JSON editors and textareas fit the viewport.
- Dialogs cannot open wider than the mobile screen.
- Long JSON content scrolls inside the editor, not the whole page horizontally.
- Destructive actions remain visually distinct but do not dominate the mobile layout.

### 8.7 SillyTavern integration

- Reuse SillyTavern colors, spacing conventions, border variables, and typography where already used.
- Do not impose a standalone theme.
- Avoid broad global CSS selectors.
- Scope new CSS to the extension.
- Do not alter unrelated SillyTavern elements.

---

## 10. Settings and migration

### 9.1 New settings

Likely additions:

```js
imageStylePreset: 'realistic' | 'western_comic' | 'custom'
customImageStyle: string
```

Names may be adapted to project conventions.

### 9.2 Defaults

Recommended defaults:

```js
imageStylePreset: 'realistic'
customImageStyle: ''
```

### 9.3 Migration rules

- Missing new keys receive defaults.
- Existing settings remain untouched.
- Existing selected workflows and instruction presets remain selected.
- Existing library data remains valid.
- Old exports should import without manual editing.
- New exports include the new style settings.
- Unknown future fields should continue to be ignored safely if that is current behavior.

---

## 11. Suggested implementation phases

### Phase 1: read-only audit

Before modifying code, document:

1. where panel markup is created;
2. how settings HTML is loaded;
3. how CSS is scoped;
4. where default instruction libraries are declared;
5. how image prompts are assembled;
6. how H3 prompts receive clip duration and motion-line values;
7. how settings are initialized and migrated;
8. how imported library backups are validated;
9. how bundled assets can be loaded by this frontend extension;
10. the smallest metadata needed to avoid overwriting user edits.

Do not edit during this phase.

### Phase 2: bundled workflows

Add the workflow asset directory, manifest, validation, migration-safe seeding, and restore/add-missing action.

Do not overwrite or lock user entries.

### Phase 3: responsive UI

Implement mobile fixes first, without adding new feature controls.

Likely files:

- `style.css`
- `panel.html`
- `settings.html`
- `workflow-editor.html`
- minimal `index.js` changes only if behavior is required

Validate existing functionality before continuing.

### Phase 4: style selector

Add:

- preset selector;
- custom style editor;
- settings persistence;
- final prompt assembly;
- prompt preview showing the actual final prompt sent to ComfyUI.

Do not alter workflow JSON semantics.

### Phase 5: prompt defaults

Update or add:

- universal image instruction;
- H3 motion instruction.

Preserve saved user presets.

### Phase 6: regression review

Review:

- generation panel;
- image generation;
- video generation;
- preview flow;
- per-message video button;
- workflow selection;
- instruction selection;
- settings persistence;
- library import/export;
- desktop layout;
- mobile layout.

---

## 12. Acceptance criteria

### 11.1 Mobile panel

- At 360 CSS pixels wide, the floating panel is fully contained in the viewport.
- No horizontal scrollbar appears due to extension content.
- All inputs and buttons are usable by touch.
- Primary image and video actions are visible and readable.
- Opening a textarea does not permanently obscure the panel controls after the keyboard closes.
- Long workflow names do not widen the panel.
- Media previews never exceed panel width.

### 11.2 Settings and editors

- Settings remain usable at 360 CSS pixels.
- Workflow JSON editor fits the viewport.
- Library action buttons wrap instead of overflowing.
- Dialog close/save controls remain reachable.
- Desktop layout does not regress.

### 12.3 Bundled workflows

- A fresh install receives the shipped image and H3 workflows in the editable library.
- Existing installations receive only bundled workflow versions not previously seeded.
- Existing user-created workflows remain unchanged.
- Editing a bundled workflow changes only the user's library copy.
- Deleting a bundled workflow is allowed and it does not return on every reload.
- The restore/add-missing action can recover bundled workflows.
- A future bundled version does not silently overwrite an edited older copy.
- Bundled JSON assets contain no secrets or local absolute paths.
- README documents models, custom nodes, placeholders, and restoration behavior.

### 12.4 Prompt behavior

- The same universal image instruction can be used with Z-Image, Krea, and FLUX text-to-image workflows.
- Generated image prompts use natural prose rather than tag lists.
- The selected style is appended exactly once.
- `Custom` with an empty value does not append an empty label or extra junk.
- Prompt preview displays the final style-enhanced prompt.
- Existing negative-prompt behavior remains compatible.

### 12.5 H3 behavior

- Clip duration placeholders still resolve correctly.
- The built-in H3 instruction asks for one continuous shot and restrained motion.
- H3 generation continues to use the existing workflow and placeholders.
- No support for unrelated video models is added.

### 12.6 Backward compatibility

- Existing workflow-library entries still load.
- Existing instruction-library entries still load.
- Existing settings do not reset.
- Old exported library/settings data can still be imported.
- No SillyTavern core files are modified.
- No new backend component is required.

---

## 13. Manual test matrix

Run at least these checks.

### Desktop

1. Open floating panel.
2. Switch portrait/landscape.
3. Switch image workflow.
4. Switch I2V workflow.
5. Switch image instruction.
6. Switch H3 instruction.
7. Select each style.
8. Enter and persist a custom style.
9. Preview image prompt.
10. Generate image.
11. Preview H3 prompt.
12. Generate video.
13. Generate video from a specific message.
14. Open full settings.
15. Edit and save workflow JSON.
16. Export and import library backup.
17. Confirm bundled workflows appear with a fresh settings state.
18. Edit a bundled workflow and reload.
19. Delete a bundled workflow and reload.
20. Restore missing bundled workflows.

### Mobile

Repeat the critical subset at 360, 390, and 412 CSS pixels:

1. Open/close panel.
2. Scroll panel.
3. Change workflows and instructions.
4. Change style.
5. Edit custom style with keyboard visible.
6. Preview prompts.
7. Trigger image and video generation.
8. Open settings.
9. Edit a workflow or instruction.
10. Save and return without horizontal overflow.

### Regression/error checks

- Reload SillyTavern and confirm settings persist.
- Test with long workflow names.
- Test with long custom style text.
- Test with empty custom style.
- Test an empty negative prompt.
- Test a workflow that ignores `%negative_prompt%`.
- Check browser console for errors.
- Verify no extension selector unintentionally styles unrelated SillyTavern UI.

---

## 14. Codex execution prompt

Use this from the repository root:

```text
Read AGENTS.md and docs/implementation-plan.md.

First perform Phase 1 as a read-only audit. Do not edit files yet.

Inspect the current implementation and report:
1. relevant files and responsibilities;
2. current settings keys and migration behavior;
3. how default prompt libraries are created;
4. how final image and H3 prompts are assembled;
5. mobile-layout problems visible from the HTML and CSS;
6. the smallest implementation sequence;
7. backward-compatibility risks.

After the audit, wait for a separate implementation instruction.
```

Before implementing the bundled-workflow phase, place the actual tested ComfyUI API JSON files in the repository. If they are unavailable, report exactly which workflow files are missing rather than inventing plausible-looking JSON.

Then implement one phase at a time:

```text
Read AGENTS.md and docs/implementation-plan.md.
Implement Phase 2 only.

Keep all changes inside the extension.
Do not refactor unrelated code.
After editing, run available checks and review the diff against the Phase 2
requirements and mobile acceptance criteria.
```

Repeat for later phases.

---

## 15. Definition of done

This iteration is complete when:

- the panel and settings are comfortable to use on a phone;
- image prompting works through one universal natural-language instruction;
- the user can choose realistic, Western-comic, or custom styling;
- H3 receives a cleaner motion-focused prompt;
- fresh installs receive tested bundled image and H3 workflows;
- bundled workflows remain fully user-editable;
- existing users retain settings and workflow libraries without silent overwrites;
- the extension still requires no SillyTavern core changes;
- the final diff remains small enough to review without archaeological equipment.
