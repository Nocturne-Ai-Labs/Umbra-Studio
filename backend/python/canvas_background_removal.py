"""Local, CPU-only Canvas cutouts. Never installs packages or downloads weights."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import time

MODEL_MD5 = "6f184e756bb3bd901c8849220a83e38e"
MAX_PIXELS = 64 * 1024 * 1024


def cutout(source, session):
    """ISNet-anime normalization/mask contract from rembg (MIT); see Credits.md."""
    import numpy as np
    from PIL import Image

    pixels = np.asarray(source.resize((1024, 1024), Image.Resampling.LANCZOS))
    normalized = pixels / max(float(pixels.max()), 1e-6)
    normalized -= np.array((0.485, 0.456, 0.406))
    tensor = normalized.transpose(2, 0, 1)[None].astype(np.float32)
    prediction = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor})[0])[0, 0]
    if prediction.shape != (1024, 1024) or not np.isfinite(prediction).all():
        raise ValueError('The background-removal model returned an invalid mask; the original image was kept.')
    low, high = float(prediction.min()), float(prediction.max())
    mask = (prediction - low) / (high - low) if high > low else np.zeros_like(prediction)
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).resize(source.size, Image.Resampling.LANCZOS)
    result = source.convert('RGBA')
    result.putalpha(alpha)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--cancel-file", required=True)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    cancel_path = Path(args.cancel_file)

    # The flag belongs to this one helper. Exiting this process also releases its
    # ONNX session during inference/model loading, without touching another job.
    def watch_cancel():
        while True:
            if cancel_path.exists():
                os._exit(130)
            time.sleep(0.05)

    threading.Thread(target=watch_cancel, daemon=True).start()
    model = Path(args.model)
    if not model.is_file():
        raise ValueError("The local isnet-anime model is missing. Install Core pipeline support in Umbra Setup > Models > Pipeline support, then reopen Transparency. No download was attempted.")
    with model.open("rb") as stream:
        if hashlib.file_digest(stream, "md5").hexdigest() != MODEL_MD5:
            raise ValueError("The local isnet-anime model failed its integrity check; no replacement was downloaded.")
    try:
        import numpy  # noqa: F401
        import onnxruntime as ort
        from PIL import Image, ImageOps
    except ImportError as error:
        raise ValueError("Canvas CPU background removal needs ONNX Runtime, NumPy and Pillow. Repair ComfyUI custom-node dependencies in Umbra Setup, then reopen Transparency.") from error

    if args.probe:
        print(json.dumps({"available": True, "provider": "CPUExecutionProvider", "model": "isnet-anime"}))
        return
    if not args.input or not args.output:
        raise ValueError("An input image and output PNG are required.")

    options = ort.SessionOptions()
    options.intra_op_num_threads = min(4, os.cpu_count() or 1)
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
    providers = session.get_providers()
    if providers != ["CPUExecutionProvider"]:
        raise RuntimeError("Canvas background removal did not start with the required CPU-only provider.")
    try:
        with Image.open(args.input) as source:
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("The image exceeds the 64 megapixel Canvas background-removal limit.")
            source = ImageOps.exif_transpose(source).convert("RGB")
            # Canvas reapplies the baked source alpha once when composing the
            # cutout. Keep the model's soft mask here, without threshold/morphology.
            result = cutout(source, session)
            result.save(args.output, format="PNG")
            print(json.dumps({"provider": providers[0], "model": "isnet-anime", "mask": "soft", "width": result.width, "height": result.height}))
    except (OSError, Image.DecompressionBombError) as error:
        raise ValueError("The source image could not be read. Choose a valid image and retry; the original layer was kept.") from error


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
