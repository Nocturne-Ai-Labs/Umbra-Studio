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
    def validate_caption(value, result):
        if not isinstance(result, str):
            raise ValueError("MOSS enhancer returned an invalid caption. Disable enhancement or retry.")
        result = result.strip()
        if not result or result.startswith(("```", "{", "<think>")):
            raise ValueError("MOSS enhancer returned an invalid caption. Disable enhancement or retry.")
        for quoted in re.findall(r'"([^"]+)"|“([^”]+)”', value):
            if next((part for part in quoted if part), "") not in result:
                raise ValueError("MOSS enhancer changed quoted text. Disable enhancement or retry.")
        return result

    if not prompt.lstrip().startswith("{"):
        return validate_caption(prompt, generate(prompt, "")) if prompt.strip() else prompt
    try:
        original = json.loads(prompt)
    except json.JSONDecodeError as error:
        raise ValueError("MOSS structured prompt is invalid JSON.") from error
    if not isinstance(original, dict) or not isinstance(original.get("summary"), dict) or not isinstance(original.get("items"), list):
        raise ValueError("MOSS structured prompt requires summary and items.")
    result = copy.deepcopy(original)
    captions = []
    targets = {}

    def add_caption(key, target, context):
        value = target.get("caption")
        if isinstance(value, str) and value.strip():
            captions.append({"id": key, "caption": value, "context": context})
            targets[key] = target

    add_caption("summary", result["summary"], "Scene summary; do not introduce additional subjects.")
    for index, item in enumerate(result["items"]):
        if not isinstance(item, dict):
            raise ValueError("MOSS structured prompt items must be objects.")
        if "caption" in item:
            context = "Structured item: " + str(item.get("label", "object"))
            if "text" in item:
                context += ". Exact visible text: " + json.dumps(item["text"], ensure_ascii=False)
            add_caption(str(index), item, context)
    if captions:
        # One native generation per node avoids re-entering Qwen's compiled decode
        # with different caption lengths before ComfyUI resets its execution buffers.
        context = ('Batch caption enhancement. Override the prose-only output format: return only '
                   'a JSON object {"captions":[{"id":"...","caption":"..."}]}. '
                   'Return every input id exactly once, unchanged; enhance each caption independently '
                   'using its context. No other keys. Do not combine subjects or add scenery to items.')
        try:
            response = generate(json.dumps({"captions": captions}, ensure_ascii=False), context)
            if not isinstance(response, str):
                raise ValueError("Caption batch must be text")
            response = response.strip()
            # Qwen can wrap otherwise valid JSON in a single Markdown code block.
            # Unwrap only a complete response, never extract JSON from commentary.
            fenced = re.fullmatch(r"```(?:json)?[ \t]*\r?\n(.*?)\r?\n```", response, re.DOTALL | re.IGNORECASE)
            if fenced:
                response = fenced.group(1)
            enhanced = json.loads(response)
            if not isinstance(enhanced, dict) or set(enhanced) != {"captions"}:
                raise ValueError("Unexpected caption batch fields")
            entries = enhanced["captions"]
            if not isinstance(entries, list) or len(entries) != len(captions):
                raise ValueError("Caption count changed")
            seen = set()
            for entry in entries:
                if not isinstance(entry, dict) or set(entry) != {"id", "caption"}:
                    raise ValueError("Unexpected caption fields")
                key = entry["id"]
                if not isinstance(key, str) or key not in targets or key in seen:
                    raise ValueError("Caption identity changed")
                seen.add(key)
                target = targets[key]
                target["caption"] = validate_caption(target["caption"], entry["caption"])
        except (ValueError, KeyError, TypeError) as error:
            raise ValueError("MOSS enhancer returned invalid structured captions. Disable enhancement or retry.") from error
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
