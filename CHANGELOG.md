# Changelog

## v0.31.4

### TL;DR - Wildcard Performance Hotfix

No wildcard files need to be changed. This update removes a Power Prompter
rendering bottleneck that could make the editor sluggish or unresponsive after
adding large wildcard libraries or several Wildcard Utility cards.

### Fixes And Quality-of-Life Recap

- **Fixed:** Stopped rebuilding WCUID choices for every wildcard row during
  each Power Prompter render.
- **Improved:** Cached normalized wildcard libraries and per-variant active-roll previews,
  so ordinary editor updates no longer repeatedly expand the entire library.
- **Improved:** Removed duplicated WCUID choice payload data from the wildcard API response;
  wildcard values are still fully compatible with existing `.txt` libraries.

## v0.31.3

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. Update normally. Existing one-prompt-per-line wildcard text files,
Power Prompter cards, queue sets, held choices, and user settings remain
compatible. Legacy wildcard entries receive stable WCUID identities when they
are loaded; users do not need to rewrite or convert their libraries.

### Smart Wildcards And WCUID Identity

- Added Umbra's WCUID system, which gives every wildcard choice a stable
  identity independent of its display text or line position. A held choice can
  now survive refreshes, file reordering, folder organization, and later
  edits without relying on a fragile array index.
- Kept ordinary wildcard `.txt` files fully supported. Umbra derives WCUIDs at
  load time, so existing wildcard collections can be placed in the library and
  used immediately without adopting a new file format.
- Preserved wildcard tokens embedded inside longer authored prompts. Expansion
  replaces only the wildcard-owned token and leaves surrounding fixed tags,
  weights, LoRA syntax, and modular prompt text intact.
- Added bounded nested-wildcard resolution and cycle protection. Wildcards can
  reference another wildcard while malformed recursive loops stop safely
  instead of hanging queue construction.
- Unknown wildcard tokens remain visible in the composed prompt rather than
  silently deleting user-authored text, making missing files and misspelled
  names much easier to diagnose.

### Per-Variant Hold, Reroll, And Active Choices

- Made wildcard behavior unique to each variant inside a Wildcard Utility card.
  One variant can hold an exact choice while another variant in the same card
  continues rerolling independently.
- Added an inline active-roll preview beneath wildcard variants so the exact
  resolved prompt is visible without reopening the configuration modal.
- Added inline **Reroll** and **Hold** controls. Reroll previews another choice
  for that specific variant; Hold pins that exact WCUID for generation without
  changing sibling variants or other Wildcard Utility cards.
- Added a per-variant reroll counter beside the queue-set controls, supporting
  1 through 1,000 requested wildcard outputs. The displayed queue and image
  totals update immediately to match the selected value.
- Kept held variants from inflating output counts. A held location can remain
  stable while an outfit or pose wildcard produces many randomized outputs.
- Made multiple active Wildcard Utility cards share the requested output span
  instead of multiplying reroll counts into an accidental combinatorial queue.
  Ordinary enabled card variants still compose with the wildcard output count
  as expected.
- Isolated reroll counts and held WCUIDs by queue set, allowing the same card to
  behave differently across separate Power Prompter sets.

### Optional Smart Context

- Added an optional Smart Context pass for wildcard-composed prompts. It repairs
  direct contradictions after wildcard expansion while leaving the source
  wildcard files and card text unchanged.
- Added contextual clothing and access-state handling so generated actions do
  not retain incompatible garment states, while explicit through-clothing or
  already-adjusted clothing instructions remain respected.
- Added action compatibility checks for occupied hands, mouth availability,
  mutually exclusive primary actions, solo versus multi-participant framing,
  and participant-count requirements.
- Added camera cleanup that keeps one structural viewing angle and one focus
  target when several wildcard sources contribute competing composition tags.
- Applied context repair only when enabled. Users can keep literal wildcard
  output whenever strict source fidelity is preferred.

### Wildcard Library And Authoring Experience

- Added folder-aware wildcard browsing. The Wildcards modal now presents nested
  categories for outfits, poses, expressions, locations, composition, adult
  libraries, and user-created organizational structures instead of flattening
  every file into one long list.
- Expanded the Wildcard Utility configuration surface with clearer source
  selection, active-choice previews, WCUID visibility, candidate rerolling,
  reroll counts, and Smart Context controls.
- Kept standard-card-to-wildcard authoring compatible with the WCUID system.
  Users can select entire cards or individual variants, name the resulting
  wildcard, and immediately use it as a stable Wildcard Utility source.
- Preserved independently created wildcard, standard, and Style Utility cards
  when they share the same visible name. Renaming a wildcard to `Character`,
  `Style`, or another existing card name no longer merges, replaces, or removes
  either card.
- Kept wildcard identity intact when renaming a Wildcard Utility card, so the
  purple utility card cannot silently turn into a standard variant card.

### Power Prompter Interface And Ordering

- Reworked the Wildcard Utility header so its name, utility identity, and
  Hold/Reroll summary remain visible. **Configure** and **Add** now occupy a
  separate action row instead of crowding the card name.
- Returned the reroll counter to a compact right-aligned position beneath the
  set controls after visual review on desktop and tablet layouts.
- Improved variant move-up and move-down behavior so ordering follows the
  enabled variant list directly and no longer depends on stale positions from
  before a variant was enabled.
- Kept variant ordering unique per queue set and ensured the resulting order is
  the order used by Power Prompter queue composition.
- Improved wildcard-card Add behavior and retained the row-level choices for a
  Standard Variant card, Style Utility card, or Wildcard Utility card.

### Compatibility, Testing, And Release Privacy

- Added focused coverage for held and rerolled cards, repeated wildcard names,
  nested expansion, unknown tokens, recursive cycles, contextual conflicts,
  queue limits, queue-set isolation, ordinary variant composition, and card
  identity collisions.
- Validated wildcard queue construction with continuous prompt-only simulations
  and real managed generation dispatch without requiring batch-size inflation.
- Kept personal wildcard libraries, wildcard-authoring generators, internal
  simulation files, local agent skills, and development tests out of the public
  repository and portable packages.
- Reorganized only the previously public starter wildcard files in the shipped
  defaults. No private wildcard content has been added to this release.

### Fixes And Quality-of-Life Recap

- **Fixed:** Renaming a Wildcard Utility card no longer converts it into a
  standard card or collides with an existing standard or Style Utility card.
- **Fixed:** Per-variant Hold and Reroll controls no longer alter every variant
  in the wildcard card.
- **Fixed:** Held wildcard choices no longer depend on a mutable text-file line
  number and remain addressable through their WCUID.
- **Fixed:** Multiple wildcard reroll counts no longer multiply into an
  unexpectedly huge queue.
- **Fixed:** Blank wildcard variants no longer inflate another active wildcard
  card's output count.
- **Fixed:** Queue limits now cap wildcard rerolls consistently and report the
  truncated total accurately.
- **Fixed:** Wildcard Add controls no longer crowd or hide the utility-card name.
- **Fixed:** Wildcard, standard, and Style Utility cards with matching names no
  longer overwrite or remove one another.
- **Improved:** Active wildcard results can be reviewed, rerolled, and held
  directly on the variant that owns them.
- **Improved:** Folder-aware browsing makes large third-party and user-authored
  wildcard libraries practical to navigate.
- **Improved:** Optional Smart Context produces more coherent combinations from
  independent outfit, pose, action, expression, and camera wildcard sources.
- **Improved:** Existing wildcard text files work immediately without a manual
  conversion step or proprietary source format.

## v0.31.2

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. This hotfix repairs the standalone updater so a completed record from
an earlier release cannot hide the Install button for newer builds.

### Updater State Recovery

- Clear a completed update state when a new standalone updater session starts,
  while preserving completion state during the session that actually performed
  the update.
- Keep **Install selected update** visible and enabled whenever the selected
  release is newer than the installed version, even if an older completion
  record is still present.
- Hide stale completion progress when browsing a newer release and reserve the
  **Launch Umbra Studio** action for the release that was actually installed.
- Refresh release badges immediately after installation so the new version is
  marked **Installed** without reopening the updater.

### Fixes And Quality-of-Life Recap

- **Fixed:** Reopening the updater after one successful update no longer leaves
  every future release stuck behind the previous **Update complete** screen.
- **Fixed:** A stale completed version can no longer suppress the Install button
  for a newer selected Windows or Linux package.
- **Fixed:** The release list no longer continues to label the previous version
  as installed after a successful update.
- **Improved:** Completed progress and launch controls now follow the release
  that actually completed instead of whichever release is currently selected.

## v0.31.1

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. Update normally. Existing themes, Power Prompter cards, wildcard
utilities, queue sets, and user settings are preserved.

### Theme-Aware Selection Menus

- Updated Umbra's universal selector trigger and dropdown menu to consume the
  active theme engine's accent, panel, text, border, and glow variables.
- Replaced the selector system's fixed cyan borders, highlights, chevrons,
  icons, badges, separators, focus rings, and open-state colors with dynamic
  theme colors across Umbra UI, Power Prompter, Gallery, Data Forge, Model
  Manager, global settings, and remote interfaces.
- Kept destructive context-menu actions red while allowing all ordinary menu
  commands and shared context-menu surfaces to follow the selected theme.
- Confirmed the frontend no longer contains native HTML select controls, so
  app selectors consistently use Umbra's custom selection-menu system.

### Add Card Menu Reliability

- Fixed the Power Prompter card-row **Add** button opening an invisible menu.
  The shared portal previously mounted one render after the positioning effect,
  leaving the menu permanently hidden at its fallback coordinates.
- Mounted the shared context-menu panel directly into the document portal so
  positioning occurs only after the menu element exists.
- Verified Standard Variant Card, Style Utility, and Wildcard Utility creation
  from the repaired menu and restored the original card state after testing.

### Fixes And Quality-of-Life Recap

- **Fixed:** The Power Prompter Add button no longer opens a hidden,
  non-interactive card-type menu.
- **Fixed:** Standard, Style Utility, and Wildcard Utility card choices now
  create the requested card from the row-level Add menu.
- **Improved:** Selectors and their menus now match the user's active Umbra
  theme instead of remaining cyan or dark blue.
- **Improved:** Shared context menus inherit theme-aware borders, highlights,
  icons, badges, separators, and glow treatment.

## v0.31.0

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. Update normally. Existing wildcard files, Power Prompter cards,
queue sets, and saved reroll counts are preserved.

### Wildcard Utility Modes

- Replaced the ordinary three-state card traversal control on Wildcard Utility
  cards with two purpose-built modes: **Reroll** and **Hold**.
