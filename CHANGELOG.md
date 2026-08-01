# Changelog

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
