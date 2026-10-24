# Umbra Studio

![Umbra Studio](.github/assets/umbra-studio-banner.png)

![Nocturne Labs](.github/assets/nocturne-labs-banner.png)

**An original Nocturne AI Labs project, developed by Minokai.**

[<img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Support Umbra Studio on Ko-fi" height="36">](https://ko-fi.com/G2G11SL0X3)

Umbra Studio is a desktop-first AI art and workflow application built to unify
generation backends, prompt tooling, media browsing, metadata handling, model
management, and portable tool orchestration inside one app-managed environment.

Umbra Studio has entered **Beta**, beginning with **0.90.0-beta**. Development
will continue through Beta before 1.0. **Umbra Remote mobile is a supported Beta
interface.** See the current release notes for feature-specific limitations,
including Canvas and video generation qualification, and setup requirements.

## Built With

- [Bun](https://bun.sh/) powers Umbra's TypeScript backend, local HTTP and
  WebSocket services, portable runtime, and build tooling.
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
  power the frontend workspaces and shared component system.
- [Python](https://www.python.org/) powers managed AI runtimes and helper
  environments used by ComfyUI, AI Toolkit, dataset tagging, and captioning.
- [Tailwind CSS](https://tailwindcss.com/) supports the frontend styling system.

Portable releases bundle Umbra's Bun runtime and can bootstrap isolated Python
environments for managed tools, so normal users do not need global Bun or
Python installations just to launch the app.

## Before You Install

For most users, the recommended path is a portable release package. Extract it,
run the platform launcher, then install the tools and models needed for the
features you plan to use. A portable release does not require a global Bun or
Python installation for Umbra itself.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the supported platforms, recommended
hardware, Linux packages, ports, per-feature dependencies, caption-model pack,
and links to every managed upstream tool.

See [CHANGELOG.md](CHANGELOG.md) for release highlights. Portable builds include
**Umbra Setup**, which combines guided onboarding, managed-tool maintenance,
model downloads, and application updates. Setup does not block normal Umbra startup.

The version button at the bottom-left opens **Setup > Updates**. `(+x)` reports
newer compatible GitHub releases. Setup opens in a separate tab while Umbra
remains running. Save your work before installing an update; the main app and
its managed tools close cleanly during installation. Select a release, follow the
download and installation progress, then use **Launch Umbra Studio** when the
update finishes. Updates preserve `User/` and `Tools/`. Downloads, rollback
backups, and logs use the root-local `User/Cache/UmbraUpdater` workspace.
Use `UmbraSetup.bat` on Windows or `umbra-setup.sh` on Linux for all setup and
updates. An existing Setup session is reused. Updated Setup automatically removes
obsolete Umbra Updater launchers and UI files from this installation. Release
archives contain small temporary compatibility stubs so older cached update
workers can accept the new package; those stubs are removed after installation
or the first successful Setup launch. `User/`, tools, models, settings, update
logs and rollback data are preserved.

Quick summary:

- Windows 10/11 x64 is the primary platform; Linux x64 portable builds are supported.
- Git and internet access are required to install or update managed tools.
- Generation and training in current portable releases require an NVIDIA GPU with
  current drivers. AMD and Intel GPU acceleration are not supported yet.
- Generation checkpoints, LoRAs, VAEs, text encoders, and video models are supplied by the user.
- AI Toolkit currently requires host Node.js 20 or newer for its upstream web UI.
- Umbra Remote requires the user's own Tailscale account and private tailnet.

Umbra Studio is open source. Forks or contributions that establish reliable AMD
or Intel GPU support are welcome, but those platforms are not supported by the
current releases.

## Umbra Remote Mobile

Umbra Remote's phone and tablet layouts are supported Beta interfaces. Further
usability, stability, and device-compatibility improvements are ongoing.

Phone layouts provide prompt-first image generation, image-to-image and
inpainting controls, folder-based Gallery navigation with a compact filmstrip,
Power Prompter, metadata viewing, visual analysis, and supported media tools.
The phone video layout provides DaSiWa text-to-video and image-to-video.
Canvas and Manga Studio remain desktop/tablet tools; FrameForge, Longshot Studio,
and H3 Director are not offered in the phone layout. Generation uses the host's
managed ComfyUI, installed nodes, and models.

## Feature Highlights

Manga Studio is an experimental desktop/tablet editor under **Umbra UI > Extras**.
Build pages from templates, import artwork or GIFs, and arrange panel-clipped
backgrounds, character layers and editable dialogue. Gallery image menus offer
**Add to Manga Studio**. Generation uses your managed ComfyUI and the existing
image queue; no models are required for importing and editing artwork.

Save editable books in `User/MangaStudio/Projects`; put your own font files in
`User/Fonts` and refresh the font list. Comic Neue and Bangers ship with their
OFL licenses. Page PNG and book PDF/PNG ZIP exports provide still editions;
Manga HTML creates a self-contained scrollable reader with original GIFs,
independent playback, optional lettering and zoom controls. Open the HTML in a
browser; file/email previews may disable scripts. Physical mobile reader devices,
complete localization and all-model generation remain unqualified.

- Gallery and Filmstrip for output browsing, viewing, and organization
- Power Prompter for prompt construction, grouped queues, and tracked batch workflows
- Metadata Scanner for prompt recovery, metadata parsing, and tag workflows
- Model Manager for local model organization and snapshot-based CivitAI import
- Data Forge for dataset collection and curation workflows
- Umbra UI for model-aware image, video, img2img, inpaint, and upscale pipelines
- Experimental Canvas for desktop/tablet layer editing, masks, saved projects, restore points, and portable project export
- Optional LTX 2.3 Storyboard mode for timed per-shot prompts, multiple guide images, and selective agent prompt enhancement
- Managed tool runtime support for ComfyUI and AI Toolkit
- Local Servers for opening localhost/LAN tools inside Umbra

## Interface Tour

### Official H3 and LTX video workflows

Video defaults to **DaSiWa only**, using the bundled, pinned originals
**MiniMax H3 MythicAlchemy C-MMH3-32** and **LTX OmniForge C-LTX23-50**.
The original files and their GPL provenance are under
[`defaults/PowerPrompter/Official Workflows/DaSiWa`](defaults/PowerPrompter/Official%20Workflows/DaSiWa/PROVENANCE.md).
Umbra does not substitute an adapted graph when an official workflow is held.

The separate **Longshot Studio** option embeds the original interface by
[r34vtraining and contributors](https://github.com/r34vtraining/Longshot_Studio).
Install its optional three-pack bundle through **Umbra Setup > Advanced > Tools**,
then restart ComfyUI. MiniMax H3 models and FFmpeg are also needed. The bundle
is downloaded directly from upstream and is not included in Umbra's packages.
The existing Umbra / DaSiWa workspace remains available alongside it.

**Frame Forge** is another optional Video workspace, by
[spacesimeco-hue and contributors](https://github.com/spacesimeco-hue/Chain-Motion-AI-Video-Editor).
Install the editor and its H3 video-node bundle in **Setup > Advanced > Tools**,
then use **Video > Frame Forge > Launch** on the host PC. Umbra opens its unchanged
browser interface and seeds new libraries with the configured ComfyUI address.
Existing Frame Forge settings are preserved. Speech/Qwen and heavy WorldMirror 3D
dependencies are separate choices. Select installed models in Frame Forge settings.
Projects live in `User/FrameForge`; its separate Python environment lives in
`Tools/FrameForge`. Stopping Umbra also closes its owned Frame Forge service.

1. Review the workflow dependency repair in Umbra Setup > Advanced > Tools. It
   uses the existing managed installer for compatible ComfyUI/frontend and node
   suites. Finish queued work and stop managed ComfyUI before repair. Conflicting
   local edits are retained and reported. Models are a separate selection/setup
   step; dependency repair does not download generation weights.
2. Start managed ComfyUI normally and refresh its frontend. In Umbra Video,
   select the official workflow and **Check readiness**, then **Load official
   workflow in ComfyUI**. Resolve missing nodes, models or frontend errors before
   continuing. LTX's original TritonVAE option needs a compatible Triton runtime
   when enabled; it does not make Triton an H3 requirement.
3. Set prompt, installed models, duration and fixed seed through the original
   native controls without editing wiring. Use **Capture from ComfyUI**.
   Alternatively, export both **Workflow JSON** and **API JSON** from the same
   configured native graph, then choose them under **Import native exports**.
   Export again after any change. Each file must be at most 16 MiB; unsafe numeric
   seeds are held rather than rounded. Decimal seed strings are retained.
4. Review the captured prompt and queue one snapshot through **Queue captured
   workflow**. Capture/import does not itself submit a job. Readiness is checked
   again before submission. Missing resources or changed runtime identity hold
   the work until reviewed; there is no automatic retry after an uncertain POST.

The native serializer remains responsible for virtual nodes, status switches and
subgraph expansion. Import checks source topology, execution IDs/classes, direct
executable connections, runtime schemas and retained export hashes. A manual
export pair is supplied by the host user; these checks do not prove that a browser
produced it or qualify GPU execution. A real native export and generation test
are still required to establish runtime compatibility and output quality.

**All video routes** is the explicit legacy route choice. Switching policies saves
the latest controls and device prompt first and pauses affected queue work until
an explicit Resume. Existing adapter modules, settings, drafts, captures and
history remain available. This route choice is separate from restoring an app
source/build backup; app rollback does not silently downgrade Python packages or
custom node suites.

For a temporary Windows development test against an existing local ComfyUI
process, `scripts/prepare-official-comfy-session.ts` can produce a fresh, read-only
binding with `--base-url`, `--tool-root` and `--runtime-root`. The runtime root must
already exist outside both source and the personal installation. Set
`UMBRA_OFFICIAL_COMFY_SESSION` to its JSON and `UMBRA_ROOT` to that isolated folder
only in the test process, with separate Umbra/Comfy ports. The binding expires
after 30 minutes and accepts one official queue submission. PID, creation time,
listener and physical roots are rechecked; tool changes, lifecycle controls,
direct Comfy writes and broad interrupt/clear are held. No setting is persisted.

The screenshots below use safe demonstration media and omit the embedded
ComfyUI workspace. Select an image to open the full-size view.

See the [Umbra UI Tour](UMBRA_UI_TOUR.md) for a guided walkthrough of the shared
model-aware pipeline, TXT2IMG, IMG2IMG, Inpaint, Canvas, Video, Extras, and the Power
Prompter handoff.

| Umbra UI TXT2IMG | Umbra UI Inpaint |
| --- | --- |
| [![Umbra UI TXT2IMG](.github/screenshots/umbra-ui-txt2img.png)](.github/screenshots/umbra-ui-txt2img.png) | [![Umbra UI Inpaint](.github/screenshots/umbra-ui-inpaint.png)](.github/screenshots/umbra-ui-inpaint.png) |

| Power Prompter Editor | Queue Manager |
| --- | --- |
| [![Power Prompter editor](.github/screenshots/power-prompter-editor.png)](.github/screenshots/power-prompter-editor.png) | [![Power Prompter queue manager](.github/screenshots/power-prompter-queue-manager.png)](.github/screenshots/power-prompter-queue-manager.png) |

| Gallery | Data Forge |
| --- | --- |
| [![Gallery](.github/screenshots/gallery.png)](.github/screenshots/gallery.png) | [![Data Forge](.github/screenshots/data-forge.png)](.github/screenshots/data-forge.png) |

| Local Servers | Model Manager |
| --- | --- |
| [![Local Servers](.github/screenshots/local-servers.png)](.github/screenshots/local-servers.png) | [![Model Manager](.github/screenshots/model-manager.png)](.github/screenshots/model-manager.png) |

| Image Inspector | Theme Studio |
| --- | --- |
| [![Image Inspector](.github/screenshots/image-inspector.png)](.github/screenshots/image-inspector.png) | [![Theme Studio](.github/screenshots/theme-studio.png)](.github/screenshots/theme-studio.png) |

## User Release Model

Normal users should download a portable release zip, extract it, and run the
platform launcher. `Umbra-Studio-v<version>-Windows-x64-BAT.zip` starts from
`UmbraStudio.bat` using the bundled Bun runtime. Windows users do not need to
install Bun separately.

v0.22.0 is a one-time manual migration boundary for older Windows EXE builds.
Close Umbra Studio and its managed tools, extract the new BAT package, then move
only the old `User` and `Tools` folders into the new `Umbra Studio` folder. Do
not copy the old `UmbraStudio.exe`. Once migrated, Umbra Setup > Updates can install
future BAT releases normally while preserving `User` and `Tools`.

Linux releases start from `start-umbra.sh`. Users should not need to clone the
repository or install Bun.

The portable app bundles the Bun runtime under:

```text
Runtime/Bun/<platform>/
```

Managed tools and optional model packs are installed from inside Umbra or with the
release's helper scripts. GPU drivers and compatible generation model files remain
the user's responsibility.

ComfyUI uses a private Python 3.13 runtime in `Runtime/Python313`. AI Toolkit uses
a private Python 3.12 runtime in `Runtime/Python312`. Python Helpers retain
their separate Python 3.11 runtime. Setup downloads these
on demand; no Microsoft Store Python installation is required. On Windows, Setup
also downloads verified portable Git into `Runtime/Git` when Git is missing.

To migrate an existing or broken ComfyUI environment, stop ComfyUI in Umbra and
choose **Umbra Setup > Advanced > Tools > Update Python 3.13**. Setup rebuilds the virtual
environment and reinstalls core and installed custom-node requirements. Models,
outputs, settings and custom-node code stay in place. The previous environment
is retained under `Tools/ComfyUI/.umbra-python-backups`; failed upgrades restore
it automatically. Attention packages without compatible wheels hold the upgrade
instead of silently removing them. Launch ComfyUI from Umbra after maintenance
to verify custom-node registration and your workflows.

When installed nodes declare both transparent-background and AlbumentationsX,
the rebuild prepares Umbra's reviewed background-removal packages first and
holds their versions, including Torch/CUDA, through custom-node installation.
An incompatible explicit node requirement stops the upgrade and restores the
previous environment. Setup shows the failure reason and recovery instructions;
review the named node's dependency error before retrying. Inactive optional
package extras do not count as required background-removal dependencies.

For AI Toolkit, **Setup > Advanced > Tools > Update Python 3.12** rebuilds its managed
training environment with upstream runtime pins and verifies a CUDA training
step when an NVIDIA GPU is detected. Datasets, configurations and checkpoints remain in place; its previous
venv is retained under `Tools/AI-Toolkit/.umbra-python-backups`.
For older AI Toolkit checkouts, update the toolkit before upgrading Python.
The AI Toolkit runtime specification recommends Python 3.12:
https://github.com/ostris/ai-toolkit/blob/main/manager/spec.py

AI Toolkit's web UI also needs host Node.js 20+ with npm. On Windows, installing
Node while Umbra is open is supported: retry the install or launch action and
Umbra checks the current registered system PATH. It uses the verified Node/npm
installation without changing your system PATH or requiring an Umbra restart.

### Standalone Setup

Umbra Studio opens directly into the app. Setup is an optional independent
utility and never appears during browser refreshes, Umbra Remote login, or
normal startup.

Run the setup utility from the extracted application root:

Windows:

```bat
UmbraSetup.bat
```

Linux:

```bash
chmod +x umbra-setup.sh
./umbra-setup.sh
```

The utility uses the bundled Bun runtime and serves one local-only Setup app
(default port `8214`; in-app tool shortcuts can allocate a free local port).
**Guided setup** uses the full desktop window: steps and completion status on the
left, one focused task and primary action in the working area, and installation
progress at the bottom. Language is the first step. Existing installations resume
at the first step that needs attention, including a clear Python repair action.
File inventories, logs and individual repairs stay collapsed until needed. Setup
saves your progress and follows this order:

1. Choose and save English, Japanese, Simplified Chinese, Korean, or German.
   The guided instructions change immediately to the selected language.
2. Install managed ComfyUI, including its Python and CUDA/PyTorch environment.
3. Install AI Toolkit if you want to train models, or skip it.
4. Install custom nodes separately from model downloads.
5. Review and install support models. Optional manual models show their original
   download link and the exact destination folder.
6. Choose one generation family, install its prerequisites, and select a compatible
   checkpoint. Some packs include generation weights; prerequisite-only packs
   require a separate checkpoint from Umbra's Model Manager. Additional families
   and feature models can be installed later through **Advanced > Models**.
7. Verify installed requirements, nodes, model checksums, checkpoint integrity,
   FFmpeg and ffprobe. If media tools are missing, use **Ready > Install / repair
   media tools** to download and checksum-verify the portable pair.
   This check does not generate an image. Launch ComfyUI through Umbra afterwards;
   installation verification does not qualify GPU execution or image quality.

Existing valid model files are retained, supported partial downloads resume, and
only one installation or application update runs at a time. **Advanced > Tools** retains
ComfyUI and AI Toolkit repairs, CUDA/PyTorch updates, custom nodes, SageAttention,
and ComfyUI version switching. **Advanced > Models** retains optional Data Forge packs and
model-family downloads. **Updates** lists newer portable releases and shows a
progress bar, transferred bytes, and installation stages. Reopening Setup after
an update replaces an outdated cached session before further maintenance.

The unified app preserves `User/` and `Tools/` during updates and does not migrate
files between versioned folders. Language can also be changed later under
**Settings > General > Language**.

Windows and Linux release packages include FFmpeg and ffprobe in
`Runtime/FFmpeg/<platform>`. Fresh installs and app updates receive the pair
automatically; no separate FFmpeg download or system PATH setup is required.
The GPL-3.0-or-later executables include complete corresponding source archives,
the exact build script, individual licenses, build configuration and codec test
evidence beside the binaries.

Releases also include a portable CPU Python 3.11 helper environment with pandas,
NumPy, Pillow, ONNX Runtime, Hugging Face Hub, safetensors and psutil under
`Runtime/PythonHelpers/bundled/<platform>`. WD Tagger dependencies work without a
system Python or ComfyUI install. **Tagger model weights are not bundled**;
download the desired models through **Umbra Setup > Advanced > Models**. PyTorch,
Transformers, PixAI and natural-language captioning remain separate managed
installations. Setup shows bundled library verification separately
from model and managed-tool readiness. Existing helper venvs are preserved by
app updates, and explicit `UMBRA_PYTHON` overrides keep priority.

For video thumbnail or metadata errors, open **Umbra Setup > Advanced > Tools**, then select **Install / repair media tools**.
Umbra verifies FFmpeg and ffprobe separately. When needed, it downloads a
checksum-pinned portable pair into `Tools/FFmpeg` (about 184 MiB on Windows,
143 MiB on Linux). Repair tools retain their upstream license notices.
Linux extraction requires `tar` and `xz-utils` or equivalents. Existing working
tools are verified without a download. The repair preserves ComfyUI, user data,
and the system PATH. Gallery also finds FFmpeg in this installation's ComfyUI
`imageio_ffmpeg` environment. Explicit `FFMPEG_PATH` / `FFPROBE_PATH` overrides
take priority, followed by managed tools, the release's bundled pair,
bundled imageio FFmpeg, and PATH.

### First Run: Data Forge Caption Models

Data Forge uses a separate caption-model pack of more than 6 GB. Full portable
builds may already include it. GitHub core packages keep these weights out of
the main download; after extracting Umbra Studio, install them from the app
folder with the helper for your platform:

Windows:

```bat
UmbraSetup.bat --tab models --pack data-forge
```

Linux:

```bash
./umbra-setup.sh --tab models --pack data-forge
```

Keep Setup open until installation completes. The
installer verifies every pinned file and places the
models under:

```text
User/Models/WaifuTagger/
User/Models/DataForgeCaption/
```

Users running directly from a repository checkout can install the same pinned
model pack with:

```bash
bun run models:waifu:download
bun run models:caption:download
```

Restart Umbra after installation if Data Forge was already open. Arbitrary
caption models are not currently auto-discovered; manually supplied files must
match one of the supported model folders and file layouts in
`defaults/DataForge/model-manifest.json`.

### First Run: Umbra UI Support Models

Umbra installs the permissively licensed Umbra UI core support pack when it
sets up managed ComfyUI. The approximately 566 MB pack contains every
default-enabled detailer detector: person, face, and hands, plus SAM ViT-B mask refinement,
Real-ESRGAN x4plus upscaling, and RIFE 4.26 frame interpolation. Generation
checkpoints, LoRAs, VAEs, text encoders, ControlNet weights, and video models
remain user-selected downloads.

The same installer can be run or repaired manually from a portable package:

Windows:

```bat
UmbraSetup.bat --tab models --pack support
```

Linux:

```bash
./umbra-setup.sh --tab models --pack support
```

Source checkouts can use:

```bash
bun run models:umbra-ui:download
```

Canvas Control and Reference models are opt-in because several are large or
use model-specific non-commercial licenses. Run the main Umbra UI model
installer and choose only the Canvas resources for the pipelines you use:

```bat
UmbraSetup.bat --tab models
```

```bash
./umbra-setup.sh --tab models
```

The model-family list includes Anima, Qwen Image, and Z-Image Canvas controls,
plus SDXL IP-Adapter and FLUX.1 Redux reference conditioning. The menu shows
the exact download size and identifies non-commercial model terms before a
user confirms the selection.

Every automatic file is fetched from an immutable model revision and checked
by size and SHA-256 using the Umbra UI manifests. The eye
detailer remains saved as an optional disabled stage because `Eyes.pt` has
source-specific CivitAI permissions. Users who provide that detector can turn
the stage on. The listed anime upscalers likewise stay optional and
user-installed.

### Optional: Image Model Prerequisites

Umbra does not bundle large VAEs and text encoders in the release archives.
Use Umbra Setup to install only the resources
for the model families you actually use. Some profiles include generation
weights; review the selected files. Each verified file goes straight into its
correct `Tools/ComfyUI/models/` subfolder.

Windows:

```bat
UmbraSetup.bat --tab models
```

Windows and Linux packages no longer include separate model-download shortcuts.
Use **Umbra Setup > Advanced > Models** for recommendations, family resources, and verification.

Linux:

```bash
./umbra-setup.sh --tab models
```

The menu covers MOSS Image, Anima, FLUX.1, FLUX.2, FLUX3, Qwen Image, Krea 2, Wulver, ERNIE Image,
Z-Image, Chroma 1, Ideogram 4, and the shared OmniGen 2/Ovis AE VAE. It also
explains when a model family such as HiDream-O1 or checkpoint-based SD/SDXL
needs no standalone prerequisite files. Use `--list` to review the menu,
`--family anima` to run a family non-interactively, or `--check` to verify a
previous selection without downloading.
Use `--test-downloads` to validate the selected remote files with tiny ranged
requests without downloading the model weights.

**Image Edit** reuses Canvas layers, masks, selections and saved projects. Its
model selector includes FLUX3, FLUX.2 Edit, HiDream O1, Qwen Image Edit and
Qwen Image 2.1. Available controls follow each pipeline's actual capabilities.

Qwen Image Edit defaults to the official **2511 FP8 mixed** checkpoint and accepts
two additional references alongside the source. Select **Qwen Image Edit 2511**
in Setup's Models tab for the checkpoint and shared Qwen encoder/VAE.
Qwen Image 2.1 uses its own encoder, VAE and edit pipeline, with nine additional
references; address the source as `<image1>` and references as `<image2>`, etc.
Its existing Setup model pack supports generation and editing. The
[Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE)
restricts use of the 2.1 model materials to non-commercial research/evaluation;
[Qwen Edit 2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) is Apache-2.0.
No Turbo LoRA or separate Turbo pipeline is required.

FLUX3 Image Klein supports image editing with the source plus nine additional
reference images, and described layout boxes referenced as `<obj_1>`, `<obj_2>`
in the prompt. The shared FLUX3 pipelines also appear in generation and Manga.
Base and step-distilled checkpoints use the same pipeline; the distilled default
is 16 steps / CFG 1, while the upstream base edit example uses 25 steps / CFG 3.5.
Sampling and resolution stay user-controlled.

Setup declares ComfyUI revision `20b46065ef7f34fa21e8abebe8d0cca90a904d6d`
or a descendant: stable v0.40.0 alone predates the required native FLUX3 nodes.
Use the FLUX3 managed dependency repair, then restart the managed ComfyUI.
Accept the [upstream license](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy)
and select FLUX3 in Setup's Models tab. Download the three files in your signed-in
browser, place them at the displayed destinations, then choose **Verify selected**
for SHA-256 verification. Authenticated downloads through Setup are optional.
The FLUX3 VAE is stored under
`Tools/ComfyUI/models/vae/flux3-vae.safetensors` to preserve the existing FLUX.2 VAE.
Krea3 remains unavailable until an official open-weight editing contract can be verified.

Wulver v0.5 has dedicated **Wulver Turbo** and **Wulver Non-Turbo** pipelines
for text-to-image, image-to-image and masked inpainting/Canvas. The shared
controls include model-only LoRAs, high-res fix, detailers, output upscaling,
tiled VAE, Power Prompter, Manga generation and image metadata handoffs.
Choose the Turbo FP8 pack in Setup for the recommended weights, or the optional
Non-Turbo/BF16 packs. Both use `qwen3vl_4b_bf16.safetensors` in
`Tools/ComfyUI/models/text_encoders/` and `qwen_image_vae.safetensors` in
`Tools/ComfyUI/models/vae/`; diffusion weights go in
`Tools/ComfyUI/models/diffusion_models/`. Existing files are reused after verification.

Turbo defaults to 8 steps / CFG 1; Non-Turbo defaults to 52 steps / CFG 3.5,
with Euler / simple for both. Negative prompts have no effect at CFG 1, but
remain editable when using higher CFG. Resolution stays user-controlled.
Wulver LoRAs patch the diffusion model, leaving its text encoder unchanged.
W4A8 is a manual alternative requiring ComfyUI 0.31+, an SM 8.0+ GPU and
PyTorch cu130+; INT8 and GGUF files are not qualified by these pipelines.
Review [Wulver's model card and Krea 2 license](https://huggingface.co/Vaelico/Wulver)
before downloading or using the model. Umbra packages contain no Wulver weights.

During a download, press `Q` or `Ctrl+C` to cancel. Umbra deletes the incomplete
file completely; a later run starts that file again from byte zero. Existing
files that already match both the pinned size and SHA-256 are retained.

Source checkouts can run the same helper with:

```bash
bun scripts/download-umbra-model-requirements.mjs
```

AI Toolkit is optional and currently requires Git plus Node.js 20 or newer for
its upstream web UI build. Umbra manages its checkout and Python virtual
environment after those host prerequisites are available.

Linux managed-tool installs also require the standard Python build headers and
compiler toolchain because some ComfyUI custom-node dependencies do not publish
wheels for every Python/platform combination. On Debian or Ubuntu, install them
with `sudo apt install python3-dev build-essential libgl1 libglib2.0-0`.

Data Forge includes two captioning paths: four pinned SmilingWolf WD Tagger v3
ONNX models for structured booru tags, and a pinned Qwen2-VL 2B caption model
for natural-language captions. Local portable builds bundle this model pack by
default. Repository checkouts and GitHub core packages keep the model weights
out of Git and install exact revisions from
`defaults/DataForge/model-manifest.json` using the steps above.

### Dataset Caption Sources and Training Export

In **Data Forge > Datasets**, captioning saves descriptions and generated tags
as separate sources for each exact image. Running one producer does not replace
the other or overwrite an existing training `.txt`. Per-image
`<filename>.umbra-caption.json` records retain raw outputs, generation settings,
failure history, the original caption, and a SHA-256 media identity. Existing
unclassified `.txt` files are preserved, not guessed to be descriptions or tags.

Use **Training export** to review natural-language-only, tags-only, or combined
captions. Combined exports expose source order, separator, tag label and optional
underscore conversion. Missing/failed sources, changed images and stale previews
block export. A successful export creates a new folder under
`User/Exports/Datasets/`, containing unchanged image bytes and exactly one `.txt`
per image in `images/`, separate source records, and `caption-export.json` mapping
export names back to their original paths and identities. Filename collisions
are avoided without duplicating samples. The existing **Create ZIP** action
continues to archive the original dataset and its source records.

AI Toolkit reads one configured caption extension (normally `.txt`); two
sidecars do not combine automatically. For descriptions or combined captions,
disable `shuffle_tokens` and set `token_dropout_rate` to `0` so comma-based tag
processing does not scramble or drop prose. Whole-caption dropout remains a
separate trainer option; the loader may adjust comma spacing. Exports flatten
concept folders, so configure repeats/weights in the trainer. The export does
not edit training jobs, validate tokenizer truncation, or assert that combined
captions improve MOSS training.

Python helpers use virtual environments:

- Managed tools such as ComfyUI use tool-local venvs, for example `Tools/ComfyUI/venv/`.
- Umbra helper scripts such as WD tagger use `Runtime/PythonHelpers/venv/`.

## Development Quick Start

Prerequisites for source development:

- Bun
- Git
- Python for ComfyUI/tool runtimes
- Linux: Python development headers and a C/C++ compiler toolchain
- GPU drivers and model files for local generation workflows

From a source checkout:

```powershell
cd umbra-studio
```

Install source dependencies:

```powershell
bun install
```

Run the normal full development server:

```powershell
bun run dev:fullstack
```

Open:

```text
http://localhost:8212
```

Useful development commands:

```powershell
bun run dev:backend
bun run build:frontend
bun run webapp:dev
```

`dev:fullstack` is the preferred day-to-day command. `webapp:dev` runs through
the portable web launcher path and is useful when testing launcher/runtime
behavior.

## Tool Install / Update Entry Points

Linux/macOS:

```bash
./install-tools.sh all
```

Windows:

```bat
install-tools.bat all
```

Single-tool examples:

```bash
./install-tools.sh comfyui
./install-tools.sh comfy-nodes
./install-tools.sh python-helpers
```

AI Toolkit and ComfyUI are managed installations stored under `Tools/`; their
large upstream checkouts and virtual environments are not committed to this
repository. Data Forge model weights are pinned by the included downloader
scripts. GitHub portable packages include **Umbra Setup > Advanced > Models** so users
can install those weights after
extracting the core package. Downloads are checked against the byte sizes and
SHA-256 values in the bundled manifest before installation completes.

Managed ComfyUI custom nodes intentionally track each project's latest
upstream default branch. Umbra does not pin custom-node commits; setup and
update actions pull current upstream changes. Downloadable support-model files
are pinned separately so their integrity and destination remain deterministic.
LTX Storyboard mode uses Umbra Director, maintained inside
[Umbra-Nodes](https://github.com/Nocturne-Ai-Labs/Umbra-Nodes). Umbra owns the
editor, persisted storyboard contract, temporal prompt scheduler, queue
integration, and workflow compiler. Guide images continue through ComfyUI's
native LTX guide nodes.

## Publish Portable Build

Published updates default to a patch version bump. A no-bump build is reserved
for local testing or an in-place local update when the user explicitly requests
it. The commands below cover local builds; tagged releases use the GitHub
Actions workflow.

Future agents should confirm any details not already supplied:

- target platform
- target publish folder for local builds

The version is bumped once before multi-platform packaging. Tagged GitHub
Actions builds use the no-bump packaging commands because the source version is
already final.

GitHub releases are built by `.github/workflows/release.yml`.

### Prepare the bundled media tools

Both packagers require FFmpeg/ffprobe built from the pinned sources before
packaging. The native CI steps in
[release.yml](.github/workflows/release.yml) install the build tools and run
[build-media-from-source.sh](scripts/build-media-from-source.sh). Use fresh,
empty output/work folders for each build attempt. The example paths below live
in the ignored dependency cache; keep your application publish root separate.

Routine builds reuse a verified native media bundle from
`.bun-tmp/media-build-cache`; `UMBRA_MEDIA_CACHE_ROOT` can select a dedicated
build-cache directory. Cache identity includes the target architecture, host
platform, pinned sources, recipe, release workflow and verification code. Every
reuse checks the complete file inventory and runs FFmpeg/ffprobe. A missing or
invalid bundle falls back to the native source build. App-only changes do not
invalidate this cache. Keep the cache separate from application/runtime data.

CI fills the default-branch cache when media build inputs change, allowing later
release tags to reuse it. First builds, evicted caches and changed media inputs
still require compilation. To inspect the cache without packaging, run
`bun scripts/prepare-media-runtime.ts --check-cache` (exit 0 means verified;
exit 1 means a native build is needed).

On Windows, install MSYS2 and open its **UCRT64** shell in the repository. Install
these compiler/build tools, then build the media pair:

```bash
pacman -S --needed make nasm tar diffutils perl mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-pkgconf mingw-w64-ucrt-x86_64-python mingw-w64-ucrt-x86_64-meson mingw-w64-ucrt-x86_64-ninja
bash scripts/build-media-from-source.sh win32 "$PWD/node_modules/.cache/umbra-media-source/windows-output" "$PWD/node_modules/.cache/umbra-media-source/windows-work"
```

Return to PowerShell in the same repository and point the packager at that
completed source build:

```powershell
$env:UMBRA_MEDIA_SOURCE_BUILD = Join-Path $PWD 'node_modules/.cache/umbra-media-source/windows-output'
```

On Linux, use glibc 2.35 or newer. Install the native tools and build the media
pair before invoking the Linux packager:

```bash
sudo apt-get install build-essential nasm cmake pkg-config python3 meson ninja-build
bash scripts/build-media-from-source.sh linux "$PWD/node_modules/.cache/umbra-media-source/linux-output" "$PWD/node_modules/.cache/umbra-media-source/linux-work"
export UMBRA_MEDIA_SOURCE_BUILD="$PWD/node_modules/.cache/umbra-media-source/linux-output"
```

The build verifies each source archive, compiles the required media libraries,
checks native dependencies and runs codec encode/decode tests. Both portable
packages retain complete source archives, the exact recipe, configuration and
license notices. Neither packager copies an installed developer FFmpeg binary.

Windows portable folder builds:

No-bump update of the current portable folder:

```powershell
bun run webapp:update-folder:no-bump
```

The explicit BAT alias remains available for older developer instructions:

```powershell
bun run webapp:update-folder:bat:no-bump
```

Versioned publish:

```powershell
bun run webapp:update-folder
```

Linux portable folder builds:

```bash
bun run linux:update-folder:no-bump
bun run linux:update-folder
```

Default local output in the current Windows development scripts:

```text
../Apps/Umbra Studio/
```

## Runtime Paths

Portable builds keep runtime data in the stable application root:

```text
Umbra Studio/
```

Important runtime folders:

- `Tools`
- `User`

The clean repository keeps an empty `Tools/` folder and a placeholder-only
`User/` directory tree so developers can see the runtime layout immediately.
Installed tools, model weights, configuration, datasets, and generated media
remain untracked. The old top-level `Models/` path is not used; Umbra-owned
models live under `User/Models`, while ComfyUI owns `Tools/ComfyUI/models`.

Do not wipe the existing application root during publishing, updating, or
cleanup. It can contain model merges, generated outputs, installed tools, and
other runtime artifacts that are not recoverable from the source tree. Fresh
release jobs use an explicit temporary `Umbra Studio` package root; local
publishes preserve `User/` and `Tools/`.

Tools are intentionally **not** stored in `resources/app`.

## Documentation

- System and feature requirements: `REQUIREMENTS.md`
- Root distributable credits: `Credits.md`
- License: `LICENSE`
- Attribution notice for public forks / redistributed builds: `NOTICE`

Internal planning and agent notes are deliberately excluded from the public
source package. User-facing help is maintained inside Umbra Studio.

## Ownership

<img src=".github/assets/nocturne-labs-icon.png" alt="Nocturne Labs" width="180" />

Umbra Studio is owned and published by **Nocturne AI Labs** and developed by
**Minokai**. The canonical repository is
[Nocturne-Ai-Labs/Umbra-Studio](https://github.com/Nocturne-Ai-Labs/Umbra-Studio).

### MOSS Reference2IMG

Use the **IMG2IMG** workspace selector to choose **Reference2IMG**, select MOSS Image, import a reference and describe the new image. This conditions MOSS through Qwen3.5 vision while starting from an empty latent; it does not edit or preserve source pixels. Ordinary IMG2IMG remains available in the same selector.

Install **MOSS Image — Reference2IMG** in Umbra Setup and restart ComfyUI when ready. This optional extension reuses the MOSS Base/SFT diffusion model and FLUX2 VAE. Its Qwen3.5 encoder must contain working vision weights; some FP8 encoders need a compatible BF16, FP16 or INT8 alternative. Reference weight adjusts the input pixels before encoding; vision megapixels controls reference downsampling independently of output size. Both controls are saved in presets. Generation uses the shared queue, LoRA stack, sampling, detailer and output controls.
