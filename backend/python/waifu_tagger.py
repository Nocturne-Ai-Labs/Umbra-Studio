#!/usr/bin/env python3
"""Waifu Diffusion tagger helper for Umbra Scanner.

Outputs JSON with rating/general/character tags using underscore style tags.
"""

from __future__ import annotations

import argparse
import json
import os
import traceback
from dataclasses import dataclass
from typing import Dict, List, Tuple

IMPORT_ERRORS: List[str] = []

try:
    import numpy as np
except Exception as exc:  # pragma: no cover - import error reporting
    np = None
    IMPORT_ERRORS.append(f"numpy: {exc}")

try:
    import onnxruntime as ort
except Exception as exc:  # pragma: no cover - import error reporting
    ort = None
    IMPORT_ERRORS.append(f"onnxruntime: {exc}")

try:
    import pandas as pd
except Exception as exc:  # pragma: no cover - import error reporting
    pd = None
    IMPORT_ERRORS.append(f"pandas: {exc}")

try:
    from huggingface_hub import hf_hub_download
except Exception as exc:  # pragma: no cover - import error reporting
    hf_hub_download = None
    IMPORT_ERRORS.append(f"huggingface_hub: {exc}")

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - import error reporting
    Image = None
    IMPORT_ERRORS.append(f"Pillow: {exc}")


DEFAULT_MODEL = "SmilingWolf/wd-vit-tagger-v3"
DEFAULT_GENERAL_THRESHOLD = 0.35
DEFAULT_CHARACTER_THRESHOLD = 0.85
DEFAULT_RATING_THRESHOLD = 0.25
DEFAULT_MAX_TAGS = 120

TAGS_FILENAME = "selected_tags.csv"
MODEL_FILENAME = "model.onnx"

# Categories used by wd-tagger selected_tags.csv.
RATING_CATEGORY = 9
GENERAL_CATEGORY = 0
ARTIST_CATEGORY = 1
COPYRIGHT_CATEGORY = 3
CHARACTER_CATEGORY = 4
META_CATEGORY = 5


@dataclass
class TagResult:
    rating: Dict[str, float]
    general: List[Tuple[str, float]]
    artist: List[Tuple[str, float]]
    copyright: List[Tuple[str, float]]
    character: List[Tuple[str, float]]
    meta: List[Tuple[str, float]]
    used_general_threshold: float
    used_character_threshold: float


def normalize_tag(raw: str) -> str:
    text = str(raw or "").strip().lower()
    if not text:
        return ""
    text = "_".join(text.split())
    while "__" in text:
        text = text.replace("__", "_")
    return text


def mcut_threshold(scores: List[float]) -> float:
    if not scores:
        return 1.0
    sorted_scores = sorted(float(s) for s in scores if isinstance(s, (int, float)))
    if len(sorted_scores) <= 1:
        return sorted_scores[0] if sorted_scores else 1.0
    diffs = [sorted_scores[i + 1] - sorted_scores[i] for i in range(len(sorted_scores) - 1)]
    max_gap_idx = int(np.argmax(diffs))
    return float((sorted_scores[max_gap_idx] + sorted_scores[max_gap_idx + 1]) / 2.0)


def load_model(model_repo: str, cache_dir: str | None = None) -> Tuple[ort.InferenceSession, pd.DataFrame]:
    if np is None or ort is None or pd is None or hf_hub_download is None:
        raise RuntimeError("Required Python dependencies are missing.")

    model_path = hf_hub_download(
        repo_id=model_repo,
        filename=MODEL_FILENAME,
        cache_dir=cache_dir,
    )
    tags_path = hf_hub_download(
        repo_id=model_repo,
        filename=TAGS_FILENAME,
        cache_dir=cache_dir,
    )

    providers = ["CPUExecutionProvider"]
    available = set(ort.get_available_providers())
    if "CUDAExecutionProvider" in available:
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

    session = ort.InferenceSession(model_path, providers=providers)
    tags_df = pd.read_csv(tags_path)
    return session, tags_df


def sanitize_model_folder_name(model_repo: str) -> str:
    value = str(model_repo or "").strip()
    if not value:
        return ""
    tail = value.split("/")[-1]
    safe = "".join(ch for ch in tail if ch.isalnum() or ch in ("-", "_", ".")).strip("._-")
    return safe


def resolve_local_model_files(model_repo: str, local_model_root: str | None) -> Tuple[str, str] | None:
    root = str(local_model_root or "").strip()
    if not root:
        return None
    root = os.path.abspath(root)
    if not os.path.isdir(root):
        return None

    repo_tail = sanitize_model_folder_name(model_repo)
    candidates = []
    if repo_tail:
        candidates.append(os.path.join(root, repo_tail))

    # Allow placing model files directly in the root as a fallback.
    candidates.append(root)

    for candidate in candidates:
        model_file = os.path.join(candidate, MODEL_FILENAME)
        tags_file = os.path.join(candidate, TAGS_FILENAME)
        if os.path.isfile(model_file) and os.path.isfile(tags_file):
            return model_file, tags_file
    return None


