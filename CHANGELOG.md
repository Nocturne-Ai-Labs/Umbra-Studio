# Changelog

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
