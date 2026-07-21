# Umbra UI Tour

Umbra UI is Umbra Studio's guided generation workspace. It uses curated,
model-aware pipelines while leaving ComfyUI available for users who want to
inspect or extend the underlying graphs.

The screenshots in this tour use a dedicated PG-safe demonstration image. They
do not depend on a developer's last-open project, Gallery contents, prompt
history, or generated outputs.

## Shared Pipeline

Every generation mode is built around the same pipeline contract:

1. Choose the model family. Umbra uses that family to select the compatible
   graph and capability definition.
2. Choose the model source, such as a checkpoint, diffusion model, UNet, or
   GGUF file when the selected family supports it.
3. Fill the required workflow resources. A pipeline may require one or more
   text encoders, a VAE, or other architecture-specific resources.
4. Add optional LoRAs. The stack keeps enabled LoRAs, strengths, syntax chips,
   and trained-token hints together.
5. Build the prompt. Multiple positive fields are cleaned and compiled into a
   single prompt without forcing creators to maintain one giant text block.
6. Set seed behavior, sampler, scheduler, dimensions, steps, CFG or guidance,
   and the controls exposed by that model family.
7. Enable only compatible post-processing stages. Hires fix, detailers, and
   final upscaling are capability-driven and bypassed when disabled.
8. Submit immediately, run next, or append to the active Power Prompter queue
   when that queue is running.

Umbra does not force every architecture into the same graph. Controls that do
not apply to the selected family are hidden or disabled by its capability
definition.

## TXT2IMG

[![Umbra UI TXT2IMG](.github/screenshots/umbra-ui-txt2img.png)](.github/screenshots/umbra-ui-txt2img.png)

TXT2IMG is the primary guided image-generation surface. It includes model and
resource selection, segmented prompts, LoRAs, agent-assisted prompt drafting,
seed modes, image dimensions, sampling controls, hires fix, an ordered detailer
pipeline, optional final upscale, and queue-aware submission.

## IMG2IMG

IMG2IMG accepts an existing image and applies controlled regeneration with a
denoise value. It reuses the same model-aware resources and optional detailer
pipeline as TXT2IMG. Gallery, Filmstrip, and Inpaint results can be handed to
IMG2IMG without manually locating the file again.

## Inpaint

[![Umbra UI Inpaint](.github/screenshots/umbra-ui-inpaint.png)](.github/screenshots/umbra-ui-inpaint.png)

Inpaint focuses on masked edits. Projects preserve the source image, image and
mask layers, prompts, generation settings, and accepted samples. Touch Up,
Recolor, and Replace modes provide practical starting settings, while adaptive
soft inpaint controls edge blending, source protection, color matching, and
denoise behavior. Accepted results can continue into IMG2IMG for a final pass.

## Video

Video provides model-aware LTX and Wan generation surfaces for text-to-video,
image-to-video, and video-to-video work. Source media, key frames, prompts,
audio where supported, sizing policy, seed behavior, sampling, interpolation,
and upscale options are kept with each queued video so creators can inspect,
edit, and requeue results.

## Extras

Extras handles dedicated utility work such as batch upscaling. Folder and file
inputs are processed one image at a time so an entire batch is not loaded into
VRAM simultaneously. Local clients can choose output folders with the native
file picker; host-only filesystem actions remain unavailable to remote clients.

## Power Prompter

Power Prompter and Umbra UI share the same model-family pipeline definitions
and compiler. A PPCard selects a model family rather than asking the user to
author and import a raw API workflow. Power Prompter supplies prompt batches;
the shared pipeline supplies compatible model resources, sampling, hires fix,
detailer stages, optional final upscale, and metadata behavior.

Before a public release, the packaged build must visibly expose and validate
Power Prompter's hires-fix, detailer, and output-upscale controls for every
pipeline that declares those capabilities.

## Release Media Safety

- Use only the repository's dedicated tour source and curated starter cards.
- Keep the demonstration subject fully clothed and the prompts PG-safe.
- Do not capture a developer's Gallery, private output folders, prompt history,
  saved projects, or last-open workspace state.
- Keep NSFW media out of screenshots even when thumbnail blur is enabled.
- Review every screenshot at full size before publishing it.
