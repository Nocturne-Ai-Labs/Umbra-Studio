import {
  buildLtx23DirectorInputs,
  getLtx23ColorReferenceImageName,
  getLtx23PassGuideScale,
  normalizeLtx23OmniForgeControls,
  type Ltx23OmniForgeControls,
} from '../shared/umbra-ui/ltx23OmniForge';
import { normalizeUmbraVideoLoraStack } from '../shared/umbra-ui/videoLoraStack';
import { readComfyInputChoices } from '../shared/umbra-ui/comfyInputChoices';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface Ltx23OmniForgeNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta: Record<string, unknown>;
}
export type Ltx23OmniForgeGraph = Record<string, Ltx23OmniForgeNode>;
type Link = [string, number];

export function isLtx23OmniForgeWorkflow(graph: Record<string, unknown>): boolean {
  return Object.values(graph).some((entry) => (entry as Ltx23OmniForgeNode)?._meta?.umbra_role === 'ltx23_omniforge_model');
}

export function assertLtx23StagedMediaName(value: string): void {
  if (!value || /^[\\/]|^[a-z]:/i.test(value) || /[\\:\x00-\x1f]/.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('LTX Director media must be uploaded to this ComfyUI instance. Choose the media again.');
  }
}

/** Umbra-owned API wiring; upstream workflow and custom-node implementations stay external. */
export function buildLtx23OmniForgeWorkflow(options: {
  controls: Ltx23OmniForgeControls;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  seed: number;
  loraStack?: unknown;
  audioEnabled?: boolean;
}): Ltx23OmniForgeGraph {
  const controls = normalizeLtx23OmniForgeControls(options.controls);
  if (!Number.isInteger(options.frames) || options.frames < 9 || options.frames > 9993 || (options.frames - 1) % 8 !== 0) {
    throw new Error('LTX Director requires 8n+1 frames, from 9 to 9993. Shorten the video or adjust its frame count.');
  }
  if (![options.width, options.height].every((value) => Number.isInteger(value) && value >= 64 && value <= 8192 && value % 32 === 0)) {
    throw new Error('LTX Director width and height must be multiples of 32, from 64 to 8192.');
  }
  const graph: Ltx23OmniForgeGraph = {};
  const add = (id: string, classType: string, inputs: Record<string, unknown>, role = ''): Link => {
    graph[id] = { class_type: classType, inputs, _meta: { title: `LTX OmniForge ${id}`, ...(role ? { umbra_role: role } : {}) } };
    return [id, 0];
  };
  const resource = (id: string, inputName: string, kind: string, label: string) => {
    graph[id]._meta.umbra_resources = [{ id: `omniforge.${id}`, inputName, kind, label, required: true }];
  };
  let model = controls.modelSource === 'gguf'
    ? add('model', 'UnetLoaderGGUF', { unet_name: controls.modelName }, 'ltx23_omniforge_model')
    : add('model', 'UNETLoader', { unet_name: controls.modelName, weight_dtype: 'default' }, 'ltx23_omniforge_model');
  resource('model', 'unet_name', controls.modelSource === 'gguf' ? 'gguf' : 'unet', 'LTX-2.3 transformer');
  graph.model._meta.umbra_media_type = 'video';
  graph.model._meta.umbra_video_family = 'ltx23';
  graph.model._meta.umbra_ui_pipelines = ['txt2vid', 'img2vid'].map((feature) => ({
    feature, modelFamily: 'LTX-2.3 OmniForge', modelSources: ['unet', 'gguf'], priority: 100,
  }));
  let clip = add('encoder', controls.textEncoderSource === 'gguf' ? 'DualCLIPLoaderGGUF' : 'DualCLIPLoader', {
    clip_name1: controls.textEncoder, clip_name2: controls.connector, type: 'ltxv',
    ...(controls.textEncoderSource === 'safetensors' ? { device: 'default' } : {}),
  });
  graph.encoder._meta.umbra_resources = [
    { id: 'omniforge.encoder', inputName: 'clip_name1', kind: 'text_encoder', label: 'Gemma text encoder', required: true },
    { id: 'omniforge.connector', inputName: 'clip_name2', kind: 'text_encoder', label: 'LTX-2.3 text projection', required: true },
  ];
  let videoVae = add('video_vae', 'VAELoaderKJ', { vae_name: controls.videoVae, device: 'main_device', weight_dtype: 'bf16' });
  resource('video_vae', 'vae_name', 'vae', 'LTX-2.3 video VAE');
  if (controls.tritonVae.enabled) videoVae = add('triton_vae', 'PatchTritonVAE', {
    vae: videoVae, fuse_norm_silu: controls.tritonVae.fuseNormSilu, channels_last: controls.tritonVae.channelsLast,
    int8_conv: controls.tritonVae.int8Conv, autotune: controls.tritonVae.autotune,
  });
  const audioVae = add('audio_vae', 'VAELoaderKJ', { vae_name: controls.audioVae, device: 'main_device', weight_dtype: 'bf16' });
  resource('audio_vae', 'vae_name', 'vae', 'LTX-2.3 audio VAE');
  const loras = normalizeUmbraVideoLoraStack(options.loraStack).filter((entry) => entry.family === 'ltx23');
  model = add('loras', 'DaSiWa_LTX2LoraLoader', {
    model, clip, model_type: 'LTX-2.3', use_cache: false,
    stack_data: JSON.stringify(loras.map((entry) => ({
      on: entry.enabled, lora: entry.name || 'None', str: entry.strength,
      vs: entry.visualStrength ?? 1, as: entry.audioStrength ?? 1,
    }))),
  });
  clip = ['loras', 1];
  const positive = add('prompt', 'PrimitiveStringMultiline', { value: options.prompt }, 'positive_prompt');
  const negative = add('negative', 'CLIPTextEncode', { clip, text: options.negativePrompt }, 'negative_prompt');
  const directorInputs = buildLtx23DirectorInputs(controls, options.fps, options.frames, options.prompt);
  if ((directorInputs.use_custom_audio || directorInputs.override_audio) && options.audioEnabled === false) {
    throw new Error('The LTX Director has a custom audio track. Enable "Include audio in output" or disable that track before queueing.');
  }
  add('director', 'LTXDirector', {
    ...directorInputs, model, clip, audio_vae: audioVae, global_prompt: positive,
    epsilon: controls.directorOptions.epsilon, inpaint_audio: controls.inpaintAudio, display_mode: 'seconds', custom_width: options.width,
    custom_height: options.height, resize_method: controls.directorOptions.resizeMethod, divisible_by: 32,
    img_compression: controls.directorOptions.imageCompression,
  }, 'ltx23_omniforge_director');
  model = ['director', 0];
  model = add('torch_settings', 'ModelPatchTorchSettings', { model, enable_fp16_accumulation: controls.fp16Accumulation });
  if (controls.attentionBackend) model = add('attention', 'ModelAttentionBackend', { model, attention: controls.attentionBackend });
  if (controls.chunkFeedForward.enabled) model = add('chunk', 'LTXVChunkFeedForward', { model, chunks: controls.chunkFeedForward.chunks, dim_threshold: 4096 });
  if (controls.attentionTuner.enabled) {
    const tuner = controls.attentionTuner;
    if (tuner.blocks && !/^\d+(\s*,\s*\d+)*$/.test(tuner.blocks.trim())) throw new Error('Attention tuner blocks must be comma-separated nonnegative block numbers.');
    model = add('attention_tuner', 'LTX2AttentionTunerPatch', {
      model, blocks: tuner.blocks, video_scale: tuner.videoScale, audio_scale: tuner.audioScale,
      audio_to_video_scale: tuner.audioToVideoScale, video_to_audio_scale: tuner.videoToAudioScale, triton_kernels: tuner.tritonKernels,
    });
  }
  if (controls.nag.enabled) model = add('nag', 'LTX2_NAG', {
    model, nag_scale: controls.nag.scale, nag_alpha: controls.nag.alpha, nag_tau: controls.nag.tau,
    nag_cond_video: negative, nag_cond_audio: negative, inplace: true,
  });
  if (controls.samplingPreview.enabled) {
    const previewVae = add('preview_vae', 'VAELoaderKJ', { vae_name: controls.samplingPreview.previewVae, device: 'main_device', weight_dtype: 'bf16' });
    resource('preview_vae', 'vae_name', 'vae', 'LTX preview TAE');
    model = add('sampling_preview', 'LTX2SamplingPreviewOverride', { model, vae: previewVae, preview_rate: controls.samplingPreview.previewRate });
  }
  add('conditioning', 'LTXVConditioning', { positive: ['director', 1], negative, frame_rate: options.fps });
  const noise = add('noise', 'RandomNoise', { noise_seed: options.seed });
  let latent: Link = ['director', 2];
  let audio: Link = ['director', 3];
  let pos: Link = ['conditioning', 0];
  let neg: Link = ['conditioning', 1];
  let upscale: Link | undefined;
  if (controls.passCount > 1) {
    upscale = add('latent_upscaler', 'LatentUpscaleModelLoader', { model_name: controls.latentUpscaleModel });
    resource('latent_upscaler', 'model_name', 'model', 'LTX-2.3 x2 latent upscaler');
  }
  // Each pass carries the previous audio latent and cropped relay conditioning forward.
  for (let index = 0; index < controls.passCount; index += 1) {
    const prefix = `pass_${index + 1}`;
    const pass = controls.passes[index];
    if (index === 1) latent = add(`${prefix}_upscale`, 'LTXVLatentUpsampler', { samples: latent, upscale_model: upscale, vae: videoVae });
    if (index === 2) {
      add(`${prefix}_crop_input`, 'LTXVCropGuides', { positive: pos, negative: neg, latent });
      pos = [`${prefix}_crop_input`, 0]; neg = [`${prefix}_crop_input`, 1]; latent = [`${prefix}_crop_input`, 2];
    }
    add(`${prefix}_guide`, 'LTXDirectorGuide', {
      positive: pos, negative: neg, vae: videoVae, latent, guide_data: ['director', 4], motion_guide_data: ['director', 5], model,
      ic_lora_name: pass.icLoraName || 'None', ic_lora_strength: pass.icLoraStrength, scale_by: getLtx23PassGuideScale(index, controls.passCount),
      upscale_method: 'bicubic', image_attention_strength: pass.imageAttentionStrength, crop: 'center',
      auto_snap_ic_grid: true, use_tiled_encode: false, tile_size: 512, tile_overlap: 128, retake_mode: controls.retake.enabled,
    });
    const passModel: Link = [`${prefix}_guide`, 3];
    const guider = add(`${prefix}_guider`, 'CFGGuider', { model: passModel, positive: [`${prefix}_guide`, 0], negative: [`${prefix}_guide`, 1], cfg: pass.cfg });
    const sigmas = add(`${prefix}_sigmas`, 'BasicScheduler', { model: passModel, scheduler: pass.scheduler, steps: pass.steps, denoise: pass.denoise });
    const sampler = add(`${prefix}_sampler`, 'KSamplerSelect', { sampler_name: pass.sampler });
    const av = add(`${prefix}_av`, 'LTXVConcatAVLatent', { video_latent: [`${prefix}_guide`, 2], audio_latent: audio });
    const sampled = add(`${prefix}_sample`, 'SamplerCustomAdvanced', { noise, guider, sampler, sigmas, latent_image: av });
    add(`${prefix}_separate`, 'LTXVSeparateAVLatent', { av_latent: sampled });
    audio = [`${prefix}_separate`, 1];
    const cropClass = index === 2 ? 'LTXVCropGuides' : 'LTXDirectorCropGuides';
    add(`${prefix}_crop`, cropClass, { positive: [`${prefix}_guide`, 0], negative: [`${prefix}_guide`, 1], latent: [`${prefix}_separate`, 0] });
    pos = [`${prefix}_crop`, 0]; neg = [`${prefix}_crop`, 1]; latent = [`${prefix}_crop`, 2];
  }
  let decoded = controls.tiledDecode.enabled
    ? add('decode', 'LTXVSpatioTemporalTiledVAEDecode', {
      vae: videoVae, latents: latent, spatial_tiles: controls.tiledDecode.spatialTileSize,
      spatial_overlap: controls.tiledDecode.spatialOverlap, temporal_tile_length: controls.tiledDecode.temporalTileSize,
      temporal_overlap: controls.tiledDecode.temporalOverlap, last_frame_fix: false, working_device: 'auto', working_dtype: 'auto',
    })
    : add('decode', 'VAEDecode', { vae: videoVae, samples: latent });
  if (controls.colorTransfer.enabled) {
    const referenceName = getLtx23ColorReferenceImageName(controls);
    assertLtx23StagedMediaName(referenceName);
    const reference = add('color_reference', 'LoadImage', { image: referenceName });
    const color = controls.colorTransfer;
    decoded = add('color_transfer', 'ColorTransfer', {
      image_target: decoded, image_ref: reference, method: color.method, source_stats: color.sourceStats,
      ...(color.sourceStats === 'target_frame' ? { 'source_stats.target_index': color.targetIndex } : {}), strength: color.strength,
    });
  }
  if (controls.resize.enabled) {
    const resize = controls.resize;
    decoded = add('resize', 'DaSiWa_TorchResize', {
      image: decoded, size_mode: resize.sizeMode, aspect_mode: resize.aspectMode, target_width: resize.targetWidth,
      target_height: resize.targetHeight, scale_multiplier: resize.scaleMultiplier, interpolation: resize.interpolation,
      gamma_correct: resize.gammaCorrect, divisible_by: resize.divisibleBy, pad_color: resize.padColor,
      crop_position: resize.cropPosition, batch_size: resize.batchSize, max_batch_megapixels: resize.maxBatchMegapixels,
      cache_size: resize.cacheSize,
    });
  }
  if (controls.modelUpscale.enabled) {
    const upscale = controls.modelUpscale;
    const upscaleModel = add('pixel_upscale_model', 'UpscaleModelLoader', { model_name: upscale.modelName });
    resource('pixel_upscale_model', 'model_name', 'model', 'Pixel upscale model');
    decoded = add('pixel_upscale', 'UpscaleWithModelAdvanced', {
      upscale_model: upscaleModel, image: decoded, max_batch_size: upscale.maxBatchSize, tile_size: upscale.tileSize,
      channels_last: upscale.channelsLast, precision: upscale.precision,
    });
  }
  if (controls.rtx.enabled) {
    const rtx = controls.rtx;
    decoded = add('rtx', 'DaSiWa_RTX_UpscalerRefiner', {
      images: decoded, denoise: rtx.denoise, denoise_quality: rtx.denoiseQuality, deblur: rtx.deblur,
      deblur_quality: rtx.deblurQuality, upscale: rtx.upscale, upscale_quality: rtx.upscaleQuality,
      resize_type: rtx.resizeType, scale: rtx.scale, megapixels: rtx.megapixels, width: rtx.width, height: rtx.height,
      divisible_by: rtx.divisibleBy, ratio_preset: rtx.ratioPreset, resize_method: rtx.resizeMethod, device_id: rtx.deviceId,
      empty_cache: rtx.emptyCache, use_mmap: rtx.useMmap, auto_unload_models: rtx.autoUnloadModels,
      chunking: rtx.chunking, lossless_fp16: rtx.losslessFp16, chunk_frames: rtx.chunkFrames,
    });
  }
  controls.watermarks.forEach((mark, index) => {
    if (!mark.enabled) return;
    assertLtx23StagedMediaName(mark.imageName);
    decoded = add(`watermark_${index + 1}`, 'DaSiWa_Watermark', {
      images: decoded, watermark_path: mark.imageName, position: mark.position, scale: mark.scale,
      resampling: mark.resampling, transparency: mark.transparency, rotation: mark.rotation,
      padding_x: mark.paddingX, padding_y: mark.paddingY, optical_padding: mark.opticalPadding,
      optical_strength: mark.opticalStrength, random_switches: mark.randomSwitches, fade: mark.fade,
      fade_margin: mark.fadeMargin, randomize_position: mark.randomizePosition, random_seed: mark.randomSeed,
    });
  });
  const decodedAudio = options.audioEnabled === false ? undefined : add('audio_decode', 'LTXVAudioVAEDecode', { samples: audio, audio_vae: audioVae });
  const encoding = controls.outputEncoding;
  add('output', 'DaSiWa_EnhancedVideoCombine', {
    images: decoded, ...(decodedAudio ? { audio: decodedAudio } : {}), frame_rate: options.fps,
    codec: encoding.codec, container: encoding.container, bit_depth: encoding.bitDepth, quality: encoding.quality,
    log_level: 'Standard', pingpong: encoding.pingpong,
    save_metadata: true, filename_prefix: 'video/Umbra_LTX23_OmniForge', save_output: true, pass_frames: false,
    crop_to_audio: encoding.cropToAudio, audio_codec: encoding.audioCodec, audio_bitrate: encoding.audioBitrate,
    save_first_frame: encoding.saveFirstFrame, save_last_frame: encoding.saveLastFrame,
    seed: options.seed,
  }, 'video_output');
  return graph;
}

