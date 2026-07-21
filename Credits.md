# Credits

Umbra Studio is original application software owned and published by Nocturne AI Labs,
developed by Minokai, and it
interoperates with a number of important open-source projects and upstream tool
ecosystems.

This file is the distributable credits document intended to live at the root of
source checkouts and published builds.

## Umbra Studio

- Product: Umbra Studio
- Owner / publisher: Nocturne AI Labs
- Developer: Minokai
- Repository: https://github.com/Nocturne-Ai-Labs/Umbra-Studio

## About This Project

Umbra Studio is a desktop-first AI art and workflow application built to unify
generation backends, prompt tooling, media browsing, metadata handling, model
management, and portable tool orchestration inside one app-managed environment.

The project was made to reduce the friction that comes from juggling multiple
separate tools, disconnected output folders, fragile portable installs, and
manual metadata/model organization. Umbra Studio exists to make those workflows
faster, more portable, and easier to manage for creators doing real production
work.

## Runtime Architecture

Umbra Studio is not just a static desktop UI. It is an app-managed runtime made
up of coordinated frontend and backend services.

- Main app runtime:
  - Umbra's primary Bun backend handles app routes, settings, tool management,
    metadata/model services, filesystem actions, and app-level coordination
- App communication:
  - Umbra uses HTTP endpoints for request/response actions across the app
  - Umbra also uses WebSocket connections for live systems such as queue state,
    logs, backend status, and runtime-aware workspace behavior
  - The strongest live queue/runtime WebSocket integration is centered on
    ComfyUI, which is what gives Power Prompter its deepest real-time
    orchestration compatibility
- Cross-service behavior:
  - The app's internal services communicate through managed local endpoints and
    controlled local networking instead of exposing a broad open network surface
- CORS / security intent:
  - Umbra is designed around explicit local app/service communication and
    controlled origin handling rather than permissive wildcard CORS behavior
  - This is important because Umbra coordinates multiple tool runtimes and local
    services that should work together without being opened up loosely to
    arbitrary external origins

### Split Gallery Service

- What it is:
  - The Gallery runs as its own split Bun service rather than being fully
    executed inside the main app runtime
- Why it exists:
  - Gallery browsing, thumbnail work, media loading, and large-folder traversal
    are performance-heavy workloads
  - Splitting Gallery into its own Bun runtime keeps that work from dragging
    down the main app runtime and helps protect the responsiveness of the rest
    of Umbra
- Why it mattered:
  - This separation made it possible for Gallery and Filmstrip behavior to stay
    fast while Umbra continued handling prompt tools, tool management, and other
    app systems
  - It also gave the Gallery a cleaner service boundary for filesystem/media
    work and made it easier to treat Umbra as the glue layer across multiple
    connected runtimes

## Core Integrated Tools

### ComfyUI
- Project: https://github.com/comfyanonymous/ComfyUI
- Usage in Umbra Studio:
  - Primary workflow-based generation backend
  - Hosts Umbra-managed custom nodes and optional third-party node suites

### AI-Toolkit
- Project: https://github.com/ostris/ai-toolkit
- Creator / maintainer: Ostris, LLC and contributors
- License: MIT
- Usage in Umbra Studio:
  - Optional training and model-tooling workspace managed from Data Forge
  - Umbra manages install, update, launch, and a dedicated Python virtual environment
  - Data Forge datasets are exposed to AI-Toolkit, while trained outputs can be moved into ComfyUI through Model Manager

## Umbra Original Systems

These are Umbra Studio systems designed and implemented as original Umbra
application features around the integrated upstream tools.

### Gallery
- What it is:
  - Umbra's media library, browser, viewer, and organization layer for generated images, gifs, and videos
- What it is used for:
  - Fast folder browsing across managed output roots
  - Thumbnail grids, media viewing, tagging, metadata access, trash workflows, and custom ordering
  - Helping organize generated outputs into a manageable working library instead of leaving them as scattered folders and loose files
  - Connecting generated outputs back into the wider Umbra workflow
- Technical role in Umbra:
  - Acts as the app's media organization and review surface
  - Designed to emphasize performance, browsing speed, and creator-focused file management
  - Uses a split-service, virtualization, and cache-aware media pipeline so it can stay responsive under heavier thumbnail, scrolling, media, and selection workloads

### Filmstrip
- What it is:
  - Umbra's persistent bottom media strip tied to the active gallery/media context
- What it is used for:
  - Quick navigation through the current folder or pinned folders
  - Fast selection, review, and media context continuity across the app
