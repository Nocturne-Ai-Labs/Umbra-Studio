#!/usr/bin/env python3
"""Local natural-language dataset captioning for Data Forge."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


CAPTION_INSTRUCTION = (
    "Write one detailed, factual natural-language caption for AI image training. "
    "Describe the visible subjects, appearance, pose, clothing, actions, composition, "
    "environment, lighting, and visual style. Describe nudity or explicit sexual content "
    "directly and neutrally when it is visible. Do not censor, moralize, speculate, list "
    "comma-separated tags, mention image quality, or preface the caption. Return only the caption."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--max-new-tokens", type=int, default=192)
    return parser.parse_args()


def normalize_caption(value: str) -> str:
    text = " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split()).strip()
    lowered = text.lower()
    for prefix in ("caption:", "description:", "the image shows", "this image shows"):
        if lowered.startswith(prefix):
            text = text[len(prefix):].lstrip(" :-")
            break
    if text.endswith((",", ";", ":")):
        text = f"{text[:-1].rstrip()}."
    return text.strip()


def main() -> int:
    args = parse_args()
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    try:
        import torch
        from PIL import Image
        from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
    except Exception as exc:
        raise RuntimeError(f"Natural caption dependencies are unavailable: {exc}") from exc

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8-sig"))
    images = manifest.get("images") if isinstance(manifest, dict) else None
    if not isinstance(images, list) or not images:
        raise RuntimeError("Caption manifest contains no images")

    requested_device = str(args.device)
    if requested_device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA captioning was selected, but CUDA is unavailable")
    device = "cuda" if requested_device == "auto" and torch.cuda.is_available() else requested_device
    if device == "auto":
        device = "cpu"
    dtype = torch.float32
    if device == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    model_path = str(Path(args.model_path).resolve())
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True)
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        model_path,
        dtype=dtype,
        local_files_only=True,
        attn_implementation="eager",
    )
    # Transformers 5 can miss the nested Qwen2-VL tie_word_embeddings flag used
    # by this Transformers 4 checkpoint. Explicitly restore the shared language
    # head instead of leaving a randomly initialized output layer.
    input_embeddings = model.get_input_embeddings()
    output_embeddings = model.get_output_embeddings()
    if input_embeddings is not None and output_embeddings is not None:
        output_embeddings.weight = input_embeddings.weight
    model = model.to(device)
    model.eval()

    results = []
    max_new_tokens = max(32, min(512, int(args.max_new_tokens)))
    for entry in images:
        filename = str(entry.get("filename") or "") if isinstance(entry, dict) else ""
        image_path = str(entry.get("path") or "") if isinstance(entry, dict) else ""
        try:
            with Image.open(image_path) as source:
                image = source.convert("RGB")
                messages = [{
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": CAPTION_INSTRUCTION},
                    ],
                }]
                prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                inputs = processor(text=[prompt], images=[image], padding=True, return_tensors="pt")
                inputs = {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}
                with torch.inference_mode():
                    generated_ids = model.generate(
                        **inputs,
                        max_new_tokens=max_new_tokens,
                        do_sample=False,
                        use_cache=True,
                    )
                input_length = int(inputs["input_ids"].shape[1])
                generated_text = processor.batch_decode(
                    generated_ids[:, input_length:],
                    skip_special_tokens=True,
                    clean_up_tokenization_spaces=False,
                )[0]
                caption = normalize_caption(generated_text)
                if not caption:
                    raise RuntimeError("The model returned an empty caption")
                results.append({"filename": filename, "success": True, "caption": caption})
        except Exception as exc:
            results.append({"filename": filename, "success": False, "error": str(exc)})

    payload = {
        "success": any(result.get("success") for result in results),
        "device": device,
        "modelPath": model_path,
        "results": results,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"Natural captioner failed: {error}\n")
        raise SystemExit(1)