export async function assertLtx23OmniForgeStagedMedia(graph: Ltx23OmniForgeGraph, inputRoot: string): Promise<void> {
  const timeline = JSON.parse(String(graph.director.inputs.timeline_data));
  const names: string[] = [
    ...timeline.segments.filter((item: { type: string }) => item.type === 'image').map((item: { imageFile: string }) => item.imageFile),
    ...timeline.audioSegments.map((item: { audioFile: string }) => item.audioFile),
    ...timeline.motionSegments.map((item: { videoFile: string }) => item.videoFile),
    ...(timeline.retakeVideo ? [timeline.retakeVideo.imageFile] : []),
    ...Object.values(graph).filter((node) => node.class_type === 'DaSiWa_Watermark').map((node) => String(node.inputs.watermark_path)),
  ];
  if (!names.length) return;
  const root = await realpath(inputRoot).catch(() => '');
  for (const name of new Set(names)) {
    assertLtx23StagedMediaName(name);
    const path = root ? await realpath(resolve(root, name)).catch(() => '') : '';
    const rel = path && root ? relative(root, path) : '';
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)
      || !await stat(path).then((info) => info.isFile()).catch(() => false)) {
      throw new Error(`LTX Director media '${name}' is unavailable in this ComfyUI instance. Select or upload that file again.`);
    }
  }
}

