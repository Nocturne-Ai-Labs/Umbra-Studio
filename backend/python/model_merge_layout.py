"""Header-only model layout inspection. Tensor payload validation stays in the worker."""
import re


AUXILIARY = ('first_stage_model.', 'cond_stage_model.', 'conditioner.', 'text_encoders.', 'vae.', 'clip.', 'llm_adapter.')
RUNTIME_METADATA = ('modelspec.architecture', 'modelspec.prediction_type', 'modelspec.implementation')


def describe(raw_tensors, metadata):
    if not raw_tensors or any(re.search(r'(?:^|\.)(?:lora_up|lora_down|lora_A|lora_B)(?:\.|$)|^lora_', key) for key in raw_tensors):
        raise ValueError('Select a complete model, not a LoRA.')
    source_keys = {re.sub(r'^(?:model\.diffusion_model\.|diffusion_model\.|net\.)', '', key): key for key in raw_tensors}
    if len(source_keys) != len(raw_tensors):
        raise ValueError('Duplicate model tensors after prefix normalization.')
    tensors = {key: raw_tensors[original] for key, original in source_keys.items()}
    for key, tensor in tensors.items():
        if not isinstance(tensor, dict) or tensor.get('dtype') not in ('F16', 'BF16', 'F32', 'I64', 'I32', 'BOOL'):
            raise ValueError('Quantized/FP8 models are not supported. Use FP16, BF16, or FP32 weights.')
        if not isinstance(tensor.get('shape'), list) or any(type(n) is not int or n < 0 for n in tensor['shape']):
            raise ValueError(f'Invalid tensor: {key}')
        if key.endswith(('.weight_scale', '.input_scale', '.scale_weight', '.quant_state')):
            raise ValueError('Quantized model layouts cannot be blended directly.')
    if not any(key.endswith('.weight') and len(t['shape']) >= 2 and t['dtype'] in ('F16', 'BF16', 'F32') for key, t in tensors.items()):
        raise ValueError('No full-precision model weights were found.')
    blocks = {int(m.group(1)) for key in tensors if (m := re.match(r'blocks\.(\d+)\.', key))}
    anima = any(key.startswith('llm_adapter.blocks.') for key in tensors)
    family = 'Safetensors'
    if anima:
        if blocks not in (set(range(28)), set(range(40))) or 'final_layer.linear.weight' not in tensors:
            raise ValueError('The Anima model has an incomplete block or final-layer layout.')
        family = 'Anima 2.9B' if len(blocks) == 40 else 'Anima'
    elif any(key.startswith('input_blocks.') for key in tensors):
        contexts = {value['shape'][1] for key, value in tensors.items() if key.endswith('attn2.to_k.weight') and len(value['shape']) == 2}
        family = 'SDXL' if contexts & {1280, 2048} else 'SD 2.x' if 1024 in contexts else 'SD 1.5' if 768 in contexts else 'UNet'
    elif any(key.startswith('double_blocks.') for key in tensors):
        family = 'FLUX' if 'img_in.weight' in tensors else 'Double-stream transformer'
    elif any(key.startswith('joint_blocks.') for key in tensors):
        family = 'SD3'
    elif any(key.startswith('transformer_blocks.') for key in tensors):
        family = 'Transformer'
    groups = set()
    for key in tensors:
        if key.startswith(AUXILIARY):
            continue
        if key.startswith(('middle_block.', 'mid_block.')):
            groups.add(key.split('.')[0])
        else:
            match = re.match(r'^((?:[^.]+\.)*?\d+)\.', key)
            if match:
                groups.add(match.group(1))
    def natural(value):
        return [int(part) if part.isdigit() else part for part in re.split(r'(\d+)', value)]
    labels = sorted(groups, key=natural)
    if len(labels) > 4096:
        raise ValueError('This model has too many block groups for the merge editor.')
    return dict(tensors=tensors, sourceKeys=source_keys, family=family, blocks=len(labels), blockLabels=labels,
                combined=any(key.startswith(AUXILIARY[:-1]) for key in tensors),
                runtimeMetadata={key: metadata[key] for key in RUNTIME_METADATA if isinstance(metadata.get(key), str)})


def block_for_key(key, labels):
    for index, label in enumerate(labels):
        if key.startswith(label + '.'):
            return index
    return None
