"""Decode one final video frame with the managed, CPU-only PyAV environment."""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import threading
import time

MAX_PIXELS = 33_554_432
FORMATS = "mov,matroska,webm,avi,gif,webp,avif,m4v"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cancel-file", required=True)
    parser.add_argument("--watchdog-seconds", type=float, default=90.0, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not math.isfinite(args.watchdog_seconds) or not 0.01 <= args.watchdog_seconds <= 90.0:
        raise ValueError("The PyAV watchdog deadline must be between 0.01 and 90 seconds.")
    cancel_file = Path(args.cancel_file)
    deadline = time.monotonic() + args.watchdog_seconds

    def watch_cancel():
        while True:
            if time.monotonic() >= deadline:
                os._exit(124)
            try:
                if cancel_file.exists():
                    os._exit(130)
            except OSError:
                pass
            time.sleep(0.05)

    threading.Thread(target=watch_cancel, daemon=True).start()
    try:
        import av
    except ImportError as error:
        raise RuntimeError("PyAV is unavailable in Umbra's managed ComfyUI venv; install its declared av dependency there.") from error

    # Passing an already-open local file and excluding nested protocols prevents
    # playlists or demuxers from opening remote or second local resources.
    with Path(args.input).open("rb") as source:
        with av.open(source, mode="r", options={
            "protocol_whitelist": "", "format_whitelist": FORMATS, "enable_drefs": "0",
        }) as container:
            stream = next((item for item in container.streams.video if not (item.disposition & av.stream.Disposition.attached_pic)), None)
            if stream is None:
                raise ValueError("The video has no decodable video stream.")
            if stream.width <= 0 or stream.height <= 0 or stream.width * stream.height > MAX_PIXELS:
                raise ValueError("The video exceeds the 33,554,432-pixel frame limit.")
            stream.codec_context.thread_count = 2
            last = None
            for frame in container.decode(stream):
                if frame.width <= 0 or frame.height <= 0 or frame.width * frame.height > MAX_PIXELS:
                    raise ValueError("A decoded frame exceeds the 33,554,432-pixel limit.")
                last = frame
            if last is None:
                raise ValueError("No video frame could be decoded.")
            last.to_image().save(args.output, format="PNG", compress_level=1)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