- Technical role in Umbra:
  - Keeps current media context available while moving between workspaces
  - Mirrors gallery selection and viewing state for faster workflow iteration
  - Is not just a simple image feed; it behaves like a compact gallery frontend that can stay usable across the UI
  - Uses the same performance-first philosophy as Gallery because it needs to remain interactive, selection-aware, and media-aware while the rest of the app is still active

### App Bar and Workspace Popouts
- What it is:
  - Umbra's navigation, workspace switching, and popout-launch control layer
- What it is used for:
  - Moving between tools and workspaces quickly
  - Popping supported workspaces into separate windows so multiple parts of the Umbra workflow can be used at the same time across different monitors
- Technical role in Umbra:
  - Helps Umbra act as the glue between multiple generation, browsing, prompt, and management surfaces instead of forcing everything into a single fixed window
  - Supports multi-panel and multi-monitor working styles for real production workflows

### Power Prompter
- What it is:
  - Umbra's prompt construction, queue orchestration, and set/variant management system
- What it is used for:
  - Building prompt chains, variants, queue sets, and tracked generation batches
  - Managing prompt reuse, diversity, cycle counts, recent outputs, and queue grouping
  - Turning prompt work into a controllable production workflow instead of a one-off text box
- Technical role in Umbra:
  - Uses Umbra-managed bridge and websocket communication to stay connected to generation/runtime state
  - Coordinates prompt planning with live queue tracking rather than acting as a static text editor
  - Serves as one of Umbra's most powerful original systems because it combines prompt authoring, queue planning, grouped execution, recent-output awareness, runtime coordination, and batch-management behavior into one workflow surface
  - Was built to make large prompt-set iteration, controlled variation, and tracked batch generation practical inside a single app workflow rather than forcing users to manage that process manually

### Umbra UI
- What it is:
  - Umbra's model-aware generation workspace built over the managed ComfyUI backend
- What it is used for:
  - Text-to-image, image-to-image, inpainting, video generation, and extras/upscale workflows
  - Shared generation controls, model-family capability validation, LoRA stacks, hires processing, optional detailer stages, and output handoff between Umbra workspaces
- Technical role in Umbra:
  - Uses Umbra's shared pipeline definitions and compiler so the same model-family behavior can power Umbra UI and Power Prompter without requiring users to author API workflow JSON
  - Compiles only compatible stages for the selected model family and bypasses disabled processing stages
  - Uses ComfyUI-Inpaint-CropAndStitch for region-focused inpaint crop/stitch behavior and Impact Pack/Impact Subpack capabilities for detector, mask, and detailer stages where those stages are enabled

### Why Power Prompter Is Centered On ComfyUI
- Power Prompter works best with ComfyUI because its deepest features depend on Umbra's stronger live queue/runtime bridge and websocket compatibility with ComfyUI
- That compatibility makes it possible to track queue groups, active jobs, prompt-set progress, recent outputs, and runtime feedback in a tighter loop
- In practice, Power Prompter is most powerful when paired with ComfyUI because ComfyUI gives Umbra the richer control and feedback model needed for that level of orchestration

### Power Prompter WebSocket / Queue Bridge
- What it is:
  - Umbra's live runtime communication layer between prompt tooling, queue tracking, and generation backends
- What it is used for:
  - Sending queue/control actions
  - Tracking active jobs, grouped queues, and prompt-set progress
  - Triggering recent-output refreshes and runtime-aware UX updates
- Technical role in Umbra:
  - Lets Power Prompter behave like an active orchestration layer instead of just a prompt-writing interface

### Metadata Scanner
- What it is:
  - Umbra's metadata parsing, prompt recovery, and tag extraction system
- What it is used for:
  - Reading generation metadata from images
  - Supporting tag workflows, metadata previews, prompt recovery, and scanner integrations
- Technical role in Umbra:
  - Bridges generated media back into searchable, reusable workflow data

### Model Manager
- What it is:
  - Umbra's local-and-remote model browsing, snapshotting, and transfer system
- What it is used for:
  - Organizing local models
  - Importing and snapshotting CivitAI model metadata
  - Moving staged models into the appropriate runtime tool roots
- Technical role in Umbra:
  - Treats model information as part of the working pipeline, not just loose files on disk
  - Uses direct model links instead of trying to mirror or live-search all of CivitAI inside Umbra, because CivitAI's available models, metadata, and API-facing surface can change frequently and become expensive or unstable to mirror fully in-app
  - Stores imported model information in Umbra's local database and caches related media locally so model pages remain usable as stable local snapshots even if upstream pages change, disappear, or become harder to find later

### Data Forge
- What it is:
  - Umbra's image-board browsing and dataset creation workflow surface
