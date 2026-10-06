# Umbra Studio Requirements

This guide separates what the portable app needs from what source development
and optional managed tools need. Umbra Studio is local-first: large generation
models, user media, installed tools, credentials, and runtime state stay outside
the Git repository.

## Supported Platforms

| Platform | Status | Notes |
| --- | --- | --- |
| Windows 10/11 x64 | Primary | Portable release includes Umbra's Bun runtime and launcher. |
| Linux x64 | Supported | Portable folder release includes Bun and a desktop entry. Distribution packages listed below may be required. |
| macOS | Not currently supported | Source code may build, but there is no qualified portable release flow. |

## Recommended Hardware

- 16 GB system RAM; 32 GB or more is recommended for large galleries, training,
  video workflows, or running several managed tools together.
- An NVIDIA GPU with current drivers is required for the currently supported
  generation and training path. VRAM requirements are determined by the selected
  ComfyUI model and workflow. Umbra does not override ComfyUI's model loading or
  VRAM policy.
- At least 15 GB free for the core app, managed runtimes, and caption helpers.
  Reserve 50 GB or more when installing ComfyUI, AI Toolkit, caption models, and
  generation checkpoints. A serious local model library can require far more.
- A modern Chromium- or Firefox-based browser with WebSocket, WebGL, and IndexedDB
  support.

## GPU Support

| Hardware | Current release status |
| --- | --- |
| NVIDIA GPU | Supported for Umbra's managed ComfyUI and AI Toolkit generation/training workflows. |
| AMD GPU | Not supported yet. The current portable runtime and managed-tool flow are not qualified for AMD acceleration. |
| Intel GPU | Not supported yet. The current portable runtime and managed-tool flow are not qualified for Intel acceleration. |
| CPU only | Suitable for Gallery and general file/dataset organization, but not a supported generation or training configuration. |

Umbra Studio is open source, and independent forks or contributions that add
reliable AMD or Intel support are welcome. Those platforms will remain
unsupported until their complete portable runtime and managed-tool workflows are
qualified and documented.

## Portable Release Requirements

Normal users should download a release package. They do not need a global Bun
or Python installation for Umbra itself.

Required:

- A 64-bit supported operating system.
- Git for installing and updating managed tools. On Windows, Setup downloads
  checksum-verified portable Git if it is missing; Linux requires distribution Git.
- Internet access for first-time tool, custom-node, runtime, and model downloads.
  ComfyUI uses managed Python 3.13, AI Toolkit uses managed Python 3.12, and
  Python Helpers use a separate Python 3.11 environment. A Python migration downloads dependencies again and
  needs space for both environments until the retained backup is removed.
- Compatible GPU drivers and user-supplied checkpoints, LoRAs, VAEs, text
  encoders, ControlNet models, upscale models, and video models.

Optional host requirements:

- Node.js 20 or newer for the current upstream AI Toolkit web UI build.
- Tailscale for Umbra Remote. Published builds expose remote access through the
  user's own private tailnet; Umbra does not ship a shared account or tunnel.
- Microsoft Visual C++ 2019 or newer runtime on Windows for CPU ONNX Runtime's
  native libraries.
- FFmpeg and ffprobe are bundled in portable Windows and Linux releases for
  video thumbnails and metadata; no global installation is required. Use **Umbra Setup >
  Tools > Install / repair media tools**
  to verify or repair the portable pair. Gallery also
  detects this installation's ComfyUI imageio FFmpeg. Linux repair requires
  `tar` and `xz-utils` or equivalent archive extraction tools.

The portable installer can bootstrap managed Python 3.11/3.12/3.13 runtimes and isolated
virtual environments. ComfyUI and AI Toolkit use their own tool-local virtual
environments; Data Forge Python helpers use `Runtime/PythonHelpers/venv`.
Portable releases additionally include `Runtime/PythonHelpers/bundled/<platform>`
with a CPU Python runtime and pinned pandas, NumPy, Pillow, ONNX Runtime,
Hugging Face Hub, safetensors and psutil. WD Tagger model weights are separate
downloads. GPU/PyTorch helpers continue using managed tool/helper environments.

