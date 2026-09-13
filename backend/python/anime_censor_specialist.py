"""Local-only inference for the separately installed, hash-pinned anatomy model."""
import base64
import contextlib
import hashlib
import importlib
import io
import os
import sys

os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['TORCH_FORCE_WEIGHTS_ONLY_LOAD'] = '1'

MODEL_SHA256 = 'b446188e3663395a0af8a8a48bf19a3a684959fd7be7bc46b0c9c5ec0e98aa96'
CLASSES = {
    'ultralytics.nn.modules.head': ['Segment', 'Detect'],
    'ultralytics.nn.modules.block': ['SPPF', 'Proto', 'C2f', 'Bottleneck', 'DFL', 'C2PSA', 'Attention', 'PSABlock', 'C3k2', 'C3k'],
    'ultralytics.nn.modules.conv': ['Concat', 'Conv', 'DWConv'],
    'ultralytics.nn.tasks': ['SegmentationModel'],
    'ultralytics.utils': ['IterableSimpleNamespace'],
    'ultralytics.utils.loss': ['v8SegmentationLoss', 'BboxLoss'],
    'ultralytics.utils.tal': ['TaskAlignedAssigner'],
    'torch.nn.modules.upsampling': ['Upsample'],
    'torch.nn.modules.batchnorm': ['BatchNorm2d'],
    'torch.nn.modules.conv': ['Conv2d', 'ConvTranspose2d'],
    'torch.nn.modules.activation': ['SiLU'],
    'torch.nn.modules.pooling': ['MaxPool2d'],
    'torch.nn.modules.container': ['Sequential', 'ModuleList'],
    'torch.nn.modules.loss': ['BCEWithLogitsLoss'],
    'torch.nn.modules.linear': ['Identity'],
}


def detect_specialist(model_path, image_path, threshold, padding=0, censor_threshold=None):
    import numpy as np
    try:
        import torch
        from PIL import Image, ImageOps
        from ultralytics import YOLO
    except ImportError as error:
        raise RuntimeError('Paired censoring needs PyTorch, Ultralytics and Pillow in the managed ComfyUI Python environment. See CENSORING.md for setup; no fallback output was generated.') from error

    with open(model_path, 'rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != MODEL_SHA256:
            raise ValueError('The anatomy specialist model failed its integrity check.')
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    allowlist = [getattr(importlib.import_module(module), name)
                 for module, names in CLASSES.items() for name in names]
    with contextlib.redirect_stdout(sys.stderr), torch.serialization.safe_globals(allowlist):
        model = YOLO(str(model_path), task='segment')
    if model.names != {0: 'penis'}:
        raise ValueError('Unexpected anatomy specialist class mapping.')
    with Image.open(image_path) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    width, height = image.size
    with contextlib.redirect_stdout(sys.stderr):
        result = model.predict(image, device='cpu', conf=censor_threshold or threshold, classes=[0],
                               imgsz=1024, retina_masks=True, verbose=False)[0]
    rows = []
    if censor_threshold is not None and threshold < censor_threshold:
        # Keep the original full-resolution censor pass unchanged. Weak candidates
        # use bounded inference-size masks, never hundreds of source-sized masks.
        with contextlib.redirect_stdout(sys.stderr):
            candidates = model.predict(image, device='cpu', conf=threshold, classes=[0],
                                       imgsz=1024, retina_masks=False, verbose=False)[0]
        for box in candidates.boxes:
            score = float(box.conf.item())
            if score >= censor_threshold:
                continue
            left, top, right, bottom = box.xyxy[0].cpu().tolist()
            rows.append({'label': 'penis', 'score': score, 'reviewOnly': True,
                         'x': left / width, 'y': top / height,
                         'width': (right-left) / width, 'height': (bottom-top) / height,
                         'maskKind': 'box-fallback'})
        del candidates
    if result.masks is None:
        if len(result.boxes):
            raise ValueError('Anatomy detection returned boxes without outline masks.')
        return rows
    if len(result.boxes) != len(result.masks.data):
        raise ValueError('Anatomy detection returned mismatched masks.')
    for box, raw_mask in zip(result.boxes, result.masks.data):
        mask = Image.fromarray((raw_mask.cpu().numpy() > 0.5).astype(np.uint8) * 255)
        if mask.size != image.size:
            raise ValueError('Anatomy mask dimensions do not match the source image.')
        bounds = mask.getbbox()
        if not bounds:
            raise ValueError('Anatomy detection returned an empty outline.')
        if padding > 0:
            import math
            from anime_censor_segmentation import expand_mask
            radius = math.ceil(min(bounds[2]-bounds[0], bounds[3]-bounds[1]) * padding)
            mask = expand_mask(mask, radius)
            bounds = mask.getbbox()
        left, top, right, bottom = bounds
        buffer = io.BytesIO()
        mask.crop(bounds).save(buffer, format='PNG')
        rows.append({'label': 'penis', 'score': float(box.conf.item()),
                     'x': left / width, 'y': top / height,
                     'width': (right-left) / width, 'height': (bottom-top) / height,
                     'maskKind': 'contour', 'maskPngBase64': base64.b64encode(buffer.getvalue()).decode('ascii')})
    return rows