- What it is used for:
  - Searching, reviewing, and collecting board-sourced reference material and dataset candidates
  - Pulling images and tags from supported sources such as Gelbooru, Danbooru, Rule34, and e621
  - Creating datasets that are preconfigured to be usable more directly with AI-Toolkit workflows
- Technical role in Umbra:
  - Reworks imageboard-oriented browsing into Umbra's own workflow and library ecosystem
  - Turns board scraping/browsing into a more structured dataset pipeline instead of leaving that work as a manual copy-and-sort process

## Umbra Node / Runtime Integration

### Umbra-Nodes
- Path:
  - `Umbra-Nodes/`
  - `Tools/ComfyUI/custom_nodes/Umbra-Nodes/`
- Usage in Umbra Studio:
  - Umbra metadata save nodes
  - Umbra Power Prompter reader integration
  - Umbra-specific workflow/runtime bridging for ComfyUI

### VideoHelperSuite Attribution
- Upstream project: https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
- Creator / maintainer: Kosinkadink
- Usage in Umbra Studio:
  - Umbra's video combine wrapper builds on upstream VideoHelperSuite behavior

## Tagging / Metadata Inspiration

### WD Tagger / SmilingWolf
- Reference project: https://github.com/toriato/stable-diffusion-webui-wd14-tagger
- Original reference maintainer: toriato
- Model publisher / related work: https://huggingface.co/SmilingWolf
- Model / tagging research publisher: SmilingWolf
- Usage in Umbra Studio:
  - Local ONNX tagging in Data Forge for rating, character, and general booru-style tags

## Packaged Data Forge Caption Models

The following model definitions are pinned in
`defaults/DataForge/model-manifest.json`. Local portable builds bundle them;
GitHub core packages install the same revisions with checksum verification.

### SmilingWolf WD Tagger v3
- Publisher: https://huggingface.co/SmilingWolf
- License: Apache-2.0
- Models:
  - `SmilingWolf/wd-vit-tagger-v3`
  - `SmilingWolf/wd-convnext-tagger-v3`
  - `SmilingWolf/wd-eva02-large-tagger-v3`
  - `SmilingWolf/wd-swinv2-tagger-v3`
- Usage in Umbra Studio:
  - Structured dataset tagging with user-controlled thresholds and tag-category filtering

### Qwen2-VL 2B Abliterated Caption
- Model: https://huggingface.co/prithivMLmods/Qwen2-VL-2B-Abliterated-Caption-it
- Publisher: prithivMLmods
- Base architecture: Qwen2-VL
- License: Apache-2.0
- Usage in Umbra Studio:
  - Detailed natural-language dataset captions, including uncensored captioning workflows

## Model Sources

### CivitAI
- Project: https://civitai.com
- Usage in Umbra Studio:
  - Model metadata import, snapshotting, and download-oriented model management flows

## Feature Inspiration

### Imageboard-Grabber
- Project: https://github.com/Bionus/imgbrd-grabber
- Creator / maintainer: Bionus
- Usage in Umbra Studio:
  - Major inspiration and reference source for the Data Forge feature
  - Influenced parts of Umbra's board/image browsing workflow design and supporting behavior
  - Umbra Studio reworked that inspiration into its own app architecture and UI

## Default Installed Custom Nodes

These are the ComfyUI custom-node repositories Umbra Studio installs by default
through its managed setup flow.

### ComfyUI-Manager
- Project: https://github.com/ltdrdata/ComfyUI-Manager
- Creator / maintainer: ltdrdata
- Original project purpose:
  - Package installation, updates, and environment management for ComfyUI custom nodes

### comfyui-tooling-nodes
- Project: https://github.com/Acly/comfyui-tooling-nodes
- Creator / maintainer: Acly and contributors
- Original project purpose:
  - Bridge and workflow tooling used by external image editor integrations

### comfyui-inpaint-nodes
- Project: https://github.com/Acly/comfyui-inpaint-nodes
- Creator / maintainer: Acly and contributors
- Original project purpose:
  - Inpainting, masking, and generative fill workflow nodes

### comfyui_controlnet_aux
- Project: https://github.com/Fannovel16/comfyui_controlnet_aux
- Creator / maintainer: Fannovel16 and contributors
- Original project purpose:
  - ControlNet preprocessors and supporting image-control nodes

### ComfyUI-Inpaint-CropAndStitch
- Project: https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch
- Creator / maintainer: lquesada
- Original project purpose:
  - Region-focused inpaint crop/stitch workflow support for ComfyUI pipelines

### ComfyUI_JPS-Nodes
- Project: https://github.com/JPS-GER/ComfyUI_JPS-Nodes
- Creator / maintainer: JPS-GER
- Original project purpose:
  - Image-processing and workflow utility nodes for ComfyUI

