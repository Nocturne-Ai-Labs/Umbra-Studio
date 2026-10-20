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

- Node.js 20 or newer with npm for the current upstream AI Toolkit web UI build.
  On Windows, Setup and launch rediscover newly installed Node from the current
  registered PATH; retry the action without restarting Umbra.
- Tailscale for Umbra Remote. Published builds expose remote access through the
  user's own private tailnet; Umbra does not ship a shared account or tunnel.
- Microsoft Visual C++ 2019 or newer runtime on Windows for CPU ONNX Runtime's
  native libraries.
- FFmpeg and ffprobe are bundled in portable Windows and Linux releases for
  video thumbnails and metadata; no global installation is required. Use **Umbra Setup >
  Advanced > Tools > Install / repair media tools**
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

The default official H3 C-MMH3-32 and LTX C-LTX23-50 workflows have explicit
dependencies in `defaults/UmbraUI/tool-requirements.json`. Their reviewed baseline
is ComfyUI 0.38.0 with frontend 1.53.6 and DaSiWa 0.5.16, plus the declared
provider suites and frontend assets. Setup repairs these through
the existing managed installer after a dependency-plan review. Local conflicts,
busy runtimes and unverified shutdowns hold the repair; generation models remain
a separate user selection/setup step.

H3 C-MMH3-32 uses DaSiWa Enhanced Upscale and optional RTX frame generation.
Learned latent upscaling can use the optional **MiniMax H3 Latent Upscaler**
selection in Setup's generation prerequisites (about 691 MB); interpolation
does not need that model. RTX features require supported NVIDIA hardware and
the corresponding SDK capabilities. Existing H3 captures must be recreated
against C-MMH3-32; LTX-50 keeps its previous source revision.

Longshot Studio is opt-in. Its Setup bundle installs `Longshot_Studio`,
`H3_Longshot`, and `H3_Prompt_Compiler` from their upstream repositories.
After installation, normal custom-node updates also include this bundle.
Restart ComfyUI to load the interface and nodes. Missing components are reported
in the Video tab; the iframe uses Umbra's configured ComfyUI connection.