## Linux Host Packages

Portable Linux releases require **glibc 2.35 or newer** (for example Ubuntu
22.04 or a compatible newer distribution). Bundled FFmpeg links its pinned
media libraries statically and uses only the host C/math/thread runtime.

On Debian or Ubuntu, install the common native prerequisites before setting up
managed Python tools:

```bash
sudo apt update
sudo apt install git curl ca-certificates python3-dev build-essential libgl1 libglib2.0-0
```

Equivalent packages may be used on other distributions. Some ComfyUI custom
nodes compile Python extensions, and OpenCV-backed tools require the GL runtime.
AI Toolkit additionally needs Node.js 20 or newer until its upstream UI stops
requiring a host Node installation.

## Feature Requirements

| Feature | Additional requirements |
| --- | --- |
| Gallery, Filmstrip, metadata, Local Servers | Core Umbra runtime; bundled FFmpeg/ffprobe for video thumbnails and metadata, verifiable and repairable through Setup. |
| Umbra UI | Managed ComfyUI install, the Umbra UI core support-model pack, compatible generation models, and the required custom nodes installed by Umbra. |
| Power Prompter | Same shared ComfyUI pipeline requirements as Umbra UI; user-created `.ppcards` files and generation models. |
| Data Forge board search | Internet connection. Danbooru can be used anonymously within its limits; Gelbooru, Rule34, and e621 may require account/API credentials for reliable access. Credentials are stored in the user's runtime config, never in source control. |
| WD Tagger captions | Pinned Data Forge model pack and Python helper environment. |
| Natural-language captions | Pinned Qwen2-VL 2B caption model, Python helper environment, and enough RAM/VRAM for the selected execution device. |
| AI Toolkit | Git, Node.js 20+, a managed Python environment, compatible GPU stack, and user-supplied training models. |
| Umbra Remote | Tailscale installed and signed in on the host and client; Tailscale Serve is recommended for HTTPS. |
| Video generation | ComfyUI, compatible video models/custom nodes, sufficient VRAM, and video encode/decode support. |

The default official H3 C-MMH3-26 and LTX C-LTX23-50 workflows have explicit
dependencies in `defaults/UmbraUI/tool-requirements.json`. Their reviewed baseline
is ComfyUI 0.38.0 with frontend 1.53.6 and DaSiWa 0.4.73, plus the declared
provider suites and frontend assets. Setup repairs these through
the existing managed installer after a dependency-plan review. Local conflicts,
busy runtimes and unverified shutdowns hold the repair; generation models remain
a separate user selection/setup step.

