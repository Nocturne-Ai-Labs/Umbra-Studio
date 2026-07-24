# Umbra Studio Publishing Guide

This file is for future agents and developers who need to publish Umbra Studio
portable builds.

Canonical repository: `https://github.com/Nocturne-Ai-Labs/Umbra-Studio`

Umbra Studio is owned and published by Nocturne AI Labs and developed by
Minokai.

## Default Release Policy

Published updates are versioned releases by default. Increment the patch
version once before building any platform packages unless the user explicitly
requests a minor or major milestone, update `CHANGELOG.md`, and use that same
version for Windows, Linux, the Git tag, and GitHub release.

Use a no-bump build only when the user explicitly asks for a local no-bump
build or an in-place update of an existing local version folder. GitHub Actions
uses the no-bump packaging commands intentionally because tagged source has
already been versioned; it must never bump once per platform.

Before publishing, confirm with the user only when the request does not already
specify:

1. Which platform are we publishing for: Windows, Linux, or both?
2. What target publish folder should be used for a local build?

Do not guess the target folder. Runtime folders can contain user data, tools,
models, generated outputs, and local app state.

## Environment Variables

Set the publish root before running a build when the target is not the default.

Windows:

```powershell
$env:UMBRA_PUBLISH_ROOT="C:\Path\To\Umbra Builds"
```

Linux:

```bash
export UMBRA_LINUX_PUBLISH_ROOT="$HOME/Applications/Umbra Studio"
```

`UMBRA_PUBLISH_ROOT` is also accepted by Linux scripts, but
`UMBRA_LINUX_PUBLISH_ROOT` is preferred so Windows and Linux targets do not get
mixed up.

## Windows Portable Builds

No-bump update of the current version folder:

```powershell
bun run webapp:update-folder:no-bump
```

Version-bump clean release:

```powershell
bun run webapp:update-folder
```

The Windows publish script preserves `User/` and `Tools/` during no-bump
updates. Clean releases create a fresh runtime skeleton.

Local portable builds bundle the pinned Data Forge models by default. Set
`UMBRA_BUNDLE_DATA_FORGE_MODELS=0` only for a package that will ship with the
generated `Install-Data-Forge-Models.bat` downloader instead. The build verifies
every bundled model file against the expected size in
`defaults/DataForge/model-manifest.json`.

Every Windows package also includes `Install-Umbra-UI-Models.bat` and the
Umbra UI support-model manifest. Managed ComfyUI setup installs the automatic
`core` profile; the helper remains available for repair and for explicitly
installing optional profiles.

## Linux Portable Folder Builds

Run these commands on Linux.

No-bump update of the current version folder:

```bash
bun run linux:update-folder:no-bump
```

Version-bump clean release:

```bash
bun run linux:update-folder
```

The Linux folder build creates:

```text
<publish-root>/v<version>/
```

Important files:

```text
start-umbra.sh
UmbraStudio.desktop
resources/app/
Runtime/Bun/linux/bun
User/
Tools/
```

`Runtime/Python311/` and `Runtime/PythonHelpers/venv/` are created after the
appropriate managed-tool or Python-helper bootstrap. They are not copied from a
developer machine into a clean GitHub release.

Python isolation expectations:

- ComfyUI and other managed Python tools must use tool-local venvs such as
  `Tools/ComfyUI/venv/`.
- Umbra-owned Python helpers, including WD tagger helpers, should use
  `Runtime/PythonHelpers/venv/`.
- Run `./install-tools.sh python-helpers` or `bun run webapp:prepare-runtime`
  plus `bun setup-tools.ts python-helpers` when preparing a Linux runtime.

Linux packages built with `UMBRA_BUNDLE_DATA_FORGE_MODELS=0` include
`install-data-forge-models.sh`. Local Linux builds bundle the same pinned model
pack by default and verify it before the publish is accepted.

Every Linux package also includes `install-umbra-ui-models.sh` and the same
cross-platform support-model manifest used by Windows.

## Clean Repository Source

The development tree contains personal runtime data and is not itself the
public repository checkout. Generate a source-only tree into an explicitly
chosen empty folder:

```powershell
bun run repository:build -- --output "C:\Path\To\Umbra Studio Repository Source"
```

The source builder includes application code, tracked defaults, repository
branding, release automation, an empty `Tools/` folder, and a documented
`User/` directory skeleton. It rejects all runtime data inside that skeleton,
the legacy top-level `Models/` folder, `Runtime/`, generated frontend output,
databases, model weights, symlinks, and files over 100 MB.

Never initialize or push the development folder directly. Clone the canonical
repository separately, generate a clean source folder, review it, and then
copy the reviewed source into that checkout.

## GitHub Portable Releases