export function assertLtx23OmniForgeRuntime(graph: Ltx23OmniForgeGraph, objectInfo: Record<string, unknown>): void {
  const loraDefinition = objectInfo.LoraLoaderModelOnly as { input?: { required?: { lora_name?: [unknown] } } } | undefined;
  const loraChoices = readComfyInputChoices(loraDefinition?.input?.required?.lora_name);
  for (const node of Object.values(graph)) {
    if (node.class_type !== 'DaSiWa_LTX2LoraLoader') continue;
    const stack = JSON.parse(String(node.inputs.stack_data || '[]')) as Array<{ on: boolean; lora: string }>;
    for (const entry of stack) {
      if (!entry.on || entry.lora === 'None') continue;
      const selected = entry.lora.replace(/\\/g, '/').toLowerCase();
      const matches = Array.isArray(loraChoices) ? loraChoices.filter((name) => typeof name === 'string' && name.replace(/\\/g, '/').toLowerCase() === selected) : [];
      if (matches.length !== 1) throw new Error(`LTX OmniForge LoRA '${entry.lora}' is missing or ambiguous. Refresh the catalog and select an installed LoRA.`);
      entry.lora = String(matches[0]);
    }
    node.inputs.stack_data = JSON.stringify(stack);
  }
  for (const node of Object.values(graph)) {
    const definition = objectInfo[node.class_type] as { input?: { required?: Record<string, [unknown, unknown?]>; optional?: Record<string, [unknown, unknown?]> } } | undefined;
    if (!definition) {
      const repair = node.class_type === 'LTXVSpatioTemporalTiledVAEDecode'
        ? 'install/update the LTX OmniForge tiled-decode pack'
        : node.class_type === 'UpscaleWithModelAdvanced'
          ? 'install/update the LTX OmniForge pixel-upscale pack (WhiteRabbit)'
          : node.class_type === 'UnetLoaderGGUF' || node.class_type === 'DualCLIPLoaderGGUF'
            ? 'install/update GGUF support'
            : 'update ComfyUI and install/update the LTX OmniForge pack';
      throw new Error(`LTX OmniForge needs ${node.class_type}. Open Umbra Updater > ComfyUI dependencies, ${repair}, then restart ComfyUI.`);
    }
    const required = { ...definition.input?.required };
    const optional = { ...definition.input?.optional };
    // Comfy v3 exposes nested selector inputs only under the selected dynamic option.
    for (const [name, schema] of Object.entries({ ...required, ...optional })) {
      if (schema[0] !== 'COMFY_DYNAMICCOMBO_V3') continue;
      const options = (schema[1] as { options?: Array<{ key: string; inputs?: { required?: Record<string, [unknown, unknown?]>; optional?: Record<string, [unknown, unknown?]> } }> })?.options || [];
      const selected = options.find((option) => option.key === node.inputs[name]);
      if (!selected) throw new Error(`LTX OmniForge ${node.class_type}: ${name} is unavailable. Refresh its options.`);
      for (const [key, input] of Object.entries(selected.inputs?.required || {})) required[`${name}.${key}`] = input;
      for (const [key, input] of Object.entries(selected.inputs?.optional || {})) optional[`${name}.${key}`] = input;
    }
    for (const name of Object.keys(required)) {
      if (!(name in node.inputs)) throw new Error(`LTX OmniForge node ${node.class_type} changed its required inputs (${name}). Update Umbra and its managed custom nodes together.`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const schema = required[name] || optional[name];
      if (!schema) throw new Error(`LTX OmniForge node ${node.class_type} no longer accepts ${name}. Update Umbra and its managed custom nodes together.`);
      const choices = readComfyInputChoices(schema);
      if (choices && typeof value === 'string' && !choices.includes(value)) {
        const normalized = value.replace(/\\/g, '/').toLowerCase();
        const matches = choices.filter((entry) => typeof entry === 'string' && entry.replace(/\\/g, '/').toLowerCase() === normalized);
        if (matches.length === 1) { node.inputs[name] = matches[0]; continue; }
      }
      if (choices && !Array.isArray(value) && !choices.includes(value)) {
        throw new Error(`LTX OmniForge ${node.class_type}: ${name} '${String(value)}' is unavailable. Select an installed model/option or refresh the catalog after updating ComfyUI dependencies.`);
      }
      const limits = schema[1] as { min?: number; max?: number } | undefined;
      if (typeof value === 'number' && (!Number.isFinite(value)
        || (schema[0] === 'INT' && !Number.isInteger(value))
        || (typeof limits?.min === 'number' && value < limits.min)
        || (typeof limits?.max === 'number' && value > limits.max))) {
        throw new Error(`LTX OmniForge ${node.class_type}: ${name} is outside this runtime's supported range. Adjust the setting or update ComfyUI dependencies.`);
      }
    }
  }
}