Triton is required only when the native LTX API graph contains the active
TritonVAE branch. Capture and queue compilation check module availability in that
selected runtime's local Python environment. A missing or unverified module holds
the job; finding the module does not establish Torch/GPU compatibility. H3 and an
inactive LTX TritonVAE branch do not require this probe. Native frontend export,
installed model compatibility and real GPU output remain separate qualification
checks. See [the official video walkthrough](README.md#official-h3-and-ltx-video-workflows).

## Data Forge Model Pack

The pinned caption pack is defined in
`defaults/DataForge/model-manifest.json` and currently includes:

- `SmilingWolf/wd-vit-tagger-v3`
- `SmilingWolf/wd-convnext-tagger-v3`
- `SmilingWolf/wd-eva02-large-tagger-v3`
- `SmilingWolf/wd-swinv2-tagger-v3`
- `prithivMLmods/Qwen2-VL-2B-Abliterated-Caption-it`

The complete pack is more than 6 GB. GitHub core release packages include a
checksum-verifying downloader instead of embedding the weights in the main
archive.

## Umbra UI Support Model Pack

The support-model bill of materials is defined in
`defaults/UmbraUI/model-manifest.json`.

The automatic `core` profile is approximately 566 MB and contains:

- Bingsu face, hand, and person detailer detector/segmentation weights
- Segment Anything ViT-B for mask refinement
- Real-ESRGAN x4plus for a permissively licensed general upscale default
- RIFE 4.26 for optional frame interpolation

Guided Setup installs this profile in its separate support-model stage. Portable packages
include **Umbra Setup > Models > Pipeline support** for repair or manual installation.

The optional `reference` profile adds the SDXL IP-Adapter ViT-H model and its
CLIP Vision encoder. It is kept separate because it is roughly 3 GB. The
manifest also documents models that must remain manual because their original
terms are source-specific or non-commercial.

The optional Eyes detailer is a manual download from
[Eyes Detection (ADetailer) on CivitAI](https://civitai.com/models/150925/eyes-detection-adetailer).
Setup provides this link under **Models > Pipeline support**. Review the original
model terms and save `Eyes.pt` in `Tools/ComfyUI/models/ultralytics/bbox/`.
Umbra does not bundle or automatically download the eye model. Eyes remains
disabled by default; enable it after installing the model yourself.

These support files do not include generation checkpoints, LoRAs, VAEs, text
encoders, ControlNet weights, or video diffusion models. Users choose those
according to the model families and hardware they intend to run.

ComfyUI and AI Toolkit installation and updates are managed in **Umbra Setup >
Tools**. Open Setup from either tool's main-app panel, or run `UmbraSetup.bat`
on Windows / `./umbra-setup.sh` on Linux. This includes CUDA/PyTorch updates,
ComfyUI custom nodes, SageAttention and ComfyUI version switching. Stop the
corresponding tool before maintenance and follow the progress and installer log
in Setup. Launch, stop and connection checks remain in Umbra Studio.

Umbra Setup also owns application updates under **Updates**. Guided setup starts
with language, then ComfyUI, optional AI Toolkit, nodes, support models, generation
resources and verification. Skipping AI Toolkit does not block generation setup.
Readiness checks verify installation and model integrity without generating an image.

## Source Development

Portable packaging builds FFmpeg from the six checksum-pinned source archives in
`defaults/MediaTools/source-build-manifest.json`. Linux builders need a C/C++
compiler, Make, NASM, CMake, pkg-config, Python 3, Meson and Ninja. Windows
builders use native MSYS2 UCRT64 GCC/CMake/pkgconf/Python/Meson/Ninja plus MSYS
Make, NASM, tar, diffutils and Perl. The exact native setup and invocation are
checked into `.github/workflows/release.yml` and
`scripts/build-media-from-source.sh`. Build into fresh output/work folders and
set `UMBRA_MEDIA_SOURCE_BUILD` to that output before running the portable
packager. Application users receive the compiled tools and complete sources;
these compilation prerequisites apply to source/package builders.

Required:

- [Bun](https://bun.sh/) 1.3 or newer
- [Git](https://git-scm.com/)
- The platform requirements above for any managed tools being exercised

Install and run:

```bash
bun install --frozen-lockfile
bun run dev:fullstack
```

Umbra serves the application at `http://127.0.0.1:8212`. The managed defaults
also use `127.0.0.1:8188` for ComfyUI, `127.0.0.1:8313` for the Gallery bridge,
`127.0.0.1:8675` for AI Toolkit, and default local port `127.0.0.1:8214` for the unified Setup app.
In-app maintenance shortcuts can allocate a free Setup port. These ports must be available or explicitly
reconfigured where the corresponding tool supports it.

## Managed Tools and Upstream Links

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- [Umbra Nodes](https://github.com/Nocturne-Ai-Labs/Umbra-Nodes)
- [AI Toolkit](https://github.com/ostris/ai-toolkit)
- [Tailscale](https://tailscale.com/)
- [SageAttention](https://github.com/thu-ml/SageAttention)
- [Data Forge model manifest](defaults/DataForge/model-manifest.json)
- [Umbra UI support-model manifest](defaults/UmbraUI/model-manifest.json)
- [Complete third-party credits](Credits.md)

Managed custom nodes follow their latest upstream default branches when Umbra
installs or updates them. Model artifacts in the two manifests above use fixed
revisions and checksums because those are distributable runtime inputs, not
source repositories.

Models and upstream tools retain their own licenses and hardware requirements.
Review those projects before redistribution or commercial deployment.
