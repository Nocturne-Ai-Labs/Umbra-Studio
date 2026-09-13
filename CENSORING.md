# Image Censor Setup

Extras > Image Censor uses paired contours with a 3-source-pixel edge expansion.
The defaults are 50% confidence, 0% additional padding and a 24-pixel mosaic.
Saved presets retain their explicit confidence and padding values.

## Review And Export

Open **Umbra UI > Extras > Image Censor**, create a review project and add images.
Use **Preview batch** to prepare unfinished images, or **Render preview** for the
current image. Compare the source and preview, adjust individual regions, or use
rectangle, brush and eraser tools. Automatic detection can be disabled for fully
manual masking. Before and After are shown side by side; the editable mask view
supports panning and a configurable overlay color.

Each image must be rendered with its current edits and explicitly approved before
**Export approved** includes it. Alternatively, **Approve uncensored** approves
the untouched original without detection or rendering, clears manual masks and
disables detected regions. This action preserves the original format and size.
Editing an approved image returns it to review.
Images with no mask coverage are marked uncensored and still require approval.
Source-derived, custom and pinned output folders use the existing Censored output
conventions. Originals and earlier exports are never overwritten.
Successful exports are removed from the active batch and review project; failed
exports remain for retry. Keep the exported files and original sources as your
archive. Removing an image from the batch does not delete its original source.

### Review Flags

**Censor cutoff** controls which detections are eligible for censorship.
**Review flag floor** independently retains weaker candidates for inspection:
15% by default, adjustable down to 5% and no higher than the censor cutoff.
For example, a 65% censor cutoff and 15% review floor flags a 20% candidate
without censoring it. These scores are detector scores, not calibrated accuracy.

**Needs attention** filters for uncertain regions, empty detection results,
detector warnings/errors and images needing a fresh review scan. Click a region
to locate its box; review-only boxes never enter the automatic mask. Add a manual
rectangle or paint a mask when needed, or approve the original uncensored.
Explicit approval resolves the flag until further edits or a new detection pass.

Use **Preview batch** to scan existing unapproved projects for low-confidence
candidates. Previously approved images are left alone. Lowering the review floor
below the last scan or lowering the censor cutoff requires new detection.
The optional weak-candidate specialist pass adds some CPU processing time but
does not generate full-resolution masks for weak candidates.

No detections does not prove an image is safe. A missed region with no surviving
candidate cannot be reliably flagged when other regions were detected. Flags
prioritize manual review; they do not guarantee complete coverage or auto-approve
unflagged images.

Projects save under `User/UmbraUI/CensorReviews/`, including immutable source
copies, current previews, masks and edit state. Allow space for the original files
plus these working assets, and include this directory in your backups. Save
successfully before closing Umbra. Reopen a project to resume; stopping a batch
finishes its current image without discarding previously completed previews.

Inputs must be still images up to 64 megapixels and 16,384 pixels per side.
Browser uploads allow 120 MB; local file imports allow 256 MB. Manual masks permit
256 rectangles, 4,000 brush strokes and 200,000 stroke points per image.

## Separate Male Anatomy Model

The specialist weights are **not bundled or mirrored by Umbra**. Obtain v2.0 of
[Cock and Ball Detection 2D edition](https://civitai.com/models/310687?modelVersionId=1793796)
from the author and review its current terms before use. The listing permits
image use but has separate restrictions on other uses and derivatives; Umbra's
MIT license does not grant rights to these weights.

Place the unmodified `cockAndBallDetection2D_v20.pt` (about 125 MB) at:

`User/Models/Detectors/anatomy-v2/cockAndBallDetection2D_v20.pt`

SHA-256: `b446188e3663395a0af8a8a48bf19a3a684959fd7be7bc46b0c9c5ec0e98aa96`

Inference uses the managed ComfyUI Python environment, on CPU; ComfyUI does not
need to be running. It requires PyTorch, Ultralytics, Pillow, NumPy and
ONNX Runtime. The tested Ultralytics version is 8.4.53. Review
[Ultralytics licensing](https://www.ultralytics.com/license) separately before
installation or deployment. It is not covered by Umbra's MIT license. This
integration does not bundle or relicense Ultralytics or the specialist weights.

For an existing compatible managed ComfyUI environment, install the helper
dependencies only after reviewing their terms:

Windows, from the portable Umbra root:

```powershell
.\Tools\ComfyUI\venv\Scripts\python.exe -m pip install ultralytics==8.4.53 onnxruntime Pillow numpy
```

Linux, from the portable Umbra root:

```bash
./Tools/ComfyUI/venv/bin/python -m pip install ultralytics==8.4.53 onnxruntime Pillow numpy
```

Do not replace an existing GPU PyTorch installation just for censorship.
Missing or mismatched specialist weights fail clearly instead of silently
substituting the older male detector. Female-only or manual-only censoring
does not need this specialist.

## Other Models And Review

The existing DeepGHS detector (MIT) and EfficientSAM-Ti outline models
(Apache-2.0, about 41 MB combined) download on first use with integrity checks.
Images are processed locally and are not uploaded to the model hosts.

Female regions retain rectangular fallback when their outline is uncertain.
Male specialist masks are supplemented only with usable contours from the
existing detector. Excluded uncertain supplements are reported for review.
Automatic masks are unioned before applying the mosaic, with the 3px expansion
applied before export resizing. Manual regions can be used together with auto.

Outputs with no detected or manual regions pass through as `uncensored`.
`censored` means a mask was applied, **not** that every sensitive region was
found or that the image meets a platform's publication requirements. Review
all outputs; unusual anatomy, stylized imagery and small regions can be missed.
