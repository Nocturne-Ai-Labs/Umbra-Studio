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

## Canvas

Canvas is an experimental desktop/tablet workspace for composing image layers,
painting masks, and choosing a generation region on one continuous canvas.
Its editing, project, export, and CPU background-removal tools work while
ComfyUI is stopped. Background removal needs the installed Python dependencies
and local model described below; generation needs the matching ComfyUI tools
and models. Canvas is not available in Phone Remote or its Gallery Send menus;
opening a saved Canvas navigation state on a phone returns to TXT2IMG.

1. Open **Canvas** in Umbra UI, then choose **New Canvas project** or
   **Canvas projects** to open an existing project. Name the project in the top
   toolbar. Use **Import image**, drag Gallery media into Canvas, or send an
   image from Gallery to a new or existing Canvas project.
2. Open **Layers** to select, duplicate, hide, lock, flip, or rotate a layer.
   The selection tool moves and resizes layers; Ctrl-drag an image handle to
   crop its frame. The magnet toggles snapping; hold Alt to bypass it.
3. Use **Paint inpaint mask**, **Erase inpaint mask**, or **Lasso mask
   selection** to edit mask layers. **Erase active image layer** edits a raster
   layer. Locked layers reject edits. Undo/redo recover editing transactions.
4. Open **Prompt** and **Generation** to set the prompt, compatible pipeline,
   model resources, and generation settings. The generation-box tool controls
   the region to process. Control and Reference options depend on the selected
   pipeline. Generated samples are staged for review before acceptance; this
   walkthrough does not establish model-generation qualification.
5. Use **Save** to persist the document and image assets. Projects containing
   layers also autosave after 30 seconds without changes. **Canvas projects**
   provides named restore points and **Save Point**. Cropping to the generation
   box and merging visible layers create pre-edit restore points; merged source
   layers remain hidden and recoverable.
6. Use **Export portable Canvas project** to download a `.umbra-canvas` archive
   and **Import portable Canvas project** to open it under a new project
   identity. Archives retain the document and its assets but omit transient
   pending jobs and staging previews. **Export image layer PNG** saves the
   selected raster layer's image as a PNG.

For background removal, select an unlocked image layer and choose **Remove
image background**. Canvas runs this feature exclusively on CPU. Its status
reads **Background removal · CPU** when the installed environment is ready.
It needs `rembg`, ONNX Runtime, NumPy, and Pillow in Umbra's managed ComfyUI
Python environment, plus the local `Tools/ComfyUI/models/rembg/isnet-anime.onnx`
model. Missing dependencies or weights disable the action with an explanation;
this feature does not install or download them. A successful removal adds a
cutout layer and hides the original; Undo restores the original, and Redo
recovers the cutout. Existing transparent and erased pixels remain transparent.
The cutout preserves the model's soft alpha, including fine edge transitions.
Inspect the result before exporting; subject separation still depends on the
image and model. **Cancel** stops this cutout's CPU worker and keeps the source.
While the worker stops, the status reads **Stopping background removal · CPU**.
Opening another project also stops the pending worker and discards its result.
Image and video generation retain their existing execution settings.

Close **Prompt**, **Generation**, or **Layers** to give the canvas more room.
On a short window, **Hide Strip** also frees space. **Fit visible content**
and **Reset view** help recover an off-screen view. Switching between Canvas
and Video preserves the open Canvas document and prompt draft.

Saves remain under `User/UmbraUI/CanvasProjects` and are preserved by the normal
portable update process. New/Open/archive import first save the existing
document. If a save fails, the current draft stays open and **Retry Save** is
available. If another saved revision conflicts with the draft, use
**Save project as a new copy** to retain it separately or **Reload saved
project**, which asks before discarding the draft. A crop or merge that becomes
stale while newer edits or another project are opened stops without applying
its result. Duplicate layers sharing a temporary image upload that image once;
each layer keeps its own identity and transforms. Projects with many distinct
large images can still reach the existing save-request limit.

Saved image assets remain available for open Undo/Redo histories until the
project is deleted, so repeated pixel edits can increase project storage.
**Save project as a new copy** and portable exports include the current
document's referenced assets rather than unrelated historical image files.

Canvas is not ready for feedback. Current local checks cover editing, saved
project recovery, exports, failure handling, and simulated desktop/tablet
layouts, including a synthetic 25-layer 4K project. Actual `isnet-anime`
background removal was checked on illustrated portrait fixtures using explicit
CPU inference with ComfyUI stopped, including soft alpha and source-transparency
preservation, Undo/Save/Redo, reopen, identical PNG exports, repeat requests,
live worker cancellation, project-switch protection, failure handling, and
tablet control reachability. This does not qualify photographic subjects, fresh
image generation, or physical touch/pen/pinch interaction. Complete localization
and broader model-specific documentation are pending.

## Video

Video provides model-aware LTX and Wan generation surfaces for text-to-video,
image-to-video, and video-to-video work. Source media, key frames, prompts,
audio where supported, sizing policy, seed behavior, sampling, interpolation,
and upscale options are kept with each queued video so creators can inspect,
edit, and requeue results.

The viewer occupies the center, with prompts and reference media in the bottom
tray. **Settings** and **Queue / Results** toggle the side panels. Drag the
tray or review-panel divider to resize it; focused dividers also support the
arrow keys. Queue items open their preview in the viewer. Director/OmniForge
editors and their drafts stay mounted while previewing results or collapsing
panels, so returning to the editor retains the work in progress.