def load_model_with_source(
    model_repo: str,
    cache_dir: str | None = None,
    local_model_root: str | None = None,
) -> Tuple[ort.InferenceSession, pd.DataFrame, str]:
    if np is None or ort is None or pd is None:
        raise RuntimeError("Required Python dependencies are missing.")

    local_files = resolve_local_model_files(model_repo, local_model_root)
    if local_files:
        model_path, tags_path = local_files
        providers = ["CPUExecutionProvider"]
        available = set(ort.get_available_providers())
        if "CUDAExecutionProvider" in available:
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        session = ort.InferenceSession(model_path, providers=providers)
        tags_df = pd.read_csv(tags_path)
        return session, tags_df, "local"

    session, tags_df = load_model(model_repo=model_repo, cache_dir=cache_dir)
    return session, tags_df, "huggingface"


def preprocess_image(image_path: str, target_size: int) -> np.ndarray:
    if np is None:
        raise RuntimeError("numpy is required but not installed.")
    if Image is None:
        raise RuntimeError("Pillow is required but not installed.")
    image = Image.open(image_path).convert("RGB")
    arr = np.asarray(image, dtype=np.uint8)[:, :, ::-1]  # RGB -> BGR

    height, width = arr.shape[0], arr.shape[1]
    size = max(height, width)
    canvas = np.full((size, size, 3), 255, dtype=np.uint8)
    y_off = (size - height) // 2
    x_off = (size - width) // 2
    canvas[y_off:y_off + height, x_off:x_off + width] = arr

    if size != target_size:
        resized = Image.fromarray(canvas).resize((target_size, target_size), Image.Resampling.BICUBIC)
        canvas = np.asarray(resized, dtype=np.uint8)

    x = canvas.astype(np.float32)
    x = np.expand_dims(x, axis=0)
    return x


