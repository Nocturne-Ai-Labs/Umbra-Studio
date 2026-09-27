#!/usr/bin/env python3
"""Run the pinned, locally installed PixAI tagger for Umbra tag workflows."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

MODEL_REPO = "pixai-labs/pixai-tagger-v1.0"
MODEL_FOLDER = "pixai-tagger-v1.0"
REQUIRED_FILES = ("config.json", "preprocessor_config.json", "model.safetensors", "tagger_pipeline.py")
TRUSTED_FILE_HASHES = {
    "config.json": "f8a19b38661c37dc5fd519f2137be70f6f897972021b4ebc17b7d35a0e27b9dd",
    "preprocessor_config.json": "20451575e627950993de7b00641d5b263eceb3e7436e4ad518fea2411b60e49d",
    "tagger_pipeline.py": "3431279fdfff234f62664999fc1fe6bb20f1e8756f7435d0e165ebd4456f7fcd",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--image")
    source.add_argument("--manifest")
    parser.add_argument("--local-model-root", required=True)
    parser.add_argument("--general-threshold", type=float, default=0.17)
    parser.add_argument("--character-threshold", type=float, default=0.27)
    parser.add_argument("--rating-threshold", type=float, default=0.41)
    parser.add_argument("--max-tags", type=int, default=120)
    return parser.parse_args()


def entries(values: dict[str, float], limit: int) -> list[dict[str, float | str]]:
    ordered = sorted(values.items(), key=lambda entry: entry[1], reverse=True)
    return [{"tag": tag, "score": round(float(score), 6)} for tag, score in ordered[:limit]]


def build_result(scores: dict[str, dict[str, float]], args: argparse.Namespace) -> dict:
    general = entries(scores.get("general", {}), args.max_tags)
    character = entries(scores.get("character", {}), args.max_tags)
    style = entries(scores.get("style", {}), args.max_tags)
    copyright_tags = entries(scores.get("copyright", {}), args.max_tags)
    meta = entries(scores.get("meta", {}), args.max_tags)
    rating = {tag: round(float(score), 6) for tag, score in scores.get("rating", {}).items()}
    booru_tags = [item["tag"] for group in (character, general, style) for item in group]
    return {
        "success": True,
        "modelRepo": MODEL_REPO,
        "modelSource": "local",
        "generalThreshold": args.general_threshold,
        "characterThreshold": args.character_threshold,
        "ratingThreshold": args.rating_threshold,
        "generalMcutEnabled": False,
        "characterMcutEnabled": False,
        "usedGeneralThreshold": args.general_threshold,
        "usedCharacterThreshold": args.character_threshold,
        "rating": rating,
        "general": general,
        "character": character,
        "style": style,
        "copyright": copyright_tags,
        "artist": [],
        "meta": meta,
        "booruTags": booru_tags,
        "booruTagString": ", ".join(booru_tags),
        "generalTagString": ", ".join(item["tag"] for item in general),
        "characterTagString": ", ".join(item["tag"] for item in character),
        "styleTagString": ", ".join(item["tag"] for item in style),
    }


def main() -> int:
    args = parse_args()
    model_dir = Path(args.local_model_root).resolve() / MODEL_FOLDER
    missing = [name for name in REQUIRED_FILES if not (model_dir / name).is_file()]
    if missing:
        raise RuntimeError("PixAI Tagger is not installed. Install the optional model in Umbra Setup.")
    for filename, expected_hash in TRUSTED_FILE_HASHES.items():
        actual_hash = hashlib.sha256((model_dir / filename).read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise RuntimeError(f"PixAI {filename} failed integrity verification. Reinstall it from Umbra Setup.")
    if not all(0 <= value <= 1 for value in (
        args.general_threshold, args.character_threshold, args.rating_threshold,
    )):
        raise ValueError("Tag thresholds must be between 0 and 1.")
    if not 1 <= args.max_tags <= 500:
        raise ValueError("max-tags must be between 1 and 500.")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        import torch
        from PIL import Image
        from transformers import pipeline
        import timm  # noqa: F401 - required by the pinned local pipeline code
        import torchvision  # noqa: F401 - required by the pinned local pipeline code
    except ImportError as exc:
        raise RuntimeError(
            "PixAI Tagger requires torch, torchvision, transformers>=4.57.6, timm and Pillow "
            "in Umbra's Python runtime."
        ) from exc

    device = os.environ.get("UMBRA_PIXAI_DEVICE", "auto").lower()
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("UMBRA_PIXAI_DEVICE must be auto, cpu or cuda.")
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("PixAI CUDA was requested but is not available.")
    target_device = 0 if device == "cuda" or (device == "auto" and torch.cuda.is_available()) else -1
    tagger = pipeline(
        "tagger", model=str(model_dir), image_processor=str(model_dir),
        trust_remote_code=True, device=target_device,
    )
    threshold = {
        "general": args.general_threshold,
        "character": args.character_threshold,
        "rating": args.rating_threshold,
    }
    if args.image:
        images = [{"filename": Path(args.image).name, "path": args.image}]
    else:
        images = json.loads(Path(args.manifest).read_text(encoding="utf-8"))["images"]
        if not isinstance(images, list) or len(images) > 10000:
            raise ValueError("Invalid PixAI image manifest.")

    results = []
    for image in images:
        try:
            path = str(image["path"])
            with Image.open(path) as source:
                scores = tagger(source.convert("RGB"), threshold=threshold)["results"]
            results.append({"filename": str(image["filename"]), "result": build_result(scores, args)})
        except Exception as exc:
            results.append({"filename": str(image.get("filename", "")), "error": str(exc)})
    if args.image:
        item = results[0]
        if item.get("error"):
            raise RuntimeError(item["error"])
        print(json.dumps(item["result"]))
    else:
        print(json.dumps({"results": results}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
