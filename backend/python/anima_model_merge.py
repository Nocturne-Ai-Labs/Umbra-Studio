"""CPU-only, same-architecture Anima weight blending for Data Forge."""
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import hashlib
import importlib.util
import logging
from contextlib import contextmanager
from types import SimpleNamespace


def block_ratios(values, count):
    if not isinstance(values, dict):
        raise ValueError('Block weights must be an object.')
    result = {}
    for key, value in values.items():
        if not str(key).isdigit() or str(int(key)) != str(key) or not 0 <= int(key) < count:
            raise ValueError(f'Invalid block index: {key}')
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError(f'Invalid weight for block {key}.')
        result[int(key)] = value
    return result


@contextmanager
def strict_lora_warnings():
    class Capture(logging.Handler):
        def emit(self, record):
            if record.levelno >= logging.WARNING:
                raise ValueError('LoRA cannot be baked completely: ' + record.getMessage())
    handler = Capture()
    logging.getLogger().addHandler(handler)
    try:
        yield
    finally:
        logging.getLogger().removeHandler(handler)


def prepare_stack(entries, info, request, check_cancel):
    if not entries:
        return {}, []
    import torch
    from safetensors.torch import load_file
    comfy_root = Path(request['comfyRoot'])
    sys.path.insert(0, str(comfy_root))
    # Comfy's embedded imports do not necessarily parse sys.argv.
    from comfy.cli_args import args
    args.cpu = True
    import comfy.lora
    import comfy.lora_convert
    from comfy.weight_adapter.lora import LoRAAdapter

    # Only tensor names are needed to ask ComfyUI for its standard key mapping.
    model = SimpleNamespace(model_config=SimpleNamespace(unet_config={}), state_dict=lambda: {'diffusion_model.' + key: None for key in info['tensors']})
    key_map = comfy.lora.model_lora_keys_unet(model, {})
    compat_path = comfy_root / 'custom_nodes/Umbra-Nodes/anima_lora_compat.py'
    spec = importlib.util.spec_from_file_location('umbra_merge_lora_compat', compat_path)
    compat = importlib.util.module_from_spec(spec)
    if not compat_path.is_file():
        raise ValueError('Update Umbra Nodes in ComfyUI before baking Anima LoRAs.')
    spec.loader.exec_module(compat)
    target = SimpleNamespace(get_model_object=lambda _: SimpleNamespace(blocks=[None] * info['blocks'], llm_adapter=True))
    stacks, snapshots = {}, []
    for entry in entries:
        check_cancel()
        strength = entry['strength']
        if isinstance(strength, bool) or not isinstance(strength, (int, float)) or not math.isfinite(strength) or not -2 <= strength <= 2:
            raise ValueError('LoRA strength must be between -2 and 2.')
        path = Path(entry['path'])
        before = path.stat()
        state = load_file(str(path), device='cpu')
        if not state or any(not torch.isfinite(t).all() for t in state.values()):
            raise ValueError(f'Empty or non-finite LoRA weights: {path.name}')
        state = compat.prepare_anima_lora(target, state)
        state = comfy.lora_convert.convert_lora(state)
        with strict_lora_warnings():
            patches = comfy.lora.load_lora(state, key_map)
        if not patches:
            raise ValueError(f'No compatible diffusion weights in LoRA: {path.name}')
        for raw_key, adapter in patches.items():
            if not isinstance(raw_key, str) or not raw_key.startswith('diffusion_model.') or not isinstance(adapter, LoRAAdapter):
                raise ValueError('Only standard LoRA/DoRA diffusion adapters can currently be baked. Text encoder and other adapter types are not supported.')
            key = raw_key.removeprefix('diffusion_model.')
            up, down, _, mid, _, reshape = adapter.weights
            shape = info['tensors'][key]['shape']
            if mid is not None or reshape is not None or up.ndim != 2 or down.ndim != 2 or list(shape) != [up.shape[0], down.shape[1]] or up.shape[1] != down.shape[0]:
                raise ValueError(f'Unsupported LoRA tensor shape: {raw_key}')
            stacks.setdefault(key, []).append((strength, adapter, 1.0, None, None))
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('A LoRA changed while loading. Please retry.')
        snapshots.append((str(path), {'bytes': before.st_size, 'mtimeNs': before.st_mtime_ns}))
    return stacks, snapshots