Triton is required only when the native LTX API graph contains the active
TritonVAE branch. Capture and queue compilation check module availability in that
selected runtime's local Python environment. A missing or unverified module holds
the job; finding the module does not establish Torch/GPU compatibility. H3 and an
inactive LTX TritonVAE branch do not require this probe. Native frontend export,
installed model compatibility and real GPU output remain separate qualification
checks. See [the official video walkthrough](README.md#official-h3-and-ltx-video-workflows).

## MOSS Image

Choose **MOSS Image SFT** or **MOSS Image Base** in Umbra Setup's generation prerequisites, then install the selected family's managed dependencies. MOSS needs native ComfyUI commit `e087d8f6cb7c6cdb11b59dc7c9bf17c79f8d877d` or later; a version number alone does not identify this support. Restart ComfyUI after updating.

- Both checkpoints use the **MOSS Image** family for text-to-image, image-to-image, Manga panel generation, inpainting and Canvas masked generation. MOSS's Edit mode provides layout composition; it is not a dedicated instruction-edit checkpoint.
- **Prompt enhancer** is an optional MOSS control shared by Umbra UI, Power Prompter, inpainting, Canvas/Edit, Manga and Remote. It uses the existing MOSS text encoder locally, with no extra model download or cloud token. Update ComfyUI through Setup and restart it through Umbra to install the bundled `UmbraMossPromptEnhancer` node; native `TextGenerate` must also be available. Existing presets default to enhancement off.
- **Negative-branch skip** exposes the existing native layer-22 skip, enabled by default. **Extra guidance** optionally adds `SkipLayerGuidanceDiT`; it is experimental, costs another model evaluation during its active interval, and is off by default. These controls sit above detailers with flow shift and persist in presets/projects.
- **Spectrum acceleration** is an experimental, default-off native MOSS option. Install **MOSS Spectrum acceleration** in Setup's custom-node prerequisites, then restart ComfyUI when ready. It downloads [Rkkss/ComfyUI-Spectrum-MOSS](https://github.com/Rkkss/ComfyUI-Spectrum-MOSS), reviewed at `3fde0674b29342565e7f42a0674af48d65aabc4a`, directly from upstream; no extra weights or Turbo LoRA are required. Forecasting may affect detail, memory use and reproducibility; speed varies by workload. GPU or CPU cache placement is selectable. Disabling Spectrum removes its model patch and dependency from the submitted graph.
- Enhancement happens after prompt expansion and LoRA parsing. The generated caption feeds conditioning and saved prompt metadata. Structured prompts retain their item labels, exact text fields, metadata and bounding boxes; only caption strings are enhanced. Turn enhancement off to use the exact original prompt. Caption processing follows the [official MOSS prompt-enhancer guidance](https://github.com/OpenMOSS/MOSS-Image/tree/main/skills/moss-image-prompt-enhancer); Umbra supplies the structure-preserving wrapper.
- Setup installs official INT8 model weights, the Qwen3.5-9B W4A8 encoder and the shared FLUX.2 VAE. Existing verified VAE files are reused. Model binaries are not bundled in Umbra releases.
- Default sampling is 50 steps, CFG 3, Euler / sgm_uniform, flow shift 5 and negative-branch layer skipping at layer 22. Negative prompts remain editable. Generation dimensions align to 16 pixels, with no model-specific resolution cap.
- Setup applies the reviewed Umbra node compatibility patch for VAE-aware hires sizing. Re-run the MOSS managed dependency repair on existing installations before using hires fix, then restart ComfyUI.
- Model files belong in `Tools/ComfyUI/models/diffusion_models/`, the encoder in `text_encoders/`, and `flux2-vae.safetensors` in `vae/`. Manually downloaded compatible Base/SFT weights can use the same pipeline.

See the [OpenMOSS guide](https://github.com/OpenMOSS/MOSS-Image/blob/main/USERGUIDE.md) and [Comfy Org weights](https://huggingface.co/Comfy-Org/MOSS-Image) for upstream recommendations and licenses.

## Iris 3B And Official Turbo

Choose **Iris 3B** or **Iris 3B Turbo** in **Umbra Setup > Advanced > Models > Generation prerequisites**. The guided node stage installs the pinned `ComfyUI-Iris` integration for selected Iris profiles; existing installations can repair it through Setup's managed dependencies. Restart ComfyUI after installing nodes. ComfyUI 0.37.0+ and Comfy Kitchen 0.2.35+ are required.

- Base: the original 11.95 GB checkpoint and shared 8.88 GB Qwen3-VL text encoder, about 19.40 GiB together.
- Turbo: the official 5.98 GB distilled checkpoint and the same encoder, about 13.83 GiB together. Selecting both reuses the encoder. This is a full checkpoint, not the community Turbo LoRA.
- Iris generates RGB pixels directly and needs no VAE. Its pipelines support text-to-image, pixel-space image-to-image, shared output upscaling and compatible native LoRAs. Manga Studio uses these same pipelines and your chosen panel resolution.
- Base defaults to 100 steps, CFG 3 and DPM++ 2M with the native Iris schedule. Official Turbo uses the released four-step deterministic Euler schedule; CFG and negative prompts are not adjustable because guidance is distilled into the weights.
- These pixel pipelines do not expose the existing latent hires-fix, classic detailer or tiled-VAE stages, and do not advertise an Iris inpainting pipeline. Turbo image-to-image uses the native sampler's partial-schedule behavior and is experimental.

The Iris checkpoints are Apache-2.0. The separately downloaded shared encoder retains the terms shown in its Setup catalog entry. Models are not included in portable release archives.

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
include **Umbra Setup > Advanced > Models > Pipeline support** for repair or manual installation.

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
Advanced > Tools**. Open Setup from either tool's main-app panel, or run `UmbraSetup.bat`
on Windows / `./umbra-setup.sh` on Linux. This includes CUDA/PyTorch updates,
ComfyUI custom nodes, SageAttention and ComfyUI version switching. Stop the
corresponding tool before maintenance and follow the progress and installer log
in Setup. Launch, stop and connection checks remain in Umbra Studio.

Optional SageAttention uses a checksum-pinned upstream Windows ABI3 wheel for
reviewed x64 combinations: Python 3.10–3.14, PyTorch 2.10–2.14 and CUDA 12.8 or
13.0. Other combinations use the pinned source build and require a compatible
C++ compiler and CUDA development toolkit. Linux builds require those native
tools; Setup selects an available compiler and supplies C++20 for PyTorch 2.14
headers. It retains the installed PyTorch stack. Linux AI Toolkit installation
also verifies its native SQLite addon and rebuilds that exact addon when its
prebuilt binary requires a newer glibc than the host supplies.

Umbra Setup also owns application updates under **Updates**. Guided setup starts
with language, then ComfyUI, optional AI Toolkit, nodes, support models, generation
resources and verification. The desktop wizard shows one step at a time; individual
repairs and extra model packs are under **Advanced**. Skipping AI Toolkit does not block generation setup.
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