- **Reroll** resolves a fresh wildcard choice for each configured queue reroll,
  making it suitable for outfits, poses, actions, and other elements that
  should vary throughout a run.
- **Hold** resolves the wildcard once and keeps that choice stable throughout
  the queued run, making it suitable for locations, environments, themes, and
  other context that should remain consistent.
- Kept the established Hold, Cycle, and Fast traversal controls unchanged on
  standard variant and Style Utility cards.
- Added the active wildcard mode to the Wildcard Utility builder and disabled
  reroll-count editing while the card is held, so the relationship between the
  two controls is visible and unambiguous.

### Queue Composition And Resolution

- Made held wildcard cards stop inflating the displayed or generated image
  count, while rerolling wildcard cards continue to multiply the correct
  combination count.
- Added per-card wildcard mode metadata to queue previews and backend dispatch,
  allowing held and rerolling wildcard cards to coexist in the same queue.
- Preserved normal enabled variants while wildcard rerolls are applied. A held
  location, rerolling outfit, and multiple ordinary pose variants now compose
  predictably without changing one another's traversal behavior.
- Added segmented wildcard expansion so the backend replaces only the wildcard
  tokens owned by each utility card and preserves modular prompt segments and
  agent-enhanced text around them.
- Retained compatibility with older unsegmented wildcard prompts and cards that
  predate the new mode metadata.

### Persistence And Release Privacy

- Added wildcard mode and reroll count to Power Prompter's document signature,
  session updates, autosave detection, and server-side PPCard normalization.
  Mode changes now survive app and browser refreshes.
- Strengthened clean-source packaging so private wildcard libraries, authoring
  generators, local agent skills, and internal test files remain outside the
  public repository and release packages.

### Fixes And Quality-of-Life Recap

- **Fixed:** Wildcard Hold no longer reverts to Reroll after refreshing Power
  Prompter or reopening a saved PPCard.
- **Fixed:** Held wildcard cards no longer multiply queue totals using a reroll
  count that is intentionally inactive.
- **Fixed:** Mixed held and rerolling wildcard cards no longer share one global
  wildcard-resolution cadence.
- **Fixed:** Backend PPCard normalization no longer strips the card traversal
  role during session updates and autosaves.
- **Improved:** Wildcard Utility controls now use language that directly matches
  their behavior instead of exposing ordinary card traversal terminology.
- **Improved:** Public-source generation now explicitly rejects private wildcard
  authoring scripts in addition to relying on Git ignore rules.

## v0.30.9

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. Update normally. ComfyUI will no longer launch automatically with
Umbra Studio; start it from Umbra's ComfyUI workspace when generation is
needed.

### Updater Launch And Shutdown Reliability

- Added a dedicated **Launch Umbra Studio** action to the completed standalone
  updater so users can start the newly installed build and close the updater in
  one step.
- Moved relaunch ownership into a separate external worker that waits for the
  updater to exit, starts the updated installation, verifies the correct Umbra
  runtime becomes healthy, and retries bounded startup failures.
- Improved updater shutdown sequencing with listener release, process-settle
  time, bounded readiness requests, and retry handling for transient Windows
  file locks while writing updater state.
- Included the relaunch worker in Windows and Linux packages and made updater
  workspace cleanup account for its lifecycle.
- Removed the launcher's intrusive bind probe. Umbra continues to use its
  configured port without changing Remote or proxy routes, while readiness
  checks now fail quickly instead of hanging indefinitely.

### Power Prompter Wildcards

- Added a persisted **Queue rerolls** control to Wildcard Utility cards. A
  wildcard prompt can now generate multiple independently seeded choices
  without increasing the generation batch size.
- Updated queue totals, previews, limits, seed groups, card normalization, and
  backend queue construction to represent wildcard rerolls accurately across
  sets and other enabled card variants.
- Added Standard Variant, Style Utility, and Wildcard Utility choices to the
  add-card menu.
- Added an **Edit** action beside every wildcard's Insert action. The shared
  editor opens a focused modal for updating the wildcard's one-value-per-line
  contents from either Power Prompter or Umbra UI.

### Workflow And Settings Cleanup

- Fixed Gallery parameter handoffs so every restored LoRA receives an
  independent stable identity. Editing, enabling, or deleting one restored
  LoRA no longer changes the entire imported stack.
- Removed the **Launch ComfyUI on startup** setting and backend auto-launch
  behavior from shipping builds. Existing saved values are ignored and removed
  during settings normalization; manual ComfyUI controls remain available.

### Fixes And Quality-of-Life Recap

- **Fixed:** The updater can now launch the updated Umbra Studio installation
  after a successful update without keeping the updater process alive.
- **Fixed:** Windows updater state writes tolerate short antivirus and file-lock
  races instead of failing immediately.
- **Fixed:** Restored LoRA rows no longer share IDs and mutate as one row.
- **Fixed:** Wildcard reroll counts are reflected in the displayed image count,
  queue cap, and generated seed groups.
- **Improved:** Wildcard libraries can be edited directly instead of requiring
  manual file changes or delete-and-recreate workarounds.
- **Improved:** ComfyUI startup is explicit, reducing first-launch confusion and
  unexpected GPU memory use.

## v0.30.8

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or manual configuration are
required. Update normally, then new Power Prompter generations will use Umbra
UI's text-to-image output root automatically.

### Unified Prompter Outputs

- Moved Power Prompter's generated images from the legacy
  `Power Prompter Outputs` root to `Umbra UI/txt2img`.
- Preserved the established date, set, and style organization beneath the new
  root: `Umbra UI/txt2img/YYYY-MM-DD/Set N/<Style>`.
- Made the queue origin and selected TXT2IMG pipeline authoritative, preventing
  older saved cards, transferred controls, or pinned Umbra UI destinations from
  flattening or redirecting Power Prompter output.
- Updated the bundled Anima image workflow to use the unified output root.

### Fixes And Quality-of-Life Recap

- **Fixed:** Integrated Power Prompter jobs no longer lose their set and style
  subfolders when their generation controls carry Umbra UI output state.
- **Fixed:** Stale pinned-folder data can no longer override the Prompter's
  structured TXT2IMG destination.
- **Improved:** Power Prompter and Umbra UI now share one predictable image
  library root while retaining Prompter-specific organization.

## v0.30.7

### TL;DR - Setup After Updating

No additional models, custom nodes, migrations, or setup steps are required.
Update or extract the portable package normally. Existing `User` and `Tools`
content remains user-owned and is preserved by the updater.

### Unified Umbra UI Workspace

- Moved Power Prompter into Umbra UI as the dedicated **Prompter** workflow tab,
  positioned between text-to-image and image-to-image.
- Kept Power Prompter's queue, cards, presets, generation controls, and output
  ownership intact while removing the redundant standalone application entry.
- Improved workflow handoffs so prompt work and media refinement remain inside
  one consistent creation workspace.

### Extras Media Workflows

- Added dedicated **Image Watermark** and **Video Watermark** workspaces with
  live placement previews, nine anchor points, free placement, size, opacity,
  automatic output destinations, and serial-safe batch processing.
- Added complete operation presets for upscaling, image watermarking, video
  watermarking, and video-to-GIF conversion. Presets retain the selected
  watermark asset, placement, opacity, scale, export settings, output width,
  and destination where applicable.
- Added image export controls for long-edge resizing, PNG, JPEG, or WebP output,
  and quality selection, making clean public copies possible without PNG
  generation metadata.
- Added video-to-GIF batch conversion using the full source duration and source
  frame timing, with output width as the only conversion control.
- Added automatic `Upscaled`, `Watermarked`, and `GIF` subfolders beside each
  source when no custom destination is selected.
- Added Gallery context-menu routes for multi-selected images and videos to
  Upscale, Image Watermark, Video Watermark, and Video-to-GIF workflows.

### Media Reliability

- Made watermark placement use the source media's true aspect ratio in the
  preview and rendered output.
- Made video watermarking preserve the complete source duration, frame count,
  frame rate, and audio while applying the requested output width.
- Kept video batches strictly serial and image batches capped at 25 concurrent
  items to avoid unnecessary memory pressure.
- Improved missing-source failures so stale Gallery paths report the exact file
  that could not be resolved instead of failing without useful context.

### Fixes And Quality-of-Life Recap

- **Fixed:** Video watermarking no longer truncates clips during FFmpeg overlay
  processing.
- **Fixed:** Video watermark output retains source audio, frame rate, frame
  count, and duration.
- **Fixed:** Watermark placement and anchor previews now follow the true media
  dimensions for portrait, landscape, and video sources.
- **Fixed:** Extras no longer tries to process stale media from a different
  Umbra Studio root without identifying the missing source.
- **Improved:** Power Prompter is now part of the primary Umbra UI workflow bar.
- **Improved:** Every Extras operation can save and restore its complete working
  configuration.
- **Improved:** Gallery selections can be staged directly into the appropriate
  Extras batch workflow.
- **Improved:** Automatic per-source output folders remove repetitive folder
  selection while keeping generated media organized.

## v0.30.6

### TL;DR - Setup After Updating

No additional Umbra support-model download is required. Update or extract the
portable package normally. To use the new **NoobAI XL V-Pred** pipeline, place
a compatible NoobAI/NubeAI XL V-Pred checkpoint in ComfyUI's checkpoint model
folders, then select **NoobAI XL V-Pred** in Umbra UI or Power Prompter.

Umbra seeds the new bundled wildcard libraries into
`User/PowerPrompter/Wildcards` only when a same-named file does not already
exist. Existing custom wildcard files and edits are preserved.

### NoobAI XL V-Pred Pipeline

- Added a dedicated NoobAI XL V-Pred model family instead of reusing the
  Illustrious pipeline identity.
- Added locked text-to-image and image-to-image workflows with native
  `v_prediction` sampling and Zero Terminal SNR.
- Added NoobAI XL V-Pred compatibility across Power Prompter, Umbra UI
  text-to-image, image-to-image, inpainting, and Canvas generation paths.
- Added visible **V-PRED + ZSNR** resource status so the active prediction
  behavior is clear in generation controls.

### Power Prompter Wildcards

- Added seeded prompt wildcard expansion using `__wildcard-name__` tokens, with
  a new wildcard library shared by Power Prompter and Umbra UI prompt fields.
- Added bundled wildcard sources for poses, outfits, expressions, locations,
  cameras, lighting, colors, and optional adult poses and outfits.
- Added dedicated **Style Utility** and **Wildcard Utility** card creation flows.
- Added a visual Wildcard Utility Builder for selecting one or more random
  sources while preserving manually written fixed prompt text.
- Added **Create From Cards**, allowing a named wildcard to be built from
  selected Power Prompter cards or individual variants. Card groups expose
  clear Expand/Collapse controls, partial selection, variant names, and prompt
  previews.