### ComfyUI_ComfyRoll_CustomNodes
- Project: https://github.com/Suzie1/ComfyUI_ComfyRoll_CustomNodes
- Creator / maintainer: Suzie1
- Original project purpose:
  - Batch, layout, aspect-ratio, and utility workflow nodes for ComfyUI

### ComfyUI-Inspire-Pack
- Project: https://github.com/ltdrdata/ComfyUI-Inspire-Pack
- Creator / maintainer: ltdrdata
- Original project purpose:
  - Advanced prompt and workflow utility nodes for ComfyUI

### ComfyUI-Impact-Pack
- Project: https://github.com/ltdrdata/ComfyUI-Impact-Pack
- Creator / maintainer: ltdrdata
- Original project purpose:
  - Detailer, mask, conditioning, and enhancement tooling for ComfyUI

### ComfyUI-Impact-Subpack
- Project: https://github.com/ltdrdata/ComfyUI-Impact-Subpack
- Creator / maintainer: ltdrdata
- Original project purpose:
  - Supplemental nodes extending Impact Pack workflows

### ComfyUI_UltimateSDUpscale
- Project: https://github.com/ssitu/ComfyUI_UltimateSDUpscale
- Creator / maintainer: ssitu and contributors
- Original project purpose:
  - Tiled diffusion upscaling workflows

### NVIDIA RTX Nodes for ComfyUI
- Project: https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI
- Creator / maintainer: Comfy Org, NVIDIA, and contributors
- Original project purpose:
  - Optional NVIDIA RTX video super-resolution support

### was-node-suite-comfyui
- Project: https://github.com/WASasquatch/was-node-suite-comfyui
- Creator / maintainer: WASasquatch
- Original project purpose:
  - Broad workflow helper and utility-node suite for ComfyUI

### ComfyUI-Custom-Scripts
- Project: https://github.com/pythongosssss/ComfyUI-Custom-Scripts
- Creator / maintainer: pythongosssss
- Original project purpose:
  - Frontend and workflow UX enhancements for ComfyUI

## Frontend / Runtime Stack

- Bun: https://bun.sh
- React: https://react.dev
- Preact: https://preactjs.com
- React Router: https://reactrouter.com
- Tailwind CSS: https://tailwindcss.com
- Framer Motion: https://motion.dev
- Headless UI: https://headlessui.com
- Lucide: https://lucide.dev
- TanStack Virtual: https://tanstack.com/virtual
- React Virtuoso: https://virtuoso.dev
- dnd kit: https://dndkit.com
- Zustand: https://zustand.docs.pmnd.rs
- JSZip: https://stuk.github.io/jszip
- ag-psd: https://github.com/Agamnentzar/ag-psd
- QRCode: https://github.com/soldair/node-qrcode
- Chokidar: https://github.com/paulmillr/chokidar
- Sharp: https://sharp.pixelplumbing.com
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3

## Optional Runtime Integrations

### Tailscale
- Project: https://tailscale.com
- Usage in Umbra Studio:
  - Private tailnet transport and Tailscale Serve HTTPS for Umbra Remote
  - Users connect through their own Tailscale account; Umbra does not provide a shared tunnel

### SageAttention
- Project: https://github.com/thu-ml/SageAttention
- Usage in Umbra Studio:
  - Optional attention backend installed into the managed ComfyUI environment

### FFmpeg
- Project: https://ffmpeg.org
- Usage in Umbra Studio:
  - Optional system media decoder used for broad video thumbnail and metadata compatibility

## Additional Attribution

Some Umbra Studio features also interoperate with optional third-party ComfyUI
custom-node repositories and other upstream tools installed by the user.

The managed-tool and model links above mirror the public setup scripts and the
pinned Data Forge model manifest included in this repository.

## Repository Demonstration Media

The PG-safe red-jacket character artwork in
`.github/assets/umbra-ui-tour-inpaint-source.png` was created specifically for
the Umbra Studio interface tour. It is demonstration media owned by the project
and is not a user Gallery image or a bundled generation model output.

## Licenses

Umbra Studio is distributed under the MIT License, which keeps the project open
to use, modification, forking, and redistribution while requiring preservation
of the original copyright and license notice.

Umbra Studio also includes a `NOTICE` file that makes the attribution intent
clear for public forks and redistributed modified builds: credit Nocturne AI Labs
as the project owner and Minokai as the original developer, and link back to the Umbra Studio GitHub
repository when redistributing a public fork.

All upstream tools, libraries, and repositories remain licensed by their
respective authors.

Please review each upstream project directly for full license text, terms, and
obligations.
