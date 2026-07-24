# Changelog

## v0.11.0 - Remote, Recovery, And Mobile Milestone

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
