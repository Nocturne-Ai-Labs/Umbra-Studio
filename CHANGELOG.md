# Changelog

## v0.10.4

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