def apply_stack(value, key, patches):
    if key not in patches:
        return value.float()
    import comfy.lora
    with strict_lora_warnings():
        return comfy.lora.calculate_weight(patches[key], value.float().clone(), key)


def emit(**values):
    print(json.dumps(values), flush=True)


def inspect(path):
    path = Path(path)
    with path.open('rb') as stream:
        raw = stream.read(8)
        if len(raw) != 8:
            raise ValueError('Invalid safetensors file.')
        length = struct.unpack('<Q', raw)[0]
        if not 2 <= length <= 16 * 1024 * 1024:
            raise ValueError('Invalid safetensors header size.')
        header = json.loads(stream.read(length))
    raw_tensors = {k: v for k, v in header.items() if k != '__metadata__'}
    source_keys = {re.sub(r'^(?:model\.diffusion_model\.|diffusion_model\.|net\.)', '', k): k for k in raw_tensors}
    if len(source_keys) != len(raw_tensors):
        raise ValueError('Duplicate model tensors after prefix normalization.')
    tensors = {k: raw_tensors[original] for k, original in source_keys.items()}
    if any(k.startswith(('first_stage_model.', 'cond_stage_model.', 'text_encoders.', 'vae.', 'clip.')) for k in tensors):
        raise ValueError('Select a diffusion-only Anima model; combined VAE/text encoder checkpoints cannot be merged.')
    blocks = {int(m.group(1)) for k in tensors if (m := re.match(r'blocks\.(\d+)\.', k))}
    if blocks not in (set(range(28)), set(range(40))) or not any('llm_adapter.blocks.' in k for k in tensors):
        raise ValueError('Select a full Anima diffusion model, not a LoRA or another model family.')
    if not any(k.endswith('final_layer.linear.weight') for k in tensors):
        raise ValueError('The Anima model is missing its final layer.')
    for key, tensor in tensors.items():
        if tensor.get('dtype') not in ('F16', 'BF16', 'F32', 'I64', 'I32', 'BOOL'):
            raise ValueError('Quantized/FP8 models are not supported. Use FP16, BF16, or FP32 weights.')
        if not isinstance(tensor.get('shape'), list):
            raise ValueError(f'Invalid tensor: {key}')
    # Let safetensors validate offsets, sizes, and the complete file without loading weights.
    from safetensors import safe_open
    with safe_open(str(path), framework='pt', device='cpu') as model:
        if set(model.keys()) != set(raw_tensors):
            raise ValueError('Invalid model tensor index.')
    info = path.stat()
    return {
        'family': 'Anima 2.9B' if len(blocks) == 40 else 'Anima',
        'blocks': len(blocks), 'bytes': info.st_size, 'mtimeNs': info.st_mtime_ns,
        'tensors': tensors, 'sourceKeys': source_keys, 'metadata': header.get('__metadata__', {}),
    }


def inspect_pair(a, b):
    if Path(a).resolve() == Path(b).resolve():
        raise ValueError('Choose two different source models.')
    left, right = inspect(a), inspect(b)
    if left['blocks'] != right['blocks']:
        raise ValueError('Original Anima and Anima 2.9B cannot be merged together.')
    if left['tensors'].keys() != right['tensors'].keys():
        raise ValueError('These models have different tensor keys. Use models with matching weight layouts.')
    for key, tensor in left['tensors'].items():
        other = right['tensors'][key]
        if tensor['shape'] != other['shape'] or tensor['dtype'] != other['dtype']:
            raise ValueError(f'Tensor shape or precision differs: {key}')
    return left, right