- Made every queued prompt resolve its wildcard choices independently and
  deterministically from its queue seed and position.

### Prompt Agent And Tag Tools

- Added a persisted active-instruction selector to the Power Prompter Agent
  panel and applied it consistently to per-variant and complete-prompt
  enhancement.
- Improved Danbooru CSV grounding with conservative close-tag matching while
  preserving custom triggers, weights, embeddings, and LoRA syntax.
- Added one-click prompt cleanup for underscores, whitespace, commas, and
  duplicate tags in compact and expanded variant editors.

### Workflow Interoperability

- Kept Power Prompter's existing output destination when generation controls
  are transferred from Umbra UI, preventing outputs from being redirected into
  Umbra UI's folder layout.
- Removed the unfinished regional-conditioning experiment and its dormant
  backend, Canvas, inpainting, project, and pipeline capability code. Existing
  Canvas inpaint, outpaint, control-layer, and reference-layer workflows remain
  available.

### Fixes And Quality-of-Life Recap

- **Fixed:** Umbra UI generation-control transfers no longer overwrite Power
  Prompter's save destination.
- **Fixed:** Wildcards now resolve per queued generation instead of remaining
  as literal prompt tokens.
- **Fixed:** Danbooru agent enhancement now follows the instruction explicitly
  selected in Power Prompter.
- **Improved:** Users can create reusable wildcard libraries directly from
  complete cards or carefully selected individual variants.
- **Improved:** Wildcard selection now has visible group state, variant
  previews, and clear Expand/Collapse badges.
- **Improved:** Removed the incomplete regional-conditioning surface rather
  than shipping a misleading or unreliable generation control.

## v0.30.5

### TL;DR - Setup After Updating

**Umbra UI Video is now marked Beta.** It is ready for feedback, but advanced
or production-specific video work may still be better served by a custom
ComfyUI workflow. MiniMax H3 users should update managed ComfyUI from
**Neural Hub**, then run `Install-Umbra-UI-Models.bat` on Windows or
`./install-umbra-ui-models.sh` on Linux and select **MiniMax H3**. Install the
optional RTX video resources only when using NVIDIA RTX VSR or frame
interpolation.

### MiniMax H3 Video Pipeline

- Added explicit MiniMax H3 video and audio sigma-shift controls, defaulting
  to video shift `10` and audio shift `5`.
- Added staged video post-processing: model or Lanczos upscale can run before
  NVIDIA RTX Video Super Resolution, with the requested output size preserved.
- Added the MiniMax H3 image-to-video workflow's accelerated attention and
  cache topology to Umbra-managed pipeline generation.
- Marked the Umbra UI Video workspace with a visible **Beta** tag so its
  current feedback-stage status is clear before entering the workflow.

### Fixes And Quality-of-Life Recap

- **Fixed:** MiniMax H3 video and audio shift settings are now included in the
  dispatched ComfyUI workflow.
- **Fixed:** RTX VSR can follow the selected model/Lanczos video upscale stage
  instead of replacing it.
- **Improved:** Video output sizing now keeps the requested final resolution
  while sampling at the lower post-process base resolution where appropriate.

## v0.30.4 - Hotfix

### TL;DR - Setup After Updating

No additional model downloads are required for this update. **Agent Settings
is still work in progress**: Hermes/Ollama provider selection, model catalogs,
thinking levels, and persistence are present for testing but may still need
polish and should not be treated as a finalized production workflow.

### Agent Settings Work In Progress

- Added provider-aware model catalog refresh for Ollama and Hermes.
- Added selectable thinking levels where the selected provider/model supports
  them.
- Improved preservation of the server-provided model catalog when a refresh is
  unavailable.

### Fixes And Quality-of-Life Recap

- **Fixed:** Switching agent providers now refreshes the selected provider's
  model catalog instead of only refreshing Ollama.
- **Improved:** Agent model selection remains available when a provider refresh
  temporarily returns no models.

## v0.30.2

### TL;DR - Setup After Updating

No additional downloads or model setup are needed. Update normally, then open
**Umbra UI > Canvas**. Canvas Studio is available in every regular portable
installation; no URL flag or developer setting is required.

### Canvas Studio Visibility Hotfix

- Restored Canvas Studio as a permanent Umbra UI workspace tab in portable,
  desktop, tablet, and remote-capable installations.
- Removed the temporary development-only gate that incorrectly required
  `canvas-revival=1` or a browser-local flag to display Canvas.

### Fixes And Quality-of-Life Recap

- **Fixed:** Canvas Studio no longer disappears from normal release builds.

## v0.30.1

### TL;DR - Setup After Updating

MiniMax H3 video generation needs the current managed ComfyUI release and its
official model resources. From the extracted `Umbra Studio` folder, first use
**Neural Hub > Update ComfyUI**. Then run `Install-Umbra-UI-Models.bat` on
Windows or `./install-umbra-ui-models.sh` on Linux and choose **MiniMax H3**.

The optional H3 package is approximately **39.55 GB** and installs the H3 INT8
ConvRot diffusion model, the Qwen3-VL 32B text encoder, and H3 video and audio
VAEs in the correct ComfyUI model folders. It is required only for MiniMax H3
text-to-video or image-to-video, not for existing Umbra video pipelines.

### MiniMax H3 Video

- Added native MiniMax H3 text-to-video and image-to-video pipelines using
  ComfyUI's official H3 nodes and workflow structure.
- Added first-frame and first-plus-last-frame image guidance, including
  native 24 FPS output and duration controls from 5 to 15 seconds.
- Added the official MiniMax H3 INT8 ConvRot profile to the Umbra UI model
  installer, with pinned sources, byte-size validation, and SHA-256 checks for
  all four required H3 resources.
- Kept H3-specific controls honest: LTX Director, chained extension, video
  denoise, tiled VAE, and unsupported guide modes remain unavailable when H3
  is selected.
- Updated the managed ComfyUI integration to the native H3-capable `0.30.0`
  release and refreshed the required `comfy-kitchen` dependency path.

### Fixes And Quality-of-Life Recap

- **Fixed:** MiniMax H3 image-to-video no longer retains an invalid optional
  last-frame path during first-frame-only generations.
- **Fixed:** H3 video graphs now identify their locked Umbra pipeline and
  validate their native H3 conditioning role correctly before dispatch.
- **Improved:** H3 generation outputs preserve the requested aspect ratio,
  duration, frame rate, and audio/video decode flow in a single portable
  Umbra-managed workflow.

## v0.23.0

### TL;DR - Setup After Updating

Canvas Studio can generate with your existing supported checkpoints. Its new
model-specific **Control** and **Reference** layers need optional resources that
are not bundled in the portable ZIP:

1. From the extracted `Umbra Studio` folder, run
   `Install-Umbra-UI-Models.bat` on Windows or
   `./install-umbra-ui-models.sh` on Linux.
2. Select only the Canvas packs for the model families you use:
   - **Canvas Control - Anima:** Anima LLLite inpaint and pose models (~89 MB).
   - **Canvas Control - Qwen Image:** InstantX inpaint ControlNet (~4.23 GB).
   - **Canvas Control - Z-Image Turbo:** Union ControlNet (~6.71 GB).
   - **Canvas Reference - SDXL:** IP-Adapter plus CLIP Vision (~3.23 GB).
   - **Canvas Reference - FLUX.1:** FLUX Redux plus SigLIP (~986 MB).
3. For Anima Control, install or update managed ComfyUI from Umbra's Neural Hub
   so the required latest `ComfyUI-Anima-LLLite` custom node is present.

These downloads are only required for their matching Canvas Control or
Reference workflow. Users who do not use those layers can skip them. Review the
installer's license and large-download notices before confirming a pack.

### Canvas Studio Revival

