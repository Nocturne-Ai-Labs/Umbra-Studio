import json
from datetime import datetime
from typing import Dict, Any, Optional


def parse_comfyui_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Extract simple parameters from ComfyUI workflow graph"""
    params = {}

    # 1. Find KSampler (primary source of generation params)
    ksampler = None
    for node_id, node in workflow.items():
        if node.get("class_type") in ["KSampler", "KSamplerAdvanced"]:
            ksampler = node
            break

    if ksampler:
        inputs = ksampler.get("inputs", {})
        params["steps"] = inputs.get("steps", 20)
        params["cfg_scale"] = inputs.get("cfg", 7.0)
        params["seed"] = inputs.get("seed", -1)
        params["sampler"] = inputs.get("sampler_name", "euler")
        params["scheduler"] = inputs.get("scheduler", "normal")
        params["denoise"] = inputs.get("denoise", 1.0)

    # 2. Find Checkpoint Loader
    for node_id, node in workflow.items():
        if node.get("class_type") in ["CheckpointLoaderSimple", "CheckpointLoader"]:
            params["model"] = node.get("inputs", {}).get("ckpt_name", "")
            break

    # 3. Find CLIP Text Encoders (Positive/Negative)
    # This is tricky without full graph traversal, but we can guess by keywords
    for node_id, node in workflow.items():
        if node.get("class_type") == "CLIPTextEncode":
            text = node.get("inputs", {}).get("text", "")
            # Very basic heuristic: longer text or no "low quality" is usually positive
            if (
                "negative" in text.lower()
                or "low quality" in text.lower()
                or "blurry" in text.lower()
            ):
                params["negative_prompt"] = text
            else:
                params["positive_prompt"] = text

    # 4. Find Latent Image (Width/Height)
    for node_id, node in workflow.items():
        if node.get("class_type") == "EmptyLatentImage":
            params["width"] = node.get("inputs", {}).get("width", 512)
            params["height"] = node.get("inputs", {}).get("height", 512)
            break

    return params


def convert_to_umbra_format(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Convert unified metadata to Umbra-compatible structured format"""
    raw_model = metadata.get("model", "unknown")
    if isinstance(raw_model, dict):
        raw_model = raw_model.get("name", "unknown")
    model_name = str(raw_model).replace(".safetensors", "").replace(".ckpt", "")

    return {
        "model": model_name,
        "base_model": detect_base_model(model_name),
        "positive_prompt": metadata.get(
            "positive_prompt", metadata.get("positive", "")
        ),
        "negative_prompt": metadata.get(
            "negative_prompt", metadata.get("negative", "")
        ),
        "seed": metadata.get("seed", 0),
        "steps": metadata.get("steps", 30),
        "cfg_scale": metadata.get("cfg_scale", metadata.get("cfg", 7.5)),
        "sampler": metadata.get("sampler", metadata.get("scheduler", "euler")),
        "scheduler": metadata.get("scheduler", "normal"),
        "width": metadata.get("width", 1024),
        "height": metadata.get("height", 1024),
        "strength": metadata.get("denoise", 1.0),
        "created_at": datetime.now().isoformat(),
    }


def detect_base_model(model_name: str) -> str:
    name = model_name.lower()
    if "xl" in name or "sdxl" in name:
        return "sdxl"
    elif "sd2" in name or "v2" in name:
        return "sd-2"
    return "sd-1"


if __name__ == "__main__":
    # Test script
    import sys
    from PIL import Image

    if len(sys.argv) > 1:
        path = sys.argv[1]
        try:
            if path.endswith(".json"):
                with open(path, "r") as f:
                    data = json.load(f)
                    # Check if it's a ComfyUI workflow (dictionary of nodes with class_type)
                    is_comfy = False
                    if isinstance(data, dict):
                        for k, v in data.items():
                            if isinstance(v, dict) and "class_type" in v:
                                is_comfy = True
                                break

                    if is_comfy:
                        params = parse_comfyui_workflow(data)
                    else:
                        params = data
            else:
                # Try to read PNG metadata
                img = Image.open(path)
                if "prompt" in img.info:  # ComfyUI
                    workflow = json.loads(img.info["prompt"])
                    params = parse_comfyui_workflow(workflow)
                elif "cozyui" in img.info:  # Umbra Studio (legacy format)
                    params = json.loads(img.info["cozyui"])
                else:
                    params = {}

            normalized_meta = convert_to_umbra_format(params)
            print(json.dumps(normalized_meta, indent=2))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
