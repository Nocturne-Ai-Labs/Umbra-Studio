"""Refine censor boxes with the official EfficientSAM-Ti ONNX pair (CPU only)."""

import base64
import io
import math

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageOps


def fill_mask_holes(mask):
    # Flood the outside, leaving only enclosed holes to fill.
    exterior = ImageOps.expand(mask, border=1, fill=0)
    ImageDraw.floodfill(exterior, (0, 0), 255)
    holes = ImageOps.invert(exterior).crop((1, 1, mask.width + 1, mask.height + 1))
    return Image.fromarray(np.maximum(np.asarray(mask), np.asarray(holes)))


def encode_mask(mask):
    buffer = io.BytesIO()
    mask.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def expand_mask(mask, radius):
    if radius <= 0:
        return mask
    # Integral sums make large padding linear-time instead of a large max filter.
    binary = np.pad(np.asarray(mask) > 0, radius)
    integral = np.pad(binary.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    size = 2 * radius + 1
    counts = integral[size:, size:] - integral[:-size, size:] - integral[size:, :-size] + integral[:-size, :-size]
    return Image.fromarray((counts > 0).astype(np.uint8) * 255)


def refine_detections(image_path, detections, encoder_path, decoder_path, padding):
    if not detections:
        return []
    if len(detections) > 128:
        raise ValueError("Too many censor regions; process this image with manual regions.")
    with Image.open(image_path) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
    width, height = image.size
    session_options = ort.SessionOptions()
    session_options.intra_op_num_threads = 4
    session_options.inter_op_num_threads = 1
    encoder = ort.InferenceSession(encoder_path, sess_options=session_options, providers=["CPUExecutionProvider"])
    decoder = ort.InferenceSession(decoder_path, sess_options=session_options, providers=["CPUExecutionProvider"])
    results = []
    for detection in detections:
        x, y = detection["x"] * width, detection["y"] * height
        bw, bh = detection["width"] * width, detection["height"] * height
        # Context helps separate the target from nearby clothing. Each crop is bounded
        # before inference, so high-resolution inputs do not enlarge decoder tensors.
        context = max(0.15, padding)
        left, top = max(0, math.floor(x - bw * context)), max(0, math.floor(y - bh * context))
        right, bottom = min(width, math.ceil(x + bw * (1 + context))), min(height, math.ceil(y + bh * (1 + context)))
        crop = image.crop((left, top, right, bottom))
        crop.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        cw, ch = crop.size
        sx, sy = cw / (right - left), ch / (bottom - top)
        tensor = np.asarray(crop, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        embedding = encoder.run(None, {encoder.get_inputs()[0].name: tensor})[0]
        logits, scores, _ = decoder.run(None, {
            "image_embeddings": embedding,
            "batched_point_coords": np.array([[[[(x-left)*sx, (y-top)*sy], [(x+bw-left)*sx, (y+bh-top)*sy]]]], dtype=np.float32),
            "batched_point_labels": np.array([[[2, 3]]], dtype=np.float32),
            "orig_im_size": np.array([ch, cw], dtype=np.int64),
        })
        best = int(np.argmax(scores[0, 0]))
        mask_score = float(scores[0, 0, best])
        binary = logits[0, 0, best] >= 0
        bx1, by1 = max(0, int((x-left)*sx)), max(0, int((y-top)*sy))
        bx2, by2 = min(cw, math.ceil((x+bw-left)*sx)), min(ch, math.ceil((y+bh-top)*sy))
        inside = int(binary[by1:by2, bx1:bx2].sum())
        total = int(binary.sum())
        box_area = max(1, (bx2-bx1) * (by2-by1))
        usable = math.isfinite(mask_score) and mask_score >= 0.8 and inside >= max(4, box_area * 0.02) and inside >= total * 0.8
        output_left, output_top = max(0, math.floor(x-bw*padding)), max(0, math.floor(y-bh*padding))
        output_right, output_bottom = min(width, math.ceil(x+bw*(1+padding))), min(height, math.ceil(y+bh*(1+padding)))
        result = {
            **detection,
            "x": output_left / width, "y": output_top / height,
            "width": (output_right-output_left) / width, "height": (output_bottom-output_top) / height,
            "maskKind": "box-fallback", "maskScore": mask_score if math.isfinite(mask_score) else 0,
        }
        if usable:
            mask = fill_mask_holes(Image.fromarray(binary.astype(np.uint8) * 255))
            radius = math.ceil(min(bw*sx, bh*sy) * padding)
            if radius:
                mask = expand_mask(mask, radius)
            mask = mask.resize((right-left, bottom-top), Image.Resampling.NEAREST)
            # Restrict refinement to the requested padded detection; SAM must not
            # select an unrelated object elsewhere in the image.
            mask = mask.crop((output_left-left, output_top-top, output_right-left, output_bottom-top))
            if mask.getbbox():
                result.update(maskKind="contour", maskPngBase64=encode_mask(mask))
        results.append(result)
    return results