def infer_tags(
    session: ort.InferenceSession,
    tags_df: pd.DataFrame,
    image_path: str,
    general_threshold: float,
    character_threshold: float,
    rating_threshold: float,
    general_mcut_enabled: bool,
    character_mcut_enabled: bool,
    max_tags: int,
) -> TagResult:
    input_meta = session.get_inputs()[0]
    input_name = input_meta.name
    input_shape = input_meta.shape
    input_size = int(input_shape[1] if len(input_shape) > 2 and input_shape[1] else 448)

    x = preprocess_image(image_path, input_size)
    output_name = session.get_outputs()[0].name
    probs = session.run([output_name], {input_name: x})[0][0].astype(float)

    names = tags_df["name"].tolist()
    categories = tags_df["category"].tolist()

    rating_raw: Dict[str, float] = {}
    general_raw: List[Tuple[str, float]] = []
    artist_raw: List[Tuple[str, float]] = []
    copyright_raw: List[Tuple[str, float]] = []
    character_raw: List[Tuple[str, float]] = []
    meta_raw: List[Tuple[str, float]] = []

    for idx, score in enumerate(probs):
        tag = normalize_tag(names[idx])
        if not tag:
            continue
        category = int(categories[idx])
        value = float(score)
        if category == RATING_CATEGORY:
            if value >= rating_threshold:
                rating_raw[tag] = value
        elif category == GENERAL_CATEGORY:
            general_raw.append((tag, value))
        elif category == ARTIST_CATEGORY:
            artist_raw.append((tag, value))
        elif category == COPYRIGHT_CATEGORY:
            copyright_raw.append((tag, value))
        elif category == CHARACTER_CATEGORY:
            character_raw.append((tag, value))
        elif category == META_CATEGORY:
            meta_raw.append((tag, value))

    used_general_threshold = general_threshold
    used_character_threshold = character_threshold

    if general_mcut_enabled:
        used_general_threshold = mcut_threshold([score for _, score in general_raw])
    if character_mcut_enabled:
        used_character_threshold = mcut_threshold([score for _, score in character_raw])

    general_selected = sorted(
        [(tag, score) for tag, score in general_raw if score >= used_general_threshold],
        key=lambda x: x[1],
        reverse=True,
    )[:max_tags]

    artist_selected = sorted(
        [(tag, score) for tag, score in artist_raw if score >= general_threshold],
        key=lambda x: x[1],
        reverse=True,
    )[:max_tags]

    copyright_selected = sorted(
        [(tag, score) for tag, score in copyright_raw if score >= general_threshold],
        key=lambda x: x[1],
        reverse=True,
    )[:max_tags]

    character_selected = sorted(
        [(tag, score) for tag, score in character_raw if score >= used_character_threshold],
        key=lambda x: x[1],
        reverse=True,
    )[:max_tags]

    meta_selected = sorted(
        [(tag, score) for tag, score in meta_raw if score >= general_threshold],
        key=lambda x: x[1],
        reverse=True,
    )[:max_tags]

    rating_sorted = dict(sorted(rating_raw.items(), key=lambda x: x[1], reverse=True))
    return TagResult(
        rating=rating_sorted,
        general=general_selected,
        artist=artist_selected,
        copyright=copyright_selected,
        character=character_selected,
        meta=meta_selected,
        used_general_threshold=float(used_general_threshold),
        used_character_threshold=float(used_character_threshold),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tag image with Waifu Diffusion wd-tagger model")
    parser.add_argument("--image", required=True, help="Path to image")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="HF repo id for wd model")
    parser.add_argument("--general-threshold", type=float, default=DEFAULT_GENERAL_THRESHOLD)
    parser.add_argument("--character-threshold", type=float, default=DEFAULT_CHARACTER_THRESHOLD)
    parser.add_argument("--rating-threshold", type=float, default=DEFAULT_RATING_THRESHOLD)
    parser.add_argument("--general-mcut-enabled", action="store_true")
    parser.add_argument("--character-mcut-enabled", action="store_true")
    parser.add_argument("--max-tags", type=int, default=DEFAULT_MAX_TAGS)
    parser.add_argument("--cache-dir", default=None, help="Optional HF cache dir")
    parser.add_argument("--local-model-root", default=None, help="Optional local model root (offline preinstalled models)")
    return parser.parse_args()


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def main() -> int:
    args = parse_args()

    if IMPORT_ERRORS:
        print(json.dumps({
            "error": "Missing Python dependencies for Waifu tagger",
            "missing": IMPORT_ERRORS,
            "installHint": "pip install onnxruntime pandas huggingface_hub pillow numpy",
        }))
        return 1

    image_path = str(args.image or "").strip()
    if not image_path:
        print(json.dumps({"error": "Image path is required"}))
        return 2
    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        return 2

    general_threshold = clamp(float(args.general_threshold), 0.0, 1.0)
    character_threshold = clamp(float(args.character_threshold), 0.0, 1.0)
    rating_threshold = clamp(float(args.rating_threshold), 0.0, 1.0)
    max_tags = int(max(1, min(int(args.max_tags), 500)))

    try:
        session, tags_df, model_source = load_model_with_source(
            model_repo=args.model,
            cache_dir=args.cache_dir,
            local_model_root=args.local_model_root,
        )
        result = infer_tags(
            session=session,
            tags_df=tags_df,
            image_path=image_path,
            general_threshold=general_threshold,
            character_threshold=character_threshold,
            rating_threshold=rating_threshold,
            general_mcut_enabled=bool(args.general_mcut_enabled),
            character_mcut_enabled=bool(args.character_mcut_enabled),
            max_tags=max_tags,
        )

        general_tags = [tag for tag, _ in result.general]
        artist_tags = [tag for tag, _ in result.artist]
        copyright_tags = [tag for tag, _ in result.copyright]
        character_tags = [tag for tag, _ in result.character]
        meta_tags = [tag for tag, _ in result.meta]
        booru_tags = character_tags + general_tags

        payload = {
            "success": True,
            "modelRepo": args.model,
            "modelSource": model_source,
            "generalThreshold": general_threshold,
            "characterThreshold": character_threshold,
            "ratingThreshold": rating_threshold,
            "generalMcutEnabled": bool(args.general_mcut_enabled),
            "characterMcutEnabled": bool(args.character_mcut_enabled),
            "usedGeneralThreshold": round(result.used_general_threshold, 6),
            "usedCharacterThreshold": round(result.used_character_threshold, 6),
            "rating": {k: round(float(v), 6) for k, v in result.rating.items()},
            "general": [{"tag": tag, "score": round(float(score), 6)} for tag, score in result.general],
            "artist": [{"tag": tag, "score": round(float(score), 6)} for tag, score in result.artist],
            "copyright": [{"tag": tag, "score": round(float(score), 6)} for tag, score in result.copyright],
            "character": [{"tag": tag, "score": round(float(score), 6)} for tag, score in result.character],
            "meta": [{"tag": tag, "score": round(float(score), 6)} for tag, score in result.meta],
            "booruTags": booru_tags,
            "booruTagString": ", ".join(booru_tags),
            "generalTagString": ", ".join(general_tags),
            "artistTagString": ", ".join(artist_tags),
            "copyrightTagString": ", ".join(copyright_tags),
            "characterTagString": ", ".join(character_tags),
            "metaTagString": ", ".join(meta_tags),
        }
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        error_payload = {
            "error": str(exc),
            "traceback": traceback.format_exc(limit=2),
        }
        print(json.dumps(error_payload))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