Video remains in beta. These workspace changes preserve generation behavior;
simulated job/media checks do not qualify fresh GPU rendering or advanced model
combinations.

## Extras

Extras handles dedicated utility work such as batch upscaling. Folder and file
inputs are processed one image at a time so an entire batch is not loaded into
VRAM simultaneously. Local clients can choose output folders with the native
file picker; host-only filesystem actions remain unavailable to remote clients.

### Metadata Viewer And Image Analysis

Open **Extras > Metadata Scanner** or **Visual Analysis** and choose **Add media**.
Select an image or video from the bottom strip. The central preview supports
pan, zoom and **Fit image**; the toolbar can hide or show the inspector. The
inspector stacks below the preview on narrow screens, including Phone Remote.

Metadata Viewer displays generation prompts, parameters and file information.
**Copy JSON** and **Save JSON** export the embedded visual workflow or API prompt
graph. Enable **Show raw metadata** to access ComfyUI and legacy parameter
exports. Legacy PNG parameter exports retain their original text. Clear cancels
the import batch so a delayed scan cannot put cleared media back into the strip.

Image Analysis separates **Settings** and **Results** while preserving tagger
models, thresholds, MCut options, tag formatting, prepend presets, caption model,
device and length. Analyze the selected image or the image batch. **Stop after
current** prevents the next batch item; clearing media or leaving the tool blocks
late client results. An inference request already accepted by the server may
continue. Videos can be previewed but the tagger and captioner require images.

Copy tags or captions from Results, or send the selected source and current
analysis prompt to **TXT2IMG**, **IMG2IMG**, **Inpaint**, or **IMG2VID**. File Explorer
remains a local-host action. Imported media and results stay in the current app
session; reloading clears them. Model inference requires the existing installed
weights and dependencies; the interface does not change their setup.

### Transparency

Open **Extras > Transparency** and choose **Add images**. Select an image in the
bottom strip, then use **Erase pixels** or **Restore pixels** on the **Before**
pane. The red overlay shows the editable removal mask; **After** previews the
actual transparency over a checkerboard. Toggle **Show editable mask** to hide
the overlay without changing the result. Adjust **Size**, **Hardness**, and
**Strength**, or use **Pan image**, zoom, and **Fit image** for finer edits.

Each completed brush gesture is one Undo step. **Reset transparency mask**
returns to the original alpha and is also undoable. Masks and their histories
stay independent when switching images or other Extras tools. Restore reveals
the original pixels; it never fills transparency already present in the source.

Optionally choose **Auto cutout · CPU** to start from the model's soft mask and
refine it with the brushes. This uses the same installed Python dependencies
and local `isnet-anime` weights as Canvas background removal; ComfyUI can stay
stopped. It does not install packages or download weights. **Cancel cutout**,
switching images, and leaving Transparency stop only that cutout's worker and
keep the previous mask. Manual masking and PNG export remain available without
the CPU model.

**Export PNG** downloads a separate `-transparent.png` at the original image
dimensions with real alpha, including for images whose editing preview is
downsampled. The imported file is never overwritten. Imports use the browser's
PNG, JPEG, WebP, AVIF and BMP decoders and accept at most 64 megapixels. Images,
masks and up to 40 Undo steps per image stay in this app session; reloading the
page discards them, so export results before reloading. The CPU model's subject
separation still needs inspection, especially for photographic images.

## Power Prompter

Power Prompter and Umbra UI share the same model-family pipeline definitions
and compiler. A PPCard selects a model family rather than asking the user to
author and import a raw API workflow. Power Prompter supplies prompt batches;
the shared pipeline supplies compatible model resources, sampling, hires fix,
detailer stages, optional final upscale, and metadata behavior.

Before a public release, the packaged build must visibly expose and validate
Power Prompter's hires-fix, detailer, and output-upscale controls for every
pipeline that declares those capabilities.

## Model Manager And Data Forge

Model Manager uses the Gallery browsing pattern: folders, search, type filters,
sort, grid/list view, Ctrl/Shift selection, and selection details. Select visible
matches or open item/bulk context actions. Downloads, installs, metadata and
folder controls retain their existing behavior. Removal still requires its
confirmation. Narrow layouts expose folders and details in reachable panels;
remote clients retain their existing limits on local-host actions.

In **Data Forge > Datasets**, select a dataset and concept, then search filenames
or tags, filter, sort, and select images in the browser. Filtering keeps the
selection and reports selected images hidden from the current view. Caption
editing and the collapsible caption/tagging controls preserve the original
dataset, concept and filename. Imports, archives, moves, deletes and repairs use
the existing controls and confirmations. Data Forge remains unavailable in
Phone Remote.

**Data Forge > Model Merge** uses the same dark OLED glass surfaces and compact
controls as the rest of the workspace. Its source models, independent LoRA
stacks, ratios and blocks, recipes, blueprints, output validation, progress and
cancellation retain their existing behavior. Tablet layouts provide separate
merge-controls and test-preview views. Interface checks use mocked operations;
they do not qualify a new model merge or generation run.

## Release Media Safety

- Use only the repository's dedicated tour source and curated starter cards.
- Keep the demonstration subject fully clothed and the prompts PG-safe.
- Do not capture a developer's Gallery, private output folders, prompt history,
  saved projects, or last-open workspace state.
- Keep NSFW media out of screenshots even when thumbnail blur is enabled.
- Review every screenshot at full size before publishing it.
