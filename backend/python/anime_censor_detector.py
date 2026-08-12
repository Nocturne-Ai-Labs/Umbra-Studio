#!/usr/bin/env python3
"""Run the Umbra anime censor ONNX detector and emit normalized boxes as JSON."""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps


LABELS = ("nipple_f", "penis", "pussy")
INPUT_SIZE = 640


def box_iou(left: list[float], right: list[float]) -> float:
    x1 = max(left[0], right[0])
    y1 = max(left[1], right[1])
    x2 = min(left[2], right[2])
    y2 = min(left[3], right[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union = left_area + right_area - intersection
    return intersection / union if union > 0 else 0.0


def non_maximum_suppression(detections: list[dict], threshold: float = 0.45) -> list[dict]:
    kept: list[dict] = []
    for candidate in sorted(detections, key=lambda item: item["score"], reverse=True):
        if any(
            existing["label"] == candidate["label"]
            and box_iou(existing["pixel_box"], candidate["pixel_box"]) >= threshold
            for existing in kept
        ):
            continue
        kept.append(candidate)
    return kept


def detect(model_path: str, image_path: str, threshold: float) -> dict:
    with Image.open(image_path) as source_image:
        image = ImageOps.exif_transpose(source_image).convert("RGB")
    original_width, original_height = image.size
    scale = min(INPUT_SIZE / original_width, INPUT_SIZE / original_height)
    resized_width = max(1, round(original_width * scale))
    resized_height = max(1, round(original_height * scale))
    pad_x = (INPUT_SIZE - resized_width) / 2
    pad_y = (INPUT_SIZE - resized_height) / 2
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    resized = image.resize((resized_width, resized_height), Image.Resampling.BILINEAR)
    canvas.paste(resized, (round(pad_x), round(pad_y)))
    tensor = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    output = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor})[0])
    predictions = output[0]
    if predictions.shape[0] < predictions.shape[1]:
        predictions = predictions.transpose(1, 0)

    candidates: list[dict] = []
    for row in predictions:
        if row.shape[0] < 4 + len(LABELS):
            continue
        scores = row[4 : 4 + len(LABELS)]
        class_id = int(np.argmax(scores))
        score = float(scores[class_id])
        if score < threshold:
            continue
        center_x, center_y, width, height = (float(value) for value in row[:4])
        left = max(0.0, min(float(original_width), (center_x - width / 2 - pad_x) / scale))
        top = max(0.0, min(float(original_height), (center_y - height / 2 - pad_y) / scale))
        right = max(0.0, min(float(original_width), (center_x + width / 2 - pad_x) / scale))
        bottom = max(0.0, min(float(original_height), (center_y + height / 2 - pad_y) / scale))
        if right - left < 2 or bottom - top < 2:
            continue
        candidates.append({
            "label": LABELS[class_id],
            "score": score,
            "pixel_box": [left, top, right, bottom],
        })

    detections = non_maximum_suppression(candidates)
    return {
        "width": original_width,
        "height": original_height,
        "detections": [
            {
                "label": item["label"],
                "score": item["score"],
                "x": item["pixel_box"][0] / original_width,
                "y": item["pixel_box"][1] / original_height,
                "width": (item["pixel_box"][2] - item["pixel_box"][0]) / original_width,
                "height": (item["pixel_box"][3] - item["pixel_box"][1]) / original_height,
            }
            for item in detections
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--threshold", type=float, default=0.278)
    args = parser.parse_args()
    try:
        print(json.dumps(detect(args.model, args.image, max(0.05, min(0.95, args.threshold)))))
        return 0
    except Exception as error:  # pragma: no cover - surfaced to the Bun service
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