`.github/workflows/release.yml` builds Windows and Linux portable packages.
It can run manually without publishing, or publish from a `v*` tag. The GitHub
packages intentionally omit the 6+ GB Data Forge model weights because GitHub
release assets have practical per-file limits. Each package includes a model
installer that downloads the exact pinned model revisions into `User/Models`
and rejects incomplete or checksum-mismatched downloads. The workflow also
publishes `Data-Forge-Models-v<version>.json` as a release asset so the exact
model bill of materials is visible without extracting either platform package.

The GitHub workflow must continue to package:

- Umbra UI pipeline definitions from `defaults/PowerPrompter/API Workflows/`
- Power Prompter starter card, CSV sources, and example workflow from `defaults/`
- Data Forge backend/frontend code and pinned model downloader scripts
- Umbra UI support-model manifest, downloader, and platform helper scripts
- AI Toolkit install/update integration, while leaving its checkout in `Tools/`
- Umbra Nodes installation/integration without committing a user's custom-node folder
- Bundled Bun runtime, launchers, credits, license, and notices

The workflow publishes both `Data-Forge-Models-v<version>.json` and
`Umbra-UI-Support-Models-v<version>.json` beside the portable archives so the
download bill of materials can be inspected without extracting a package.

Portable packages must use the curated `umbraRuntimeDependencies` list from
`package.json`. `scripts/prepare-runtime-dependencies.mjs` installs those
dependencies for the current target platform and verifies the native Sharp
runtime before packaging. Never copy the development checkout's complete
`node_modules`; it contains frontend and build tooling that is already compiled
into the app and adds tens of thousands of unnecessary files.

AI Toolkit, ComfyUI, generation checkpoints, LoRAs, VAEs, text encoders, and
other large user-selected model files remain managed installations. The clean
repository contains only placeholders beneath `Tools/` and `User/`; data must
never be copied from a developer's `Tools/` or `User/` directory into GitHub.
AI Toolkit's upstream UI currently requires host Git and Node.js 20 or newer;
that optional prerequisite must remain visible in release notes until Umbra
ships a dedicated Node runtime.

ComfyUI custom-node source repositories intentionally follow their latest
upstream default branches. Do not introduce commit pins for managed custom
nodes unless the user explicitly changes this release policy. Runtime model
files are different: automatic model downloads must retain immutable revisions,
expected byte sizes, and SHA-256 hashes in their manifests.

Linux release notes must also list `python3-dev`, `build-essential`, `libgl1`,
and `libglib2.0-0` (or the distribution equivalents). Some managed ComfyUI
custom-node requirements compile Python extensions, and OpenCV-backed nodes
need the standard GL runtime.

## Validation Checklist

After publishing:

- Launch the app from the published folder, not the source tree.
- Confirm `http://127.0.0.1:8212/` opens.
- Confirm Gallery starts.
- Confirm Umbra UI lists its image/video pipelines and can validate a generation.
- Run `Install-Umbra-UI-Models.bat --check` or
  `./install-umbra-ui-models.sh --check` and confirm the core support pack verifies.
- Confirm Power Prompter loads presets/cards.
- Confirm Power Prompter and Umbra UI share the packaged pipeline definitions.
- Confirm Data Forge opens and both model installer scripts resolve their pinned models.
- Confirm AI Toolkit can install, update, launch, and see Data Forge datasets.
- Confirm ComfyUI can install/update/start.
- Confirm Local Servers open local/LAN URLs.
- Confirm Windows and Linux packages contain no personal `User/` files or installed `Tools/` checkouts.
- Confirm no runtime data was wiped during no-bump updates.

## Public Release Gate

Do not make the repository public or publish release assets until every item
below has been reviewed in a clean packaged build:

- [ ] Refresh the Umbra UI tour from a clean workspace using only the curated
  PG-safe source in `.github/assets/umbra-ui-tour-inpaint-source.png`.
- [ ] Review every repository screenshot at full size and confirm it contains
  no NSFW media, private outputs, personal paths, prompt history, or persisted
  developer workspace state.
- [ ] Confirm Power Prompter visibly exposes the shared model-family pipeline,
  model resources, sampling controls, hires fix, ordered detailer stages, and
  optional output upscale wherever the selected pipeline supports them.
- [ ] Queue a Power Prompter group with hires fix and at least one detailer
  enabled, then verify the backend receives those exact controls and the output
  metadata records them.
- [ ] Confirm disabled hires-fix, detailer, and output-upscale stages are truly
  bypassed and do not load models or leave invalid graph inputs.
- [ ] Confirm TXT2IMG, IMG2IMG, Inpaint, Video, and Extras retain their state
  while switching Umbra Studio workspaces.
- [ ] Run the repository source audit, frontend build, lint, source tests, and
  Umbra UI pipeline audit from the clean repository candidate.

## Safety Rules

- Never delete `User/` or `Tools/` in a no-bump update.
- Stop running Umbra processes before replacing a published folder.
- Keep Windows and Linux publish roots separate.
- Do not publish from a dirty or personal runtime folder into a public release.