![Umbra Studio Canvas Studio](https://raw.githubusercontent.com/Nocturne-Ai-Labs/Umbra-Studio/main/.github/screenshots/canvas-studio-v0.23.0.png)

- Reintroduced Canvas Studio as a focused AI compositing workspace backed by
  Umbra UI and ComfyUI, with projects, editable image layers, mask layers,
  control layers, reference layers, and durable per-region generation state.
- Added movable and resizable generation regions for fresh generation,
  inpainting, overlap-aware outpainting, and expanding artwork beyond the
  current image bounds without treating the entire workspace as one flat image.
- Added preset aspect ratios and manual generation-region resolutions, 8-pixel
  grid snapping, alignment assistance, canvas pan and zoom, layer transforms,
  undo and redo, and visible keyboard-shortcut labels.
- Added automatic live sampling previews inside the active generation region so
  progress is visible directly where the result will be composited.
- Added alpha-aware source masking for transparent artwork and logos, including
  an inverted-alpha workflow that preserves the visible source while generating
  around it.
- Added focused dual sidebars for model, prompt, generation, inpaint, Hires Fix,
  and detailer controls while keeping nonessential shape, gradient, polygon,
  and color-picking tools out of the current user-facing scope.

### Canvas Control And Reference Resources

- Added optional Canvas resource profiles to the interactive Umbra UI model
  installer for Anima LLLite inpaint and pose control, Qwen inpaint control,
  Z-Image union control, SDXL IP-Adapter reference conditioning, and FLUX Redux
  reference conditioning.
- Added pinned filenames, sizes, checksums, source links, license labels, and
  large-download notices for every new Canvas control and reference resource.
- Added managed installation and update support for the latest
  `ComfyUI-Anima-LLLite` custom node required by the Anima Canvas adapters.
- Moved the existing SDXL reference resource into the unified requirements
  manifest so every optional Canvas dependency is selected from the same model
  family installer on Windows and Linux.

### Model Selection And Interface Polish

- Unified the Umbra UI and Power Prompter model browsers, including model-folder
  subdirectories, thumbnails, metadata, and consistent selection behavior.
- Model selection now applies the correct checkpoint, diffusion, UNet, or GGUF
  source automatically, removing the separate model-source selector and a
  common source-mismatch failure mode.
- Replaced native select menus across the application with Umbra's consistent
  context-menu-style selector for clearer keyboard, mouse, and touch use.
- Improved Power Prompter's all-cards drag targets and reordering reliability,
  removed the redundant active-prompt handoff control, and increased alert
  playback gain so completion sounds remain audible at normal system volume.

### Packaging And Release Hygiene

- GitHub releases now publish only the Windows BAT and Linux portable ZIPs;
  internal model manifests remain inside each package and are no longer exposed
  as separate JSON download assets.
- Expanded package validation for Canvas model profiles, required custom-node
  integration, portable launchers, and repository-ready source generation.

### Fixes And Quality-of-Life Recap

- **Fixed:** Selecting a model from the browser now applies its actual source
  type automatically, preventing checkpoint, diffusion, UNet, and GGUF source
  mismatches after switching models or pipelines.
- **Fixed:** Power Prompter's all-cards view now has dependable drag activation
  zones, making card reordering respond consistently on the first attempt.
- **Improved:** Umbra UI and Power Prompter now share the same polished model
  browser, including subfolders, thumbnails, metadata, and selection behavior.
- **Improved:** Native drop-downs were replaced app-wide with Umbra's consistent
  context-menu-style selector for clearer mouse, keyboard, and touch use.
- **Improved:** Completion alerts are substantially louder, and the redundant
  active-prompt handoff control was removed from Power Prompter.
- **Improved:** Canvas generation progress appears automatically inside the
  active region, while its focused sidebars keep generation, inpaint, Hires Fix,
  and detailer controls accessible without unrelated drawing-tool clutter.

## v0.22.8

### ComfyUI Auto-Start Hotfix

- Fixed the global `Launch ComfyUI on startup` setting being persisted but never
  dispatched during Umbra Studio startup.
- Added a delayed backend-owned launch after Umbra binds its server, preserving
  responsive startup while using the same managed portable ComfyUI lifecycle as
  the workspace Launch control.
- Added isolated auto-launch handling so a failed optional backend cannot block
  Umbra Studio startup or other configured startup work.

## v0.22.7

### Power Prompter LoRA Handoff Hotfix

- Fixed Gallery and filmstrip `Send parameters to TXT2IMG` handoffs omitting
  LoRAs whose syntax was stored inside individual Power Prompter card segments
  rather than the combined positive prompt.
- Restored the complete Umbra UI LoRA stack with the original model and CLIP
  strengths while keeping modular prompt fields clean and preventing duplicate
  LoRA application.
- Added extension-aware LoRA catalog matching so Power Prompter syntax such as
  `Anima/Styles/model` resolves to installed files such as
  `Anima/Styles/model.safetensors` instead of being silently discarded.
- Preserved unresolved receipt LoRAs in the handoff state so temporarily stale
  model catalogs cannot erase generation metadata.

## v0.22.6

### Updater Recovery Hotfix

- Fixed the standalone updater remaining permanently stuck on `Stopping Umbra
  Studio` after an interrupted update, reboot, or updater crash.
- Added automatic recovery for abandoned active states so a dead update becomes
  a clear, retryable failure instead of disabling the updater indefinitely.
- Moved Umbra shutdown ownership into the detached external update worker. The
  update request and worker now exist before shutdown begins, closing the handoff
  gap that could leave no worker, request, or failure log behind.
- Added session heartbeats for the updater and worker so Windows PID reuse after
  a reboot cannot be mistaken for a still-running update.
- Added exact-process shutdown safeguards. A standalone updater refuses to
  replace application files when an unknown Umbra listener is still active.
- Reduced abandoned updater workspace retention to one minute while preserving
  any session with a live heartbeat, preventing old release archives and bundled
  runtimes from accumulating under `User/Cache/UmbraUpdater`.

## v0.22.5

### Power Prompter Resolution Distribution

- Added an optional weighted resolution distribution for Power Prompter queues
  with up to five independently configurable aspect ratios or custom sizes.
- Added queue-wide and per-batch distribution modes while keeping every mixed
  resolution as its own ComfyUI job, avoiding invalid mixed latent batches.
- Preserved logical prompt totals while assigning deterministic resolution
  targets across prompts, seeds, sets, output folders, and generation controls.

### PPUID Restore And Gallery Metadata

- Added durable, deduplicated Power Prompter receipts under the user's data
  folder so a PPUID can restore the exact cards, sets, pipeline, checkpoint,
  LoRAs, generation controls, style, and utility state used for an image.
- Added a prominent `Load from PPUID` action to Power Prompter's Files panel and
  an API lookup for restoring images even when their original folder is closed.
- Added automatic receipt backfilling when older compatible images are inspected
  in the Gallery.
- Added a copyable PPUID field and combined/modular positive-prompt views to
  Gallery details, including the original card badges and LoRA syntax chips.
- Extended Umbra UI image metadata and handoffs so compatible generations retain
  their modular prompts, LoRA stack, resources, seed, model family, and PPUID.

### Power Prompter Editing And Handoffs

- Added direct generation-control handoff from Power Prompter to Umbra UI
  TXT2IMG, IMG2IMG, or Inpaint.
- Made enabled variant ordering independent per set, with predictable insertion
  and movement instead of inheriting stale positions from another set.
- Fixed expanded-editor suggestions so selecting one replaces the partial token
  currently being typed instead of appending after it.
- Reworked the desktop card navigator to use the full row, summarize enabled
  variants, and retain fast selection and drag reordering for larger card files.

### Inpaint Source Replacement

- Added an optional `Replace original after accept` workflow for Gallery and
  output images, matching IMG2IMG's source-replacement flow.
- The accepted full-resolution inpaint is stitched before replacement, refreshes
  Gallery and filmstrip metadata immediately, and keeps a recovery copy.
- Inpaint outputs now carry complete Umbra/Power Prompter generation metadata for
  later restoration and cross-workspace handoff.

### Queue And Preview Performance

- Separated high-frequency generation progress from the heavier Power Prompter
  editor state so thousand-prompt queues no longer repaint the full editor on
  every progress event.
- Fixed expanded Queue Manager rows overlapping after completed prompts leave a
  running group by remeasuring virtual rows and removing stale expansion state.
- Added a global option to disable live generation frames in the filmstrip while
  keeping completed outputs visible, reducing duplicate preview work during
  large queues.

## v0.22.4

### Umbra UI LoRA Controls

- Aligned Umbra UI LoRA tokens with Power Prompter's complete syntax format:
  `<lora:name:model_strength:clip_strength>`, including when both strengths
  are the same.
- Rebuilt the Umbra UI LoRA stack cards with preview thumbnails, explicit
  model and CLIP strength controls, and precise `0.05` increment buttons.
- Persisted LoRA preview metadata from the model browser so LoRA cards remain
  identifiable across TXT2IMG, IMG2IMG, and Inpaint workflows.

## v0.22.3

### Updater Shutdown Hotfix

- Removed automatic Umbra Studio relaunching after both successful and failed
  update attempts. The updater now finishes independently and asks the user to
  start Umbra Studio manually.
- Removed the post-update health wait that could leave a blank launcher
  terminal, a hung Bun process, or an unavailable application port.
- Replaced the updater's `Open Umbra` action with a clean `Close updater`
  action that cannot interrupt an active installation.
- Added Windows and Linux package gates that reject updater bundles if an
  automatic relaunch path returns.

## v0.22.2

### Model Installer Hotfix

- Fixed the packaged model-requirements installer resolving ComfyUI beneath
  `resources/app/Tools/ComfyUI` instead of the portable installation's root
  `Tools/ComfyUI` folder.
- Added startup diagnostics for missing, quarantined, or non-runnable bundled
  Bun runtimes and missing installer scripts.
- Kept interactively opened Windows installer terminals visible after success,
  cancellation, or failure so errors and exit codes can be read.
- Added a release gate that executes the packaged Windows installer and verifies
  that its resolved model destination is the root ComfyUI installation.

## v0.22.1

### Model Installers

- Made `Install-Umbra-UI-Models.bat` open the complete interactive image-model
  prerequisite selector instead of the separate core support-model downloader.
- Added explicitly named Windows and Linux support-model launchers for the
  detailer, SAM, upscaling, interpolation, and reference-conditioning packs.
- Added bounded remote-source validation for every model requirement without
  downloading the complete weights.
- Made cancellation discard the entire incomplete download instead of retaining
  resumable partial model data. Valid size/hash matches are kept, while invalid
  existing files are replaced from byte zero.

## v0.22.0

### BAT-First Windows Release

- Replaced the Windows EXE release with a BAT-only portable package that starts
  Umbra through the bundled Bun runtime.
- Removed the native Windows launcher compiler and executable from the source,
  package builder, release workflow, and release archive.
- Changed the Windows release asset to
  `Umbra-Studio-v0.22.0-Windows-x64-BAT.zip` so legacy EXE updaters cannot
  mistake the launcher transition for an in-place compatible update.
- Made BAT the preferred launcher when an older executable is also present,
  while retaining EXE detection solely for migration from older portable builds.
- Existing EXE installations require a one-time manual migration: extract the
  v0.22.0 BAT package and move the previous `User` and `Tools` folders into its
  `Umbra Studio` folder. Future BAT releases can then use Umbra Updater normally.

## v0.21.10

### Windows Startup And Updating

- Moved update downloads, extraction, rollback backups, logs, and worker files
  under `User/Cache/UmbraUpdater` inside the Umbra Studio installation.
- Replaced hidden external PowerShell cleanup with Umbra-owned cleanup after
  the standalone updater exits, including recovery of abandoned sessions.
- Replaced the large Bun-compiled Windows launcher with a lightweight native
  bootstrapper that starts Umbra through the verified bundled Bun runtime.
- Preserved the active Umbra listener port across updater-controlled restarts
  instead of silently falling back to the default port.
- Made unattended updater restarts own the real Bun launcher process and
  removed the unreachable terminal pause that could leave Bun running after
  Umbra had shut down.
- Added package guards that prevent the standard Windows release from silently
  regressing to the former packed launcher.

## v0.21.9

### Generation And Pipeline Polish

- Added optional tiled VAE encode/decode controls to TXT2IMG, IMG2IMG, and
  Inpaint for lower-memory image workflows.
- Preserved detailer stages and per-pipeline model/resource selections while
  switching image pipeline families.
- Fixed live generation previews after changing pipelines so progress images
  continue updating before the final output completes.
- Added an explicit Invert Mask action to the Inpaint editor.

### Mobile Umbra UI

- Moved the mobile generation-preview and Inpaint-editor launcher into normal
  scroll flow beneath the generation controls.
- Fixed the preview launcher covering Generate Image and Generate Inpaint near
  the bottom of phone workspaces.

### Packaging

- Added interactive Windows and Linux model-requirement installers for shared
  VAEs and text encoders used by supported image-model families. Downloads are
  verified and placed directly into the appropriate ComfyUI model folders.
- Added the model-requirement manifest to clean portable packages and release
  assets so optional prerequisites can be inspected independently.
- GitHub releases continue to publish the established Windows EXE archive;
  BAT-first packaging remains maintained as an emergency/manual option but is
  no longer uploaded as a normal release asset.

## v0.21.8

### Portable Python Pip Repair Hotfix

- Fixed portable ComfyUI setup when a partially created virtual environment
  contains Python but is missing its `pip` module.
- Umbra now verifies and repairs `pip` with Python's offline `ensurepip`
  bootstrap before installing PyTorch, requirements, custom-node packages, or
  SageAttention dependencies.
- Added the same protection to AI-Toolkit, Umbra's Python helper environment,
  and portable Python runtime provisioning.

## v0.21.7

### Portable ComfyUI Setup Hotfix

- Fixed managed ComfyUI and AI-Toolkit setup when an existing virtual
  environment is named `env` or `.venv` instead of `venv`.
- PyTorch and requirements installation now invoke the discovered virtual
  environment Python executable directly, so a separately installed system
  Python is not required.
- Replaced setup-console glyphs with portable ASCII output to keep Windows
  setup logs readable across console code pages.

## v0.21.6

### German Localization

- Added German (`Deutsch`) as a selectable Umbra Studio language across Global
  Settings, the mobile interface, onboarding, and the standalone setup utility.
- Localized the static interface catalog and dynamic UI labels while preserving
  product names, model identifiers, file paths, prompts, and user-authored data.
- Added German localization coverage and a static catalog audit to help keep
  future interface work ready for translation.

### Reliability And Workflow Polish

- Persisted Umbra UI image controls in the portable User configuration so
  updates keep a creator's selected resources, LoRAs, generation settings,
  detailer pipeline, Hires Fix, and output-upscale preferences intact.
- Improved the Power Prompter card overview so enabled variants remain visible
  and easier to review when a project contains many cards.
- Hardened shutdown supervision for Umbra-owned processes so the launcher and
  updater can recover more reliably when a managed Bun server does not exit
  cleanly.

## v0.21.5

### Mobile Gallery And Notifications

- Made the phone Gallery chrome slide away during a downward media scroll and
  return on an upward scroll or at the top, giving the media grid more usable
  screen space without losing its controls.
- Replaced transient error-only feedback with a persistent session Issues
  center. Desktop exposes it from the sidebar; phone mode keeps errors out of
  the workspace, surfaces an unread badge in More, and adds a restrained
  attention pulse until issues are reviewed.
- Grouped repeated errors in the Issues center so a failing action does not
  stack duplicate notifications over the application.

### Defaults And Repository Hygiene

- Changed the optional Eyes detailer stage to ship disabled, so a fresh setup
  does not report a missing user-supplied model before generation starts.
- Kept existing users' explicitly enabled optional Eyes detailer setting intact
  during default migration.
- Excluded internal test sources from generated repository-ready trees and
  ignored future `.test.*` files in the public repository checkout, including
  removal of test-only commands that would otherwise reference omitted files.

## v0.21.4

### Agent And Prompt Workflows

- Kept Hermes prompt enhancement inside one reusable conversation instead of
  creating a new Hermes chat for every request.
- Added explicit agent model selection, connection guidance, reusable
  instructions, and prompt drafts to the shared Global Settings agent panel.
- Added Power Prompter agent controls for enhancing individual variants or
  complete generated prompts before queue submission.
- Added default Anima and SDXL instructions that ground agent output in the
  user's Danbooru CSV libraries and request valid tag-style prompts.

### Data Forge And Gallery Reliability

- Expanded Data Forge source authentication and validation for Gelbooru,
  Rule34, and e621 while keeping credentials in user-owned configuration.
- Added pause, resume, and stop controls to dataset generation and optional
  Japanese and Simplified Chinese tag localization.
- Improved trash media resolution so Gallery thumbnails and previews continue
  to load from their actual trash locations.
- Hardened missing-file and stale-media handling across Gallery operations.

### Power Prompter Polish

- Restored mobile card creation and improved mobile model-selection behavior.
- Added reusable default detailer prompt concatenation settings to packaged
  Power Prompter cards and generation controls.
- Improved prompt search, agent instructions, CSV grounding, and queue prompt
  construction across editor and generated variants.

### Typography And Packaging

- Normalized typography metrics so System, Serif, Retro, Mono, and Display
  choices render at comparable perceived sizes.
- Added a persistent Text Size stepper in Theme Studio with 85% to 140% sizing
  in five-percent increments, including Gallery theme propagation.
- Updated packaging, credits, localization catalogs, and regression coverage
  for the included agent, Data Forge, Gallery, and Power Prompter changes.

## v0.21.3

### Mobile Settings And Model Selection

- Redesigned Global Settings as a full-screen phone workspace with a compact
  section selector, touch-friendly controls, a stable action footer, and no
  horizontal clipping across General, Storage, Theme Studio, ComfyUI, System
  Monitor, or Advanced settings.
- Reworked Power Prompter checkpoint and LoRA selection for mobile with
  full-screen pickers, responsive model cards, visible confirmation actions,
  and the same thumbnail catalog behavior used by Umbra UI.
- Prevented phone model pickers from summoning the software keyboard until the
  user explicitly selects search.

### Umbra UI Agent Controls

- Rebuilt the Umbra UI agent settings modal for narrow screens with
  phone-native tab scaffolding, stacked configuration panes, larger actions,
  and reliable scrolling.
- Added focused regression coverage for the mobile Global Settings, Power
  Prompter model pickers, shared model catalog, and agent settings layouts.

## v0.21.2

### Umbra Remote Mobile Polish

- Redesigned checkpoint and LoRA selection for phone layouts with full-screen
  pickers, touch-friendly model cards, folder filtering, stable action bars,
  and responsive thumbnail presentation.
- Prevented mobile model pickers from opening the software keyboard
  automatically while preserving search when the user explicitly selects it.
- Fixed the mobile ComfyUI management workspace crash caused by a missing UI
  helper, while keeping ComfyUI itself desktop-only.
- Improved Gallery touch navigation so double-tap and swipe gestures no longer
  fight browser zoom or leave the mobile client in a broken interaction state.

### Power Prompter And Queue Controls

- Restored Power Prompter's mobile card actions, including cycle, shuffle,
  variant creation and deletion, card rename/copy/cut/delete, and set
  randomization controls.
- Added compact mobile sheets for card actions and card controls so the full
  toolset remains available without crowding the active card.
- Changed the mobile Queue Manager header and progress summary to scroll with
  the queue list, reclaiming screen space while keeping them available when
  the user returns to the top.

## v0.21.1

### Standalone Setup

- Replaced the startup-blocking first-run wizard with an optional standalone
  setup utility that runs independently from Umbra Studio on
  `127.0.0.1:8215`.
- Added `UmbraSetup.bat` for Windows and `umbra-setup.sh` for Linux, using the
  bundled Bun runtime without starting Umbra, ComfyUI, AI Toolkit, or the
  Gallery service.
- Added preferred-language selection with atomic settings persistence for
  English, Japanese, Simplified Chinese, and Korean.
- Added guided installation and live output for the Data Forge WD tagger and
  natural-language caption model pack.
- Added guided installation and verification for Umbra UI core support models
  through the managed ComfyUI installation.
- Added launch and close actions so users can finish setup and enter Umbra
  without leaving a background setup service running.

### Startup And Remote Reliability

- Removed the first-run gate from the React application so normal startup and
  browser refreshes open Umbra directly.
- Removed the obsolete global setting that could force the setup wizard on
  every launch.
- Made the compatibility onboarding endpoint always report setup complete so
  stale remote clients cannot be redirected into the retired migration flow.
- Removed the unused in-app first-run wizard component and its startup-time
  network dependency.
- Kept language selection available later from Global Settings.

### Packaging And Documentation

- Added the standalone setup app, page, and platform launchers to Windows,
  Linux, and clean repository-source packaging.
- Added package verification and tests that reject releases missing the setup
  service or launcher.
- Replaced the previous-build migration walkthrough with the standalone setup
  and updater workflow. Umbra Updater remains responsible for preserving the
  active `User/` and `Tools/` directories during upgrades.

## v0.21.0

### Umbra Director

- Added a dedicated LTX multi-shot director for building one generated video
  from individually timed shots with independent prompts and optional reference
  images.
- Added per-shot duration controls in seconds while preserving a separate
  project frame-rate selector and exact frame calculations for LTX.
- Added agent-assisted prompt enhancement for individual shots, shot
  reordering, review details, and drag-and-drop media intake from Gallery and
  the filmstrip.
- Kept Director dispatch distinct from ordinary TXT2VID, IMG2VID, first/last
  frame, and middle-frame generation so incompatible controls are not mixed
  into the graph.
- Added an Umbra-owned storyboard compiler and runtime contract rather than
  depending on a third-party director node or API.

### Extended Video

- Added sequential LTX continuation for one to twelve clips, producing videos
  up to two minutes long from a single reviewed queue submission.
- Added optional IMG2VID starting-frame support while retaining a TXT2VID start
  when no image is selected.
- Made every continuation use the exact decoded last frame from the previous
  clip, with independent prompts and durations for each segment.
- Added backend-owned continuation staging, progress reporting, cancellation,
  failure recovery, final MP4 assembly, and cleanup of temporary handoff media.
- Completed a real twelve-clip acceptance run that produced a valid 120.5
  second, 24 FPS H.264 video with all clips generated and joined successfully.

### Video Workflow Polish

- Added explicit video-model selection and clearer separation between LTX, Wan,
  Director, Extended, and ordinary video generation flows.
- Reworked source sizing so image and video inputs drive the generated aspect
  ratio and target-size calculation without requiring manual width and height.
- Improved the video review queue with correctly contained playback, reference
  media, prompts, generation settings, edit-and-requeue actions, and a clear
  control for completed review entries.
- Added context-aware seconds, frames, FPS, source-media, and post-processing
  controls while keeping unsupported settings disabled for the active flow.

### Prompt And Workflow Handoffs

- Added per-field prompt history and undo/redo behavior so restored history or
  agent output cannot permanently overwrite prompt text being edited.
- Added generation-control transfer from Umbra UI TXT2IMG to Power Prompter.
- Preserved Power Prompter card segments when sending prompts into Umbra UI
  instead of flattening every card into one positive-prompt field.
- Restored prompt search to the main Power Prompter editor and kept searched
  variant highlighting available in both editor and preset modes.
- Replaced legacy LoRA drag insertion with click-to-copy token actions across
  Umbra UI and Power Prompter.

### Media And Remote Access

- Rebuilt Gallery and filmstrip context menus with compact primary actions and
  nested workflow destinations for Umbra UI image and video tools.
- Added Director-aware media drag handling and smarter source-type routing.
- Added a shared remote-access policy that keeps Umbra Remote disabled for new
  installations until the user enables it.
- Corrected Tailscale-only reporting and suppressed public forwarding details
  when private tailnet access is the active remote mode.
- Improved remote workspace status accuracy for connection, bind-address, and
  restart-required states.

## v0.20.9

### Power Prompter Agent Enhancement

- Added per-variant agent enhancement controls so individual card variants can
  be refined without changing unrelated prompt segments.
- Added complete-prompt agent enhancement before queue submission, processing
  each generated prompt independently while preserving the queue's exact
  ordering and group structure.
- Added visible enhancement progress, cancellation, timeout handling, and
  validation so a failed agent request cannot silently queue partial work.
- Preserved Power Prompter prompt metadata and segment boundaries through
  enhancement and queue dispatch.

### Updater Reliability

- Reworked the portable update transaction so the live `User/` and `Tools/`
  directories never move during an update.
- Limited transactional replacement and rollback to application-owned files,
  preventing Windows directory locks from aborting updates while gallery
  databases, models, or tool files are still held open.
- Preserved recovery compatibility with update transactions created by older
  builds.
- Removed the updater's legacy network-based cleanup delay.

### Portable Release Layout

- Wrapped Windows and Linux portable release contents in a single
  `Umbra Studio/` directory so extracting a release no longer scatters files
  into the selected destination.
- Kept the automatic updater compatible with the new wrapped archive layout.
- Added release regression coverage for both platform archives and nested
  updater payload discovery.

## v0.20.8

### Selective Agent Prompt Enhancement

- Added an agent toggle to every Umbra UI positive-prompt field so users can
  enhance only the subject, pose, environment, or other segments they choose.
- Added a single action that processes all enabled fields while preserving
  disabled style prompts, trained tokens, weights, LoRA syntax, and unrelated
  prompt segments.
- Prevented asynchronous agent results from overwriting a field that the user
  edited while enhancement was still running.
- Added field-role and generation context to enhancement requests while keeping
  the agent response limited to the selected field.

### Model And LoRA Browser

- Reworked the Umbra UI model picker into a responsive card browser with
  checkpoint and LoRA previews, trained-token counts, and clearer selection
  state.
- Added lazy preview metadata hydration, multiple rotating previews, video
  preview support, CivitAI thumbnail sizing, and local thumbnail overrides.
- Improved matching across model paths, filenames, extensions, and catalog
  aliases so existing Power Prompter metadata and thumbnails resolve reliably.
- Added regression coverage for model alias matching and preview behavior.

### Umbra UI Queue Controls

- Added `Skip` and `Stop All` controls for Umbra UI image and video queues.
- Kept queue controls scoped to Umbra UI requests so Power Prompter batches are
  not canceled accidentally.
- Made Skip interrupt the active ComfyUI generation after updating backend queue
  state, and made Stop All clear both the active request and remaining Umbra UI
  work.
- Added the same controls to mobile generation-preview drawers and a dedicated
  stop action for active inpainting samples.
- Added queue-target and control-state regression coverage.

### Release And Project Polish

- Added a confirmation step before Umbra Studio hands control to the standalone
  updater, clearly warning that Umbra Studio and ComfyUI will shut down.
- Added the official Ko-fi support button to Global Settings and the project
  README without loading Ko-fi's third-party widget script.

## v0.20.7

### Standalone Umbra Updater

- Replaced the in-app self-update lifecycle with a dedicated localhost updater
  page that remains available while Umbra Studio and its managed tools are
  stopped.
- Added `UmbraUpdater.bat` for Windows and `umbra-updater.sh` for Linux so the
  updater can be launched without starting Umbra Studio.
- Moved release selection, changelogs, package download, progress, failure
  reporting, relaunch, and temporary-workspace cleanup into the external
  updater service.
- Kept the existing transactional application swap, `User/` and `Tools/`
  preservation, rollback, package validation, and Umbra Nodes update checks.
- Reserved fixed local port `8214` for updater sessions and removed the
  in-app blank-page reconnect loop.
### Prompt History

- Added persistent Umbra UI prompt history for TXT2IMG and IMG2IMG submissions.
- Preserved exact multi-field prompt grouping, field labels, metadata, and
  intentionally empty field slots when saving and restoring prompts.
- Added per-entry field-count indicators, individual removal, manual saving,
  and a clear-history action.
- Made prompt restoration update only positive and negative prompt fields
  without changing the selected model, pipeline, seed, resolution, hires fix,
  detailers, or other generation settings.
- Stored shared prompt history in the portable `User/UmbraUI` directory so it
  survives application restarts and remains available to Umbra Remote clients.
- Reused the same normalized, bounded, and duplicate-resistant history model
  for inpainting project prompts.

### Generation Preview Polish

- Removed the sampling progress overlay from the generated image preview.
- Moved sampling progress and step counts into the compact queue status area
  beside the active generation position and prompt.
- Kept the mobile preview status and action controls separated with dedicated
  responsive layout selectors.

## v0.20.6

### Umbra UI Agent MCP

- Fixed legacy Umbra UI agent settings failing to load when they did not yet
  contain a generation timeout.
- Restored MCP authentication and connection setup for existing installations
  while preserving their saved access token.
- Added regression coverage for the default agent generation timeout and
  settings migration path.

## v0.20.5

### Updater Accuracy

- Fixed the sidebar `(+n)` badge so it counts only compatible releases that
  are strictly newer than the installed Umbra Studio build.
- Made portable version detection prefer the canonical packaged manifest in
  `resources/app` over stale root-level manifests.
- Added an independent frontend version check so a malformed backend count
  cannot turn the complete release history into available updates.
- Made unknown versions fail closed with no numeric badge instead of treating
  every published release as newer.

### Portable Root Cleanup

- Removed the `ComfyUI-Models`, `ComfyUI-Output`, and `ComfyUI-Nodes` root
  shortcuts from Windows and Linux packages.
- Removed shortcut creation and repair behavior from managed tool setup and
  backend actions.
- Updated Power Prompter to use the canonical `Tools/ComfyUI/models` paths
  directly.
- Added conservative cleanup for legacy junctions and symlinks while leaving
  ordinary folders untouched.

## v0.20.4

### Windows Self-Updater Recovery Hotfix

- Fixed the Windows launcher waiting for Enter after handing control to the
  external updater.
- Changed the visible Windows terminal wrapper to close with the launcher so it
  cannot keep the Umbra Studio application root locked during replacement.
- Fixed portable builds reporting their installed version as `0.0.0` by reading
  the packaged application manifest from `resources/app`.
- Hardened early rollback so `User/` and `Tools/` are restored immediately when
  the original application-root rename cannot begin.
- Added regression coverage for terminal release, packaged version detection,
  early rollback, and preservation of user data and installed tools.

## v0.20.3

### Umbra Remote Onboarding Hotfix

- Fixed established studios without an `onboarding.json` marker being mistaken
  for brand-new installations when opened through Umbra Remote.
- Added a one-time backend recovery path that recognizes persisted pre-wizard
  app settings and creates the completed onboarding marker for every client.
- Kept first-time setup enabled for genuinely clean installations and preserved
  the host-only boundary for language selection and migration.

## v0.20.2

### Portable Self-Updater

- Turned the version display at the bottom of the sidebar into a large,
  clearly styled updater button.
- Added a `(+x)` indicator showing the number of newer compatible releases
  available for the current platform.
- Added an in-app build browser with GitHub release changelogs, package
  details, manual refresh, download progress, and update status.
- Replaced the legacy configured-feed flow with direct discovery from the
  official Nocturne AI Labs GitHub Releases.
- Added a dedicated external Bun update worker so Umbra, ComfyUI, AI Toolkit,
  Gallery, and the launcher can shut down before application files change.
- Portable updates now install the complete platform package while preserving
  the existing `User/` and `Tools/` trees in the stable Umbra Studio root.
- Added release package version validation, SHA-256 verification when supplied
  by GitHub, ZIP path-traversal protection, and atomic update-state files.
- Added automatic Umbra Nodes synchronization from the public repository when
  a managed ComfyUI installation is present.
- Added automatic launcher restart, browser reconnection, fixed-port health
  validation, and rollback to the previous build when the new build cannot
  start successfully.
- Kept update behavior on Umbra's configured root and port without alternate
  ports, fallback servers, or partial source patches.
- Added cross-platform packaging checks and transaction tests proving that
  application replacement preserves personal data and can restore the previous
  build.

## v0.20.1

### Localization

- Expanded Japanese localization across the application shell, Umbra UI,
  Power Prompter, Gallery, Model Manager, Data Forge, Umbra Remote, onboarding,
  and Global Settings.
- Added app-wide Simplified Chinese localization with persistent first-run and
  Global Settings language selection.
- Added app-wide Korean localization with the same onboarding, settings, core
  workspace, and dynamic legacy-interface coverage.
- Added static localization audits and regression tests for Japanese,
  Simplified Chinese, and Korean while preserving prompts, filenames, model
  names, and other user-authored or technical content.

### Image Inspector

- Added natural-language caption model selection alongside WD Tagger analysis
  so inspected images can produce reusable generation-ready captions.
- Added direct handoff actions from Image Inspector to TXT2IMG, IMG2IMG,
  Inpaint, and IMG2VID while retaining compatible metadata and generation
  parameters.

### Portable Packaging

- Kept the Linux package focused on its native `start-umbra.sh` launcher while
  removing Windows-only launcher artifacts.
- Added packaging regression tests for the platform-specific launcher layouts.

## v0.20.0

### Release Theme

Umbra Studio `0.20.0` is the portable-workspace milestone. It brings the
first-run experience, migration lifecycle, localization foundation, release
updater, versionless install layout, mobile and remote work, and the latest
generation tooling into one clean release line.

This release includes the unreleased work developed after the public
`0.11.2` build. Existing users can migrate their `User` and `Tools` data from
an older portable build during first-run setup.

### First-Run Setup And Migration

- Added a first-run setup wizard with language selection and previous-build
  migration.
- Added English and Japanese localization foundations for onboarding, the
  application shell, navigation, boot status, and core Global Settings.
- Added a persistent language selector in Global Settings so the chosen
  language can be changed after setup.
- Added an Advanced setting to show the startup wizard again without flashing
  the wizard during ordinary reloads.
- Moved migration into a dedicated external Bun worker so the Umbra server and
  managed services can shut down before files move.
- Migration now moves `User` and `Tools` data instead of duplicating large
  models, reports file and byte progress, rewrites stored paths, and returns
  control to the launcher for restart.
- Added atomic migration request/state files, recovery logging, source-build
  validation, and explicit failure reporting under `Runtime/Migration`.
- Excluded stale Umbra Nodes copies during migration and reinstall the latest
  public Umbra Nodes source into migrated ComfyUI installations.

### Portable Layout And Updates

- Removed nested version folders from portable installs. `Umbra Studio` is now
  the stable application root on Windows and Linux.
- Added the current Umbra Studio version above the sidebar collapse control.
- Updated local no-bump and version-bump packaging to preserve `User` and
  `Tools` in the stable application root.
- Added a release-feed updater mode that compares semantic versions, downloads
  the platform package into protected staging, verifies an optional SHA-256,
  records recovery metadata, and preserves `User` and `Tools`.
- Kept source-checkout updating available for development installations.
- Expanded first-run discovery so legacy `v0.x` portable folders remain valid
  migration sources.

### Umbra Remote And Mobile

- Reworked phone layouts across Umbra UI, Power Prompter, Gallery, Model
  Manager, queue editing, presets, and remote administration.
- Added touch-sized controls, compact modal selectors, workspace-specific
  mobile navigation, and dedicated controls/results surfaces for generation.
- Removed desktop-only Data Forge, embedded ComfyUI, and Local Servers
  workspaces from the phone interface while retaining ComfyUI install, update,
  and launch controls.
- Added authenticated remote logout, trusted-device removal, and persistent
  Desktop, Tablet, and Mobile presentation selection.
- Corrected Tailscale online, Serve, restart-required, bind-address, IPv4, and
  IPv6 reporting.
- Reduced remote Gallery transfer overhead and preserved active workspace,
  folder, Power Prompter, and Umbra UI state across browser suspension or
  reload.

### Gallery And Media

- Removed Gallery pagination on desktop, tablet, and phone while retaining
  virtualized rendering.
- Fixed Media Viewer navigation so lazy loading no longer wraps at the first
  loaded window in large folders.
- Added nearby-media preloading and swipe transition feedback for mobile.
- Added consistent Opened-folder badges across presentation modes.
- Hardened thumbnail and full-media cache revisioning after deletion,
  regeneration, inpainting, IMG2IMG replacement, and source replacement.

### Umbra UI And Power Prompter

- Unified Power Prompter and Umbra UI around shared model-family pipeline
  definitions and generation controls.
- Added model-aware hires fix, ordered detailer stages, optional output
  upscaling, and compatible sampling/resource controls to Power Prompter.
- Preserved segmented Power Prompter card prompts when sending work to Umbra
  UI instead of flattening every card into one field.
- Added Umbra Power Prompter identity metadata (`ppuid`) so compatible images
  can restore segmented prompts, generation controls, model family,
  dimensions, and seed.
- Added Gallery and Filmstrip actions to restore Power Prompter state or send
  compatible generation parameters to Umbra UI.
- Added consistent seed increment choices of `+1`, `+100`, and `+1000` across
  TXT2IMG, IMG2IMG, Inpaint, and Video.
- Added configurable Agent Mode providers for Hermes, Ollama, LM Studio, and
  OpenAI-compatible local endpoints.

### Data Forge, Models, And Managed Tools

- Kept Data Forge dataset creation, tagging, captioning, model installation,
  and AI Toolkit integration inside the portable workspace.
- Added packaged manifests and platform installers for Data Forge captioning
  models and Umbra UI support models without committing personal model data.
- Kept AI Toolkit and ComfyUI as managed installations with their own
  environments and user-controlled model libraries.
- Made the public
  [Umbra Nodes repository](https://github.com/Nocturne-Ai-Labs/Umbra-Nodes)
  the single installation and update source for managed ComfyUI.
- Removed bundled Umbra Nodes payloads and duplicate example workflows from
  portable packages.

### Linux And Release Engineering

- Updated Linux portable packages to the official Bun `1.4.0` canary runtime
  and added a release gate that rejects older bundled Bun versions.
- Verified the versionless Linux package lifecycle in Docker, including
  executable permissions, runtime dependencies, clean packaging, and
  preservation of existing `User` and `Tools` data during in-place updates.
- Updated the clean repository builder and release workflow for versionless
  Windows and Linux archives.
- Kept generated checkpoints, LoRAs, VAEs, text encoders, personal datasets,
  API keys, outputs, installed tools, and other user runtime state out of the
  public repository and release source.

## v0.11.3

### First-Run Setup And Migration

- Added a first-run setup wizard with English and Japanese language selection.
- Added a portable-build migration flow that can inspect an older Umbra Studio
  folder and move/merge its `User` and `Tools` data into the current build
  without duplicating same-drive model files.
- Migrations now run in a separate worker after Umbra Studio and its managed
  services shut down, then relaunch the destination build when complete.
- Excluded all existing `Umbra-Nodes` folders from migration and reinstall the
  latest public Umbra Nodes version into migrated ComfyUI installations.
- Added atomic migration state, source-build validation, progress recovery, and
  migration logging under `Runtime/Migration`.
- Simplified migration to one external worker with one shutdown and one
  launcher-owned restart. The worker does not bind Umbra's port or run a port
  probe; the original launcher watches the migration state file, restarts the
  server in place, and lets the browser reconnect after it returns.

### Japanese Localization

- Added the shared localization provider, persistent `ui.language` setting, and
  Japanese translations for first-run setup, the application shell, primary
  navigation, boot status, and core Global Settings controls.
- Added an in-app language selector so users can change languages after setup.
- Added contributor documentation for extending the translation catalog and
  preserving the external migration lifecycle.

## v0.11.2

### Release Theme

Umbra Studio `0.11.2` is a focused remote-workflow and portability update. It
finishes the first serious mobile pass for Umbra Remote, removes Gallery
pagination boundaries, preserves workspace state across browser reloads, and
tightens the installation boundary between Umbra Studio and Umbra Nodes.

### Umbra Remote And Mobile

- Reworked the phone layouts for Umbra UI, Power Prompter, Gallery, and Model
  Manager around touch-sized controls, compact selectors, and vertical
  navigation.
- Added dedicated mobile controls and preview surfaces for Umbra UI workflows,
  including the inverse editor-first arrangement used by Inpaint.
- Replaced Power Prompter's horizontal card and set strips with modal selectors
  so phone gestures do not trigger accidental browser navigation.
- Added mobile-ready Power Prompter Cards, Presets, Queue, and Queue Editor
  views while removing preview/output clutter from the mobile queue.
- Added a focused mobile Model Manager with model/discovery tabs, folder and
  action sheets, touch-sized search, and compact model browsing.
- Kept Data Forge, embedded ComfyUI, and Local Servers out of the phone
  workspace while retaining mobile controls to install, update, and launch
  managed ComfyUI.
- Added remote device logout, device-forget behavior, and desktop/tablet/phone
  presentation switching.
- Corrected Remote status reporting for Tailscale connectivity, bind addresses,
  IPv4/IPv6 addresses, Serve state, and restart-required state.
- Reduced Umbra Remote media transfer overhead so large Gallery folders no
  longer generate excessive background traffic.

### Durable Workspace Resume

- Added per-device, per-presentation local workspace snapshots for desktop,
  tablet, and phone clients.
- Restored the active workspace and selected Local Server app after browser
  suspension or reload.
- Restored Gallery folder, sort, grouping, focus, and mobile Folders/Media mode
  before the first visible render.
- Restored Power Prompter file, panel, target set, search, filters, split,
  collapsed panels, and editor state.
- Restored Umbra UI image controls, prompt segments, model resources, LoRAs,
  seed, sampling, dimensions, hires fix, detailers, upscale, IMG2IMG, video
  prompt, and Inpaint mobile-panel state.

### Gallery And Media Viewer

- Removed Gallery pagination across desktop, tablet, and phone. Folder listings
  now expose the complete media collection while retaining virtualized
  rendering.
- Fixed Media Viewer navigation stopping at the currently lazy-loaded Gallery
  window. Arrow and swipe navigation can now move through the full folder.
- Added previous/next media preloading around the active mobile item for faster
  swipe navigation.
- Added a consistent Opened badge for the active Gallery folder on every
  presentation mode.
- Simplified the phone Gallery to a compact multi-thumbnail grid and improved
  swipe transition feedback.

### Umbra UI And Agent Mode

- Added configurable Agent Mode providers for Hermes, Ollama, LM Studio, and
  OpenAI-compatible local endpoints.
- Added saved provider, endpoint, model, temperature, token limit, timeout, and
  optional API-key settings with an in-app connection test.
- Improved generated-prompt cleanup so agent responses are sent directly to
  image or video pipelines without staging syntax or explanatory text.
- Added consistent seed increment choices of `+1`, `+100`, and `+1000` across
  TXT2IMG, IMG2IMG, Inpaint, and Video generation.
- Improved Power Prompter handoff so card segments remain separate Umbra UI
  prompt fields instead of being flattened into one prompt.

### Power Prompter Metadata

- Added Umbra Power Prompter identity metadata (`ppuid`) to generated media so
  Umbra can associate an image with the exact prompt/card state that produced
  it.
- Added Gallery and Filmstrip restore actions for compatible Umbra images.
- Preserved segmented prompts, generation controls, dimensions, model family,
  and seed when compatible media is sent to Umbra UI workflows.

### Umbra Nodes And Packaging

- Removed bundled Umbra Nodes payloads and duplicate example workflows from
  Windows and Linux portable builds.
- Made the public
  [Umbra Nodes repository](https://github.com/Nocturne-Ai-Labs/Umbra-Nodes)
  the single installation and update source used by managed ComfyUI setup.
- Added package validation that rejects a stale top-level `Umbra-Nodes` folder
  in repository-ready, Windows, or Linux outputs.
- Cleaned the Umbra Nodes repository package so runtime installs exclude tests,
  caches, empty dependency manifests, and development-only workflow examples.
- Kept Umbra UI pipeline definitions inside Umbra Studio instead of duplicating
  them in the custom-node repository.

## v0.11.1

### Hotfix

- Updated ComfyUI setup to install and update Umbra Nodes from the public
  Nocturne AI Labs repository:
  `https://github.com/Nocturne-Ai-Labs/Umbra-Nodes`.
- Fixed published-build ComfyUI verification so Umbra UI support model setup
  can find the packaged installer under `resources/app/scripts`.
- Preserved the bundled Umbra Nodes fallback for offline or failed GitHub
  installs, while preferring the latest public `main` branch during setup.
- Updated requirements documentation to point at the new Umbra Nodes repository.

## v0.11.0

### Release Theme

Umbra Studio `0.11.0` is a major usability and reliability update built on the
creative systems introduced in `0.10.5`. It focuses on making Umbra Remote
trustworthy on phones and tablets, preserving generation intent across the
application, and hardening long-running Gallery and Power Prompter workflows.

Canvas Mode remains a future project. It is intentionally not presented as a
finished feature in this release.

### Umbra Remote

- Reworked the Remote workspace to report live Tailscale state instead of
  stale or placeholder status.
- Corrected Tailscale online, Serve, restart-required, bind-address, IPv4, and
  IPv6 reporting.
- Added authenticated remote-device logout and "forget this device" behavior.
  Logging out revokes the active server session and clears both session and
  trusted-device cookies.
- Added persistent Desktop, Tablet, and Mobile layout selection to the remote
  login flow, regular sidebar, and mobile More menu.
- Hardened remote request classification so a `.ts.net` request forwarded by
  Tailscale Serve cannot inherit localhost trust from the loopback proxy
  connection.
- Improved private Local Server and managed-tool iframe routing for remote
  clients while keeping local apps mounted when switching Umbra workspaces.
- Reduced Umbra Remote transfer overhead through production asset
  minification, code splitting, compressed static assets, and remote-aware
  Gallery media delivery.

### Mobile Experience

- Rebuilt the phone shell around touch-sized controls, compact navigation, and
  an app-wide bottom navigation bar.
- Removed redundant workspace headers on phone layouts to return more vertical
  space to the active tool.
- Added denser Gallery grids designed to show multiple media thumbnails without
  forcing immediate scrolling.
- Added mobile Umbra UI control and result views, including a slide-up result
  surface for previews and completed media.
- Added mobile Power Prompter Cards, Presets, Queue, and Queue Editor layouts.
- Replaced horizontal card and set strips with selector buttons and focused
  single-card navigation, avoiding accidental Android and iOS back gestures.
- Removed generation previews and output clutter from the mobile Queue Manager
  so queued sets and groups remain the primary surface.
- Corrected mobile preset-selector clipping, card viewport sizing, bottom-safe
  spacing, and nested scroll behavior.
- Added touch-friendly Data Forge filters and dataset navigation controls.

### Power Prompter And PPUID

- Added PPUID metadata to Power Prompter PNG outputs. Each compatible image can
  carry a versioned, compressed snapshot of its originating card document,
  exact prompt segments, generation controls, queue identity, and workflow
  context.
- Added a content hash to PPUID snapshots so corrupted or mismatched embedded
  metadata is rejected instead of silently restoring incorrect state.
- Added "Restore Power Prompter State" actions to Gallery and Filmstrip context
  menus. Restore opens the originating document state without overwriting the
  source `.ppcards` file.
- Added structured handoff recovery so Style, Character, Pose, and other prompt
  segments can populate separate Umbra UI prompt fields.
- Added metadata handoff from compatible images into TXT2IMG, IMG2IMG, and
  Inpaint, including prompt, negative prompt, model family, dimensions,
  sampler, scheduler, CFG or guidance, seed, LoRAs, and resource selections.
- Added seed variation controls with `+1`, `+100`, and `+1000` increments.
- Improved atomic queue-group replacement when editing queued work so the
  replacement retains its intended position without leaving stale or duplicate
  groups behind.
- Hardened pause, update, resume, cancellation, requeue, and backend-owned
  remaining-row synchronization for long multi-set queues.
- Continued Power Prompter's transition onto the same capability-aware pipeline
  contracts used by Umbra UI, including shared generation controls, hires fix,
  ordered detailers, and optional final upscale behavior.

### Gallery, Filmstrip, And Media Viewer

- Fixed Media Viewer navigation across lazy-loaded folders. Arrow-key and next
  navigation now request additional pages and can travel from the first image
  to the true end of a large folder instead of wrapping at the initial loaded
  thumbnail batch.
- Hardened media identity and browser-cache invalidation when a file is
  deleted, replaced, regenerated, renamed, or reused at the same path.
- Corrected stale full-size media where the thumbnail was current but Media
  Viewer still displayed the previous file contents.
- Preserved original-source identity through Inpaint and IMG2IMG handoff chains
  so an explicit replace-source action targets the original generated file.
- Improved Filmstrip folder navigation and stabilized history ordering while
  its folder menu is open.
- Extended responsive Filmstrip and Media Viewer behavior for remote phone
  clients.

### Umbra UI Refinements

- Standardized fixed, random, increment, and decrement seed behavior across
  TXT2IMG, IMG2IMG, Inpaint, Video, and Extras.
- Added the `+1`, `+100`, and `+1000` increment selector to image, inpaint, and
  video generation surfaces.
- Added Power Prompter metadata recovery to Umbra UI handoffs so compatible
  images restore editable prompt structure and generation parameters.
- Improved compact submission choices when Power Prompter owns an active
  queue, while keeping ordinary Generate behavior uncluttered when it does not.
- Refined Inpaint result compositing and layer state so completed generations
  remain opaque, reusable, and available for continued IMG2IMG work.
- Improved Inpaint project persistence, source replacement, result handoff,
  mask and image-layer handling, and recovery from interrupted jobs.
- Preserved Umbra UI workspace state more consistently while changing modes or
  moving between Umbra workspaces.

### Runtime And Reliability

- Added explicit IPv4 and IPv6 listener-origin handling throughout launcher and
  remote URL generation.
- Replaced automatic alternate-port behavior with a clear startup failure when
  the configured Umbra port is occupied. Umbra now preserves its configured
  endpoint instead of silently changing ports and breaking Remote assumptions.
- Added a preflight listener check so occupied-port errors are reported before
  the server process is launched.
- Moved Windows recycle-bin operations out of the Bun server process and into
  a bounded filesystem worker, reducing the chance of native shell operations
  destabilizing or locking a long-running server.
- Improved managed ComfyUI iframe readiness, process ownership checks, update
  flow, and cleanup around stale processes.
- Added focused regression coverage for PPUID PNG chunks, restore handoffs,
  Gallery lazy navigation, remote/Tailscale state, IPv6 address formatting,
  seed variation, media handoffs, and inpaint recovery.

### Packaging And Repository

- Updated Windows and Linux portable packaging to `0.11.0`.
- Added an explicit publish-version override for controlled milestone builds.
- Production frontend builds now minify and split JavaScript and CSS, then emit
  Brotli and gzip variants for supported assets.
- Kept portable releases free of personal `User/` data, installed tools,
  checkpoints, LoRAs, API credentials, and local runtime state.
- Retained root-level Windows and Linux installers plus versioned manifests for
  Umbra UI support models and Data Forge caption models.
- Kept optional managed tools and user-selected generation models outside the
  core archive so users can install, update, or migrate them independently.

### Upgrading From v0.10.5

1. Close Umbra Studio, ComfyUI, AI Toolkit, and related terminals.
2. Extract `v0.11.0` into a new folder.
3. Copy only the old `User/` and `Tools/` folders into the new installation.
4. Run `Install-Umbra-UI-Models.bat` on Windows or
   `./install-umbra-ui-models.sh` on Linux to install or verify the current core
   support models.
5. Run `Install-Data-Forge-Models.bat` or
   `./install-data-forge-models.sh` if the Data Forge caption pack is not
   already present under the migrated `User/Models/` folder.
6. Start Umbra Studio and review the selected Umbra UI and Power Prompter model
   pipeline.
7. Remote browsers may need to sign in again if their trusted session was
   intentionally revoked or the old `User/Config/` was not migrated.

Do not copy an older `Runtime/`, `resources/app/`, launcher, or executable over
the new release. Platform-specific virtual environments should be reinstalled
when moving between Windows and Linux. Back up important `User/` data before
any migration.

## v0.10.5

### Release Theme

Umbra Studio `0.10.5` is a polish and release-readiness update built on the
initial `0.10.4` public release. It completes the support-model provisioning,
pipeline defaults, documentation, credits, and portable release flow needed to
use Umbra UI and Power Prompter without manually hunting down every helper
model.

### Added

- Added a checksum-pinned Umbra UI core support pack for face, hand, and person
  detailers, SAM ViT-B mask refinement, Real-ESRGAN x4plus upscaling, and RIFE
  4.26 frame interpolation.
- Added Windows and Linux support-model installers to every portable package.
- Added an optional SDXL reference-conditioning profile for IP-Adapter and CLIP
  Vision models.
- Added machine-readable Data Forge and Umbra UI model manifests to GitHub
  releases so users can inspect exact sources, revisions, sizes, and hashes.

### Improved

- Standardized compatible image and image-to-image pipelines on the
  permissively licensed Real-ESRGAN x4plus upscale model.
- Improved managed ComfyUI setup so the core support pack is installed and
  verified automatically while large generation checkpoints remain
  user-selected.
- Expanded dependency, model, custom-node, and creator credits, including the
  technologies used to build Umbra Studio.
- Clarified first-run requirements, optional AI Toolkit prerequisites, Linux
  native packages, and the latest-branch policy for managed custom nodes.
- Hardened Windows portable ZIP creation for Explorer and duplicate-download
  folder names.
- Updated tagged GitHub releases to publish curated notes from this changelog.

### Upgrading From v0.10.4

1. Close Umbra Studio, ComfyUI, AI Toolkit, and related terminals.
2. Extract `v0.10.5` into a new folder.
3. Copy only the old `User/` and `Tools/` folders into the new installation.
4. Run `Install-Umbra-UI-Models.bat` on Windows or
   `./install-umbra-ui-models.sh` on Linux to install or verify the new core
   support pack for an existing managed ComfyUI installation.

Do not copy an older `Runtime/`, `resources/app/`, launcher, or executable over
the new release. Platform-specific virtual environments should be reinstalled
when moving between Windows and Linux.

## v0.10.4 - Initial Public Release

### Migrating From an Earlier Portable Version

Existing users can migrate their installed tools and personal Umbra data into
the new portable version:

1. Close Umbra Studio, ComfyUI, AI Toolkit, and any related terminals.
2. Back up the existing installation.
3. Extract the new Umbra Studio release into a new folder.
4. Copy the old `User/` folder into the new installation to retain settings,
   datasets, outputs, Power Prompter files, and other user-owned data.
5. Copy the old `Tools/` folder into the new installation to retain managed
   ComfyUI and AI Toolkit installations, models, and tool-local environments.

Only migrate `User/` and `Tools/`. Do not copy an older `Runtime/`,
`resources/app/`, launcher, or executable over the new release. When moving
between Windows and Linux, reinstall platform-specific tools instead of
copying their virtual environments.

### Release Highlights

- Repacked the Windows portable archive with Explorer-compatible ZIP paths.
- Introduced the capability-driven Umbra UI generation pipeline system.
- Added shared Power Prompter pipeline controls, including hires fix,
  configurable detailers, and optional output upscaling.
- Expanded Umbra UI image, video, inpainting, and media handoff workflows.
- Expanded Data Forge dataset, captioning, search, and AI Toolkit integration.
- Added Windows and Linux x64 portable ZIP packages.
