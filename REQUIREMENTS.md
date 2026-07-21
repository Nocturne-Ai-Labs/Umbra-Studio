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
- An NVIDIA GPU with current drivers is the best-supported generation and
  training path. VRAM requirements are determined by the selected ComfyUI model
  and workflow. Umbra does not override ComfyUI's model loading or VRAM policy.
- At least 15 GB free for the core app, managed runtimes, and caption helpers.
  Reserve 50 GB or more when installing ComfyUI, AI Toolkit, caption models, and
  generation checkpoints. A serious local model library can require far more.
- A modern Chromium- or Firefox-based browser with WebSocket, WebGL, and IndexedDB
  support.

CPU-only use is suitable for Gallery and general file/dataset organization.
Generation, natural-language captioning, and training may technically run on
other hardware supported by their upstream tools, but those paths are not the
primary qualified configuration.

## Portable Release Requirements

Normal users should download a release package. They do not need a global Bun
or Python installation for Umbra itself.

Required:

- A 64-bit supported operating system.
- Git for installing and updating managed tools such as ComfyUI and AI Toolkit.
- Internet access for first-time tool, custom-node, runtime, and model downloads.
- Compatible GPU drivers and user-supplied checkpoints, LoRAs, VAEs, text
  encoders, ControlNet models, upscale models, and video models.

Optional host requirements:

- Node.js 20 or newer for the current upstream AI Toolkit web UI build.
- Tailscale for Umbra Remote. Published builds expose remote access through the
  user's own private tailnet; Umbra does not ship a shared account or tunnel.
- FFmpeg available on `PATH` for the widest video thumbnail and media handling
  compatibility when an installed generation tool does not provide it.

The portable installer can bootstrap managed Python 3.11 runtimes and isolated
virtual environments. ComfyUI and AI Toolkit use their own tool-local virtual
environments; Data Forge Python helpers use `Runtime/PythonHelpers/venv`.

## Linux Host Packages

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
| Gallery, Filmstrip, metadata, Local Servers | Core Umbra runtime; FFmpeg recommended for broad video thumbnail support. |
| Umbra UI | Managed ComfyUI install, compatible generation models, and the required custom nodes installed by Umbra. |
| Power Prompter | Same shared ComfyUI pipeline requirements as Umbra UI; user-created `.ppcards` files and generation models. |
| Data Forge board search | Internet connection. Danbooru can be used anonymously within its limits; Gelbooru, Rule34, and e621 may require account/API credentials for reliable access. Credentials are stored in the user's runtime config, never in source control. |
| WD Tagger captions | Pinned Data Forge model pack and Python helper environment. |
| Natural-language captions | Pinned Qwen2-VL 2B caption model, Python helper environment, and enough RAM/VRAM for the selected execution device. |
| AI Toolkit | Git, Node.js 20+, a managed Python environment, compatible GPU stack, and user-supplied training models. |
| Umbra Remote | Tailscale installed and signed in on the host and client; Tailscale Serve is recommended for HTTPS. |
| Video generation | ComfyUI, compatible video models/custom nodes, sufficient VRAM, and video encode/decode support. |

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

## Source Development

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
and `127.0.0.1:8675` for AI Toolkit. These ports must be available or explicitly
reconfigured.

## Managed Tools and Upstream Links

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- [Umbra Nodes](https://github.com/Minokai69/umbra-nodes)
- [AI Toolkit](https://github.com/ostris/ai-toolkit)
- [Tailscale](https://tailscale.com/)
- [SageAttention](https://github.com/thu-ml/SageAttention)
- [Data Forge model manifest](defaults/DataForge/model-manifest.json)
- [Complete third-party credits](Credits.md)

Models and upstream tools retain their own licenses and hardware requirements.
Review those projects before redistribution or commercial deployment.
