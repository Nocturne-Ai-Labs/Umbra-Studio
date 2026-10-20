"""MOSS caption enhancement using ComfyUI's local TextGenerate implementation.

Prompting reference: OpenMOSS/MOSS-Image, skills/moss-image-prompt-enhancer.
Layout serialization stays under Umbra's control; the LLM only edits captions.
"""
import copy
import json
import re

SYSTEM_PROMPT = """Write a detailed MOSS-Image caption for the requested finished image.
Return only visual descriptive prose. Respect the requested style, subject identities,
counts, relationships, clothing, actions, framing, location and exclusions. Develop
lighting, materials and composition only where the request leaves room. Do not add
people, dialogue, logos or unrelated objects. Preserve quoted visible lettering exactly,
including its language. Do not insert quality tags, explanations, dimensions or coordinates.
For an input image, describe the requested result using its visible appearance as context;
change only what the user's request specifies. Do not guess unreadable text or identities.
For a structured item, describe only that item, without adding other subjects or scenery.
Keep minimalist requests minimalist. Do not change the medium or turn anime into realism."""


def enhance_prompt(prompt, generate):
    """Only caption strings may change; layout geometry and literal text are immutable."""
    def caption(value, context=""):
        if not isinstance(value, str) or not value.strip():
            return value
        result = generate(value, context).strip()
        if not result or result.startswith(("```", "{", "<think>")):
            raise ValueError("MOSS enhancer returned an invalid caption. Disable enhancement or retry.")
        for quoted in re.findall(r'"([^"]+)"|“([^”]+)”', value):
            if next((part for part in quoted if part), "") not in result:
                raise ValueError("MOSS enhancer changed quoted text. Disable enhancement or retry.")
        return result

    if not prompt.lstrip().startswith("{"):
        return caption(prompt)
    try:
        original = json.loads(prompt)
    except json.JSONDecodeError as error:
        raise ValueError("MOSS structured prompt is invalid JSON.") from error
    if not isinstance(original, dict) or not isinstance(original.get("summary"), dict) or not isinstance(original.get("items"), list):
        raise ValueError("MOSS structured prompt requires summary and items.")
    result = copy.deepcopy(original)
    if "caption" in result["summary"]:
        result["summary"]["caption"] = caption(result["summary"]["caption"], "Scene summary; do not introduce additional subjects.")
    for item in result["items"]:
        if not isinstance(item, dict):
            raise ValueError("MOSS structured prompt items must be objects.")
        if "caption" in item:
            context = "Structured item: " + str(item.get("label", "object"))
            if "text" in item:
                context += ". Exact visible text: " + json.dumps(item["text"], ensure_ascii=False)
            item["caption"] = caption(item["caption"], context)
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))


class UmbraMossPromptEnhancer:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"clip": ("CLIP",), "prompt": ("STRING", {"multiline": True}),
                             "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})},
                "optional": {"image": ("IMAGE",)}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("enhanced_prompt",)
    FUNCTION = "enhance"
    CATEGORY = "Umbra/MOSS"

    def enhance(self, clip, prompt, seed, image=None):
        # Lazy import keeps discovery available on older ComfyUI; Umbra reports prerequisites.
        from comfy_extras.nodes_textgen import TextGenerate
        import comfy.model_management

        def generate(text, context):
            comfy.model_management.throw_exception_if_processing_interrupted()
            output = TextGenerate.execute(
                clip=clip, prompt=text, max_length=4096,
                sampling_mode={"sampling_mode": "on", "temperature": 0.7, "top_k": 64,
                               "top_p": 0.95, "min_p": 0.05, "repetition_penalty": 1.0, "seed": seed},
                thinking=False, use_default_template=True,
                system_prompt=SYSTEM_PROMPT + ("\n" + context if context else ""),
                image=image if not context else None,
            )
            return output.args[0]

        return (enhance_prompt(prompt, generate),)


NODE_CLASS_MAPPINGS = {"UmbraMossPromptEnhancer": UmbraMossPromptEnhancer}
NODE_DISPLAY_NAME_MAPPINGS = {"UmbraMossPromptEnhancer": "MOSS Prompt Enhancer (Umbra)"}