def merge(request):
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
    os.environ['PYTORCH_NVML_BASED_CUDA_CHECK'] = '0'
    import torch
    from safetensors import safe_open
    from safetensors.torch import save_file
    import psutil

    torch.set_num_threads(2)
    a, b = request['a'], request['b']
    ratio = request['ratio']
    if isinstance(ratio, bool) or not isinstance(ratio, (int, float)) or not math.isfinite(ratio) or not 0 <= ratio <= 1:
        raise ValueError('Mix must be between 0 and 100 percent.')
    left, right = inspect_pair(a, b)
    overrides = block_ratios(request.get('blocks', {}), left['blocks'])
    output = Path(request['output'])
    partial = Path(request['partial'])
    cancel = Path(request['cancel'])
    clean_metadata = request.get('cleanMetadata', True)
    if not isinstance(clean_metadata, bool):
        raise ValueError('Invalid metadata setting.')
    blueprint = request.get('blueprint')
    if not isinstance(blueprint, dict) or not re.fullmatch(r'[a-f0-9-]{36}', str(blueprint.get('id', ''))) or not isinstance(blueprint.get('setup'), dict):
        raise ValueError('A merge blueprint is required.')
    blueprint_path = Path(request['blueprintPath'])
    blueprint_partial = blueprint_path.with_suffix('.tmp')
    blueprint_published = False
    blueprint_staged = False
    model_published = False
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError('Output already exists. Choose a new name.')
    lora_bytes = sum(Path(item['path']).stat().st_size for side in ('lorasA', 'lorasB') for item in request.get(side, []))
    required = left['bytes'] * 3 + lora_bytes * 2 + 1024 ** 3
    if psutil.virtual_memory().available < required:
        raise ValueError(f'Not enough free RAM. Free approximately {required / 1024 ** 3:.1f} GB first.')
    if shutil.disk_usage(output.parent).free < left['bytes'] + 512 * 1024 ** 2:
        raise ValueError('Not enough free disk space for the merged model.')

    def check_cancel():
        if cancel.exists():
            raise InterruptedError('Merge cancelled.')

    try:
        check_cancel()
        emit(phase='loading_loras', progress=0)
        patches_a, snapshots_a = prepare_stack(request.get('lorasA', []), left, request, check_cancel)
        patches_b, snapshots_b = prepare_stack(request.get('lorasB', []), right, request, check_cancel)
        merged = {}
        with safe_open(a, framework='pt', device='cpu') as source_a, safe_open(b, framework='pt', device='cpu') as source_b:
            keys = sorted(left['tensors'])
            for index, key in enumerate(keys):
                check_cancel()
                x, y = source_a.get_tensor(left['sourceKeys'][key]), source_b.get_tensor(right['sourceKeys'][key])
                output_key = 'net.' + key
                if x.is_floating_point():
                    if not torch.isfinite(x).all() or not torch.isfinite(y).all():
                        raise ValueError(f'Non-finite source weights: {key}')
                    match = re.match(r'blocks\.(\d+)\.', key)
                    weight = overrides.get(int(match.group(1)), ratio) if match else ratio
                    value = torch.lerp(apply_stack(x, key, patches_a), apply_stack(y, key, patches_b), weight).to(x.dtype)
                    if not torch.isfinite(value).all():
                        raise ValueError(f'Non-finite merged weights: {key}')
                    merged[output_key] = value.contiguous()
                else:
                    if not torch.equal(x, y):
                        raise ValueError(f'Non-floating model buffers differ: {key}')
                    merged[output_key] = x.clone()
                if index % 20 == 0 or index == len(keys) - 1:
                    emit(phase='blending', progress=round((index + 1) / len(keys) * 90), processed=index + 1, total=len(keys))
        emit(phase='fingerprinting', progress=90)
        fingerprints = []
        for path, before in [(a, left), (b, right), *snapshots_a, *snapshots_b]:
            check_cancel()
            digest = hashlib.sha256()
            with open(path, 'rb') as source:
                while chunk := source.read(8 * 1024 * 1024):
                    check_cancel()
                    digest.update(chunk)
            after = Path(path).stat()
            if after.st_size != before['bytes'] or after.st_mtime_ns != before['mtimeNs']:
                raise ValueError('A source model changed during the merge. Please retry.')
            fingerprints.append({'name': Path(path).name, 'bytes': after.st_size, 'sha256': digest.hexdigest()})
        check_cancel()
        emit(phase='saving', progress=92)
        provenance = {'version': 1, 'method': 'weighted_sum', 'a': Path(a).name, 'b': Path(b).name, 'bWeight': ratio, 'family': left['family'], 'blocks': request.get('blocks', {}), 'lorasA': [{'name': Path(e['path']).name, 'strength': e['strength']} for e in request.get('lorasA', [])], 'lorasB': [{'name': Path(e['path']).name, 'strength': e['strength']} for e in request.get('lorasB', [])], 'sources': fingerprints}
        metadata = {} if clean_metadata else {k: v for k, v in left['metadata'].items() if isinstance(v, str) and k not in ('modelspec.hash_sha256', 'sshs_model_hash', 'sshs_legacy_hash') and not k.startswith('umbra.')}
        if not clean_metadata:
            metadata['modelspec.title'] = output.stem
            metadata['umbra.merge'] = json.dumps(provenance)
        metadata.update({'format': 'pt', 'umbra.creator': 'Umbra Studio', 'umbra.blueprint_id': blueprint['id']})
        save_file(merged, str(partial), metadata=metadata)
        del merged
        emit(phase='verifying', progress=98)
        inspected = inspect(partial)
        if inspected['tensors'].keys() != left['tensors'].keys():
            raise ValueError('Output verification failed.')
        digest = hashlib.sha256()
        with partial.open('rb') as source:
            while chunk := source.read(8 * 1024 * 1024):
                check_cancel()
                digest.update(chunk)
        record = {**blueprint, 'version': 1, 'kind': 'umbra-model-merge', 'family': left['family'], 'blockCount': left['blocks'], 'effectiveBlockWeights': {str(i): overrides.get(i, ratio) for i in range(left['blocks'])}, 'torchVersion': torch.__version__, 'provenance': provenance, 'output': {'name': output.name, 'bytes': partial.stat().st_size, 'sha256': digest.hexdigest()}, 'cleanMetadata': clean_metadata}
        blueprint_path.parent.mkdir(parents=True, exist_ok=True)
        with blueprint_partial.open('x', encoding='utf-8') as target:
            blueprint_staged = True
            json.dump(record, target, indent=2)
            target.flush()
            os.fsync(target.fileno())
        check_cancel()
        # Keep the private blueprint durable before making its model visible.
        os.link(blueprint_partial, blueprint_path)
        blueprint_published = True
        os.link(partial, output)
        model_published = True
        emit(phase='completed', progress=100, output=str(output))
    finally:
        partial.unlink(missing_ok=True)
        if blueprint_staged:
            blueprint_partial.unlink(missing_ok=True)
        if blueprint_published and not model_published:
            blueprint_path.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        request = json.loads(sys.stdin.read())
        if request['action'] == 'inspect':
            a, b = inspect_pair(request['a'], request['b'])
            emit(compatible=True, blocks=a['blocks'], family=a['family'], tensorCount=len(a['tensors']), bytes=a['bytes'], precision=sorted({v['dtype'] for v in a['tensors'].values()}), estimatedRamBytes=a['bytes'] * 3 + 1024 ** 3)
        else:
            merge(request)
    except Exception as error:
        emit(error=str(error))
        sys.exit(1)
