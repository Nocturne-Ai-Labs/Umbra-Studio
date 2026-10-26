# Supported Models And Workflows

This matrix describes the pipelines bundled with **Umbra Studio 0.91.0**. It is
an integration inventory, not a claim that every checkpoint or optional control
has been generation-qualified. Install the matching weights, encoders, VAEs and
nodes through **Umbra Setup** before using a pipeline. See [Requirements](REQUIREMENTS.md) and [release notes](CHANGELOG.md).

## Image Pipelines

**Yes** means the shipped workflow declares that capability. **—** means no
dedicated bundled pipeline is declared; it does not imply a future integration.
Inpaint includes native model-specific adapters and is separate from support for
the instruction-edit workspace.

| Model family | TXT2IMG | IMG2IMG | Inpaint | Reference2IMG |
| --- | :---: | :---: | :---: | :---: |
| Anima | Yes | Yes | Yes | — |
| Anima 2.9B | Yes | Yes | Yes | — |
| Anima 3.8B | Yes | Yes | Yes | — |
| Chroma 1 | Yes | Yes | — | — |
| ERNIE Image | Yes | Yes | — | — |
| FLUX.1 | Yes | Yes | Yes | — |
| FLUX.2 | Yes | — | — | — |
| FLUX.2 Edit | — | — | Yes | — |
| FLUX.3 | Yes | Yes | Yes | — |
| HiDream O1 | Yes | Yes | Yes | — |
| Ideogram 4 | Yes | — | — | — |
| Illustrious XL | Yes | Yes | Yes | — |
| Iris 3B | Yes | Yes | — | — |
| Iris 3B Turbo | Yes | Yes | — | — |
| Krea 2 | Yes | Yes | Yes | — |
| MOSS Image | Yes | Yes | Yes | Yes |
| NoobAI XL V-Pred | Yes | Yes | Yes | — |
| OmniGen2 | Yes | Yes | — | — |
| Ovis Image | Yes | Yes | — | — |
| Qwen Image | Yes | Yes | Yes | — |
| Qwen Image 2.1 | Yes | — | Yes | — |
| Qwen Image Edit | — | — | Yes | — |
| Stable Diffusion | Yes | Yes | Yes | — |
| Stable Diffusion 3.5 | Yes | Yes | — | — |
| Wulver Non-Turbo | Yes | Yes | Yes | — |
| Wulver Turbo | Yes | Yes | Yes | — |
| Z-Image Base | Yes | Yes | — | — |
| Z-Image Turbo | Yes | Yes | Yes | — |

Compatible image-generation pipelines can also be selected in Power Prompter
and Manga Studio. Shared controls are capability-aware: a detailer, hires fix,
LoRA or tiled VAE option is not automatically supported by every family.

## Editing And Model-Specific Behavior

- **Instruction Edit:** FLUX.2 Edit, FLUX.3, Qwen Image Edit, Qwen Image 2.1 and HiDream O1 declare instruction editing in their native edit pipelines. Select a compatible family to enable Edit.
- **MOSS Image Base/SFT:** TXT2IMG, IMG2IMG, inpainting and vision-conditioned Reference2IMG. Its Edit mode offers structured composition and bounding boxes; MOSS is not a dedicated instruction-edit checkpoint. JSON prompt fields and the optional local prompt enhancer are supported. Skip Layer Guidance and experimental, default-off Spectrum acceleration have separate prerequisites/settings.
- **Iris 3B and official Turbo:** pixel-space generation and IMG2IMG, with compatible native LoRAs and output upscaling. These pipelines need no VAE and do not expose latent hires fix, classic detailers or tiled VAE. No Iris inpainting pipeline is advertised. Turbo IMG2IMG remains experimental.
- **Canvas:** experimental desktop/tablet layered editing and masked generation follow the selected pipeline’s capabilities; phone Remote does not expose Canvas.
- **Compatible variants:** matching fine-tunes or Turbo checkpoints use an existing family pipeline when its architecture and node contract match. A filename alone does not establish compatibility. User-selected resolution is not capped by model-family recommendations.

## Video Workflows

The default route is **DaSiWa only**, with the pinned official MiniMax H3
MythicAlchemy and LTX-2.3 OmniForge workflows. Other bundled video routes remain
available through the explicit **All video routes** policy.

| Bundled family/routes | Declared workflow coverage |
| --- | --- |
| MiniMax H3 | Text-to-video, image-to-video, reference-to-video and Director |
| LTX-2.3 | Text-to-video, image-to-video, video-to-video and OmniForge |
| LTX-2.5 | Text-to-video, image-to-video and video-to-video |
| WAN 2.2 | Text-to-video, image-to-video and video-to-video |

Video generation remains Beta/experimental. MiniMax H3 is the more usable path;
the other model routes are less qualified. **Longshot Studio** and **Frame Forge**
are optional upstream interfaces with their own dependencies, not replacement
models or changes to DaSiWa. See the [video setup and credits](README.md#official-h3-and-ltx-video-workflows).

## Installation And Compatibility

- Portable packages contain Umbra and its workflow definitions, not generation model weights. Follow each model’s license and access requirements.
- Use **Setup > Models** for resources and **Setup > Advanced > Tools** for managed dependencies, then restart the owned ComfyUI instance when required. Missing optional nodes are needed only for the features that use them.
- Formats vary by pipeline: checkpoint, diffusion model/UNet and GGUF support are declared individually. Do not assume every row accepts every format.
- The in-app family selector and readiness checks reflect the installed pipeline/node/model combination. Use the declared pipeline rather than forcing a different architecture through a similar name.
- The source of this matrix is the `umbra_ui_pipelines` metadata in the [bundled API workflows](defaults/PowerPrompter/API%20Workflows), with Edit eligibility defined by the shared frontend resolver. Preserve those declarations when updating model support.

[Back to Umbra Studio](README.md)
