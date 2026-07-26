# Changelog

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
- Made Windows Authenticode signing opt-in for release builds so unsigned
  portable packages can ship until the publisher identity is configured;
  setting `ENABLE_WINDOWS_SIGNING=true` restores the existing fail-closed
  Azure Artifact Signing and signature verification path.

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

### Signed Windows Releases

- Added mandatory Microsoft Artifact Signing to the Windows GitHub release
  workflow using short-lived GitHub OIDC authentication.
- Added fail-closed checks for every required Azure signing setting so an
  unsigned Windows executable cannot be published accidentally.
- Added Authenticode signature and expected publisher verification before the
  Windows portable archive is created.
- Documented the Azure identity, certificate profile, GitHub configuration,
  verification, and troubleshooting flow for release maintainers.

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

- Simplified Windows portable packages to the compiled `UmbraStudio.exe`
  launcher and removed duplicate batch and shell launchers.
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
