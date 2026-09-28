"""CPU placement for Anima 3.8B's Qwen3.5 text encoder.

The upstream Anima loader constructs a CLIP without a device input. Rebuilding
the CLIP with CPU model options avoids retargeting its dynamic patcher after
weights have already been staged on the GPU.
"""

import torch
import safetensors.torch

import comfy.sd
import comfy.utils
import folder_paths
import nodes
from comfy.supported_models_base import ClipTarget


class UmbraAnimaQwen35CpuLoader:
    @classmethod
    def INPUT_TYPES(cls):
        upstream = nodes.NODE_CLASS_MAPPINGS.get("AnimaQwen35Loader")
        choices = upstream.INPUT_TYPES()["required"]["qwen35_model"] if upstream else (["qwen35_4b.safetensors"],)
        return {"required": {"qwen35_model": choices}}

    RETURN_TYPES = ("CLIP",)
    FUNCTION = "load_clip"
    CATEGORY = "loaders/Anima"
    TITLE = "Umbra Anima Qwen3.5 CPU Loader"
    DESCRIPTION = "Runs Anima's Qwen3.5 prompt encoder on system RAM to reduce peak VRAM use."

    def load_clip(self, qwen35_model):
        upstream = nodes.NODE_CLASS_MAPPINGS.get("AnimaQwen35Loader")
        if upstream is None:
            raise RuntimeError("Install comfyui-anima-3-8B before using Anima CPU text encoding.")

        clip_path = folder_paths.get_full_path("text_encoders", qwen35_model)
        if clip_path is None:
            raise FileNotFoundError(f"Qwen3.5 text encoder not found: {qwen35_model}")

        # These are the upstream loader's exact tokenizer and model factory.
        upstream_globals = upstream.load_clip.__globals__
        tokenizer = upstream_globals["AnimaQwen35Tokenizer"]
        text_encoder_factory = upstream_globals["text_encoder_factory"]
        state_dict = safetensors.torch.load_file(clip_path)
        detection = {}
        for key in (
            "model.norm.weight",
            "model.layers.0.input_layernorm.weight",
            "norm.1.weight",
            "layers.0.input_layernorm.weight",
        ):
            if key in state_dict:
                detection["dtype_llama"] = state_dict[key].dtype
                break
        quantization = comfy.utils.detect_layer_quantization(state_dict, "")
        if quantization is not None:
            detection["llama_quantization_metadata"] = quantization

        cpu = torch.device("cpu")
        clip = comfy.sd.CLIP(
            target=ClipTarget(tokenizer, text_encoder_factory(**detection)),
            state_dict=[state_dict],
            parameters=sum(tensor.numel() for tensor in state_dict.values()),
            model_options={
                "load_device": cpu,
                "offload_device": cpu,
                "initial_device": cpu,
            },
        )
        return (clip,)


class UmbraAnima38BV2RetainedPrompt:
    @classmethod
    def _upstream(cls):
        upstream = nodes.NODE_CLASS_MAPPINGS.get("Anima38BV2Prompt")
        if upstream is None or not callable(getattr(upstream, "_unload_clip", None)):
            raise RuntimeError(
                "Update comfyui-anima-3-8B before using Anima text encoder retention."
            )
        return upstream

    @classmethod
    def INPUT_TYPES(cls):
        return cls._upstream().INPUT_TYPES()

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("expanded", "native")
    FUNCTION = "encode"
    CATEGORY = "conditioning/Anima"
    TITLE = "Umbra Anima 3.8B Prompt (Retain Encoders)"
    DESCRIPTION = "Skips Anima's forced text-encoder unload after prompt encoding."

    def encode(self, **inputs):
        upstream = self._upstream()
        retained = type(
            "RetainedAnima38BV2Prompt",
            (upstream,),
            {"_unload_clip": staticmethod(lambda _clip: None)},
        )
        return retained().encode(**inputs)


NODE_CLASS_MAPPINGS = {
    "UmbraAnimaQwen35CpuLoader": UmbraAnimaQwen35CpuLoader,
    "UmbraAnima38BV2RetainedPrompt": UmbraAnima38BV2RetainedPrompt,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "UmbraAnimaQwen35CpuLoader": "Umbra Anima Qwen3.5 CPU Loader",
    "UmbraAnima38BV2RetainedPrompt": "Umbra Anima 3.8B Prompt (Retain Encoders)",
}
