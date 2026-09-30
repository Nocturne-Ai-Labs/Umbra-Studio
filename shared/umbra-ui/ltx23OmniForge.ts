export type Ltx23ModelSource = 'safetensors' | 'gguf';
export type Ltx23DirectorSegmentType = 'image' | 'text';

export interface Ltx23DirectorSegment {
  id: string;
  type: Ltx23DirectorSegmentType;
  start: number;
  length: number;
  prompt: string;
  guideStrength: number;
  sourceImageName: string;
  sourcePath?: string;
  isEndFrame: boolean;
  previewUrl?: string;
}

export interface Ltx23DirectorMotionSegment {
  id: string;
  type: 'motion_video';
  start: number;
  length: number;
  trimStart: number;
  videoDurationFrames: number;
  videoFile: string;
  sourcePath?: string;
  videoStrength: number;
  videoAttentionStrength: number;
  resampleMode: 'nearest' | 'bilinear';
  previewUrl?: string;
}

export interface Ltx23DirectorAudioSegment {
  id: string;
  type: 'audio';
  start: number;
  length: number;
  trimStart: number;
  audioDurationFrames: number;
  audioFile: string;
  sourcePath?: string;
  previewUrl?: string;
}

export interface Ltx23DirectorRetake {
  enabled: boolean;
  start: number;
  length: number;
  prompt: string;
  strength: number;
  video: { imageFile: string; videoDurationFrames: number; sourcePath?: string; previewUrl?: string } | null;
}

export interface Ltx23Watermark {
  enabled: boolean;
  imageName: string;
  sourcePath?: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  scale: number;
  resampling: 'bicubic' | 'bilinear' | 'nearest' | 'area' | 'nearest-exact';
  transparency: number;
  rotation: number;
  paddingX: number;
  paddingY: number;
  opticalPadding: boolean;
  opticalStrength: number;
  randomSwitches: number;
  fade: boolean;
  fadeMargin: number;
  randomizePosition: boolean;
  randomSeed: number;
  previewUrl?: string;
}

export interface Ltx23OmniForgeResize {
  enabled: boolean;
  sizeMode: 'Multiplier' | 'Target resolution';
  aspectMode: 'Stretch' | 'Fit' | 'Fill and crop' | 'Fit and pad' | 'Long side with divisible crop';
  targetWidth: number;
  targetHeight: number;
  scaleMultiplier: number;
  interpolation: 'Nearest' | 'Bilinear' | 'Bicubic' | 'Area' | 'Lanczos';
  gammaCorrect: boolean;
  divisibleBy: number;
  padColor: string;
  cropPosition: string;
  batchSize: number;
  maxBatchMegapixels: number;
  cacheSize: number;
}

export interface Ltx23OmniForgeModelUpscale {
  enabled: boolean;
  modelName: string;
  maxBatchSize: number;
  tileSize: number;
  channelsLast: boolean;
  precision: 'fp32' | 'fp16' | 'bf16';
}

export interface Ltx23OmniForgeRtx {
  enabled: boolean;
  denoise: boolean;
  denoiseQuality: 'Low' | 'Medium' | 'High' | 'Ultra';
  deblur: boolean;
  deblurQuality: 'Low' | 'Medium' | 'High' | 'Ultra';
  upscale: 'Off' | 'VSR' | 'High Bitrate';
  upscaleQuality: 'Low' | 'Medium' | 'High' | 'Ultra';
  resizeType: 'Keep Ratio' | 'Manual' | 'Preset Ratio' | 'Scale' | 'Same Size';
  scale: number;
  megapixels: number;
  width: number;
  height: number;
  divisibleBy: '8' | '16' | '32' | '64' | '128';
  ratioPreset: '1:1' | '4:3' | '3:2' | '16:9' | '21:9';
  resizeMethod: 'Center Crop (Fill)' | 'Letterbox (Fit)';
  deviceId: number;
  emptyCache: boolean;
  useMmap: boolean;
  autoUnloadModels: boolean;
  chunking: boolean;
  losslessFp16: boolean;
  chunkFrames: number;
}

export interface Ltx23OmniForgePass {
  sampler: string;
  scheduler: string;
  steps: number;
  denoise: number;
  cfg: number;
  imageAttentionStrength: number;
  icLoraName: string;
  icLoraStrength: number;
}

export interface Ltx23OmniForgeControls {
  enabled: boolean;
  modelSource: Ltx23ModelSource;
  modelName: string;
  textEncoderSource: Ltx23ModelSource;
  textEncoder: string;
  connector: string;
  videoVae: string;
  audioVae: string;
  latentUpscaleModel: string;
  passCount: 1 | 2 | 3;
  passes: [Ltx23OmniForgePass, Ltx23OmniForgePass, Ltx23OmniForgePass];
  tiledDecode: {
    enabled: boolean;
    spatialTileSize: number;
    spatialOverlap: number;
    temporalTileSize: number;
    temporalOverlap: number;
  };
  chunkFeedForward: { enabled: boolean; chunks: number };
  nag: { enabled: boolean; scale: number; tau: number; alpha: number };
  attentionBackend: string;
  attentionTuner: {
    enabled: boolean;
    blocks: string;
    videoScale: number;
    audioScale: number;
    audioToVideoScale: number;
    videoToAudioScale: number;
    tritonKernels: boolean;
  };
  fp16Accumulation: boolean;
  directorOptions: {
    resizeMethod: 'maintain aspect ratio' | 'stretch to fit' | 'pad' | 'pad green' | 'crop';
    imageCompression: number;
    epsilon: number;
  };
  outputEncoding: {
    codec: 'Auto' | 'AV1' | 'VP9' | 'H.265 (HEVC)' | 'H.264';
    container: 'Auto' | 'WebM' | 'MKV' | 'MP4';
    quality: number;
    bitDepth: 'Auto' | '8-bit' | '10-bit';
    pingpong: boolean;
    cropToAudio: boolean;
    audioCodec: 'Auto' | 'AAC' | 'Opus' | 'MP3';
    audioBitrate: '64k' | '96k' | '128k' | '160k' | '192k' | '256k' | '320k';
    saveFirstFrame: boolean;
    saveLastFrame: boolean;
  };
  mainTrackEnabled: boolean;
  segments: Ltx23DirectorSegment[];
  audioTrackEnabled: boolean;
  motionTrackEnabled: boolean;
  useCustomAudio: boolean;
  useCustomMotion: boolean;
  overrideAudio: boolean;
  inpaintAudio: boolean;
  audioSegments: Ltx23DirectorAudioSegment[];
  motionSegments: Ltx23DirectorMotionSegment[];
  retake: Ltx23DirectorRetake;
  tritonVae: { enabled: boolean; fuseNormSilu: boolean; channelsLast: boolean; int8Conv: boolean; autotune: boolean };
  samplingPreview: { enabled: boolean; previewVae: string; previewRate: number };
  colorTransfer: {
    enabled: boolean;
    method: 'reinhard_lab' | 'mkl_lab' | 'histogram';
    sourceStats: 'per_frame' | 'uniform' | 'target_frame';
    targetIndex: number;
    strength: number;
  };
  watermarks: [Ltx23Watermark, Ltx23Watermark];
  resize: Ltx23OmniForgeResize;
  modelUpscale: Ltx23OmniForgeModelUpscale;
  rtx: Ltx23OmniForgeRtx;
}

const DEFAULT_PASSES: Ltx23OmniForgeControls['passes'] = [
  { sampler: 'euler_cfg_pp', scheduler: 'linear_quadratic', steps: 8, denoise: 1, cfg: 1, imageAttentionStrength: 0.8, icLoraName: 'None', icLoraStrength: 1 },
  { sampler: 'euler_cfg_pp', scheduler: 'linear_quadratic', steps: 4, denoise: 0.4, cfg: 1, imageAttentionStrength: 0.8, icLoraName: 'None', icLoraStrength: 1 },
  { sampler: 'euler_cfg_pp', scheduler: 'linear_quadratic', steps: 2, denoise: 0.2, cfg: 1, imageAttentionStrength: 0.9, icLoraName: 'None', icLoraStrength: 1 },
];

const RESIZE_METHODS = ['maintain aspect ratio', 'stretch to fit', 'pad', 'pad green', 'crop'] as const;
const VIDEO_CODECS = ['Auto', 'AV1', 'VP9', 'H.265 (HEVC)', 'H.264'] as const;
const VIDEO_CONTAINERS = ['Auto', 'WebM', 'MKV', 'MP4'] as const;
const BIT_DEPTHS = ['Auto', '8-bit', '10-bit'] as const;
const AUDIO_CODECS = ['Auto', 'AAC', 'Opus', 'MP3'] as const;
const AUDIO_BITRATES = ['64k', '96k', '128k', '160k', '192k', '256k', '320k'] as const;
const WATERMARK_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'] as const;
const WATERMARK_RESAMPLING = ['bicubic', 'bilinear', 'nearest', 'area', 'nearest-exact'] as const;
const COLOR_METHODS = ['reinhard_lab', 'mkl_lab', 'histogram'] as const;
const COLOR_STATS = ['per_frame', 'uniform', 'target_frame'] as const;
const RESIZE_ASPECTS = ['Stretch', 'Fit', 'Fill and crop', 'Fit and pad', 'Long side with divisible crop'] as const;
const RESIZE_INTERPOLATIONS = ['Nearest', 'Bilinear', 'Bicubic', 'Area', 'Lanczos'] as const;
const CROP_POSITIONS = ['center', 'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
const RTX_QUALITIES = ['Low', 'Medium', 'High', 'Ultra'] as const;
const RTX_RESIZE_TYPES = ['Keep Ratio', 'Manual', 'Preset Ratio', 'Scale', 'Same Size'] as const;
const RTX_DIVISORS = ['8', '16', '32', '64', '128'] as const;
const RTX_RATIOS = ['1:1', '4:3', '3:2', '16:9', '21:9'] as const;

function choice<const T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && choices.includes(value) ? value as T[number] : fallback;
}

export function getLtx23PassGuideScale(passIndex: number, passCount: 1 | 2 | 3): number {
  return passIndex === 0 && passCount > 1 ? 0.5 : 1;
}

function defaultWatermark(position: Ltx23Watermark['position']): Ltx23Watermark {
  return {
    enabled: false, imageName: '', position, scale: 0.12, resampling: 'bicubic', transparency: 0.35,
    rotation: 0, paddingX: 20, paddingY: 20, opticalPadding: false, opticalStrength: 0.4,
    randomSwitches: 3, fade: false, fadeMargin: 0.1, randomizePosition: false, randomSeed: 0,
  };
}

export function createDefaultLtx23OmniForgeControls(): Ltx23OmniForgeControls {
  return {
    enabled: false,
    modelSource: 'safetensors',
    modelName: '',
    textEncoderSource: 'safetensors',
    textEncoder: '',
    connector: '',
    videoVae: '',
    audioVae: '',
    latentUpscaleModel: '',
    passCount: 3,
    passes: DEFAULT_PASSES.map((pass) => ({ ...pass })) as Ltx23OmniForgeControls['passes'],
    tiledDecode: { enabled: false, spatialTileSize: 4, spatialOverlap: 4, temporalTileSize: 32, temporalOverlap: 8 },
    chunkFeedForward: { enabled: false, chunks: 2 },
    nag: { enabled: false, scale: 11, tau: 2.5, alpha: 0.25 },
    attentionBackend: '',
    attentionTuner: {
      enabled: false, blocks: '', videoScale: 1, audioScale: 1,
      audioToVideoScale: 1, videoToAudioScale: 1, tritonKernels: true,
    },
    fp16Accumulation: true,
    directorOptions: { resizeMethod: 'maintain aspect ratio', imageCompression: 18, epsilon: 0.001 },
    outputEncoding: {
      codec: 'Auto', container: 'Auto', quality: 20, bitDepth: 'Auto', pingpong: false,
      cropToAudio: false, audioCodec: 'Auto', audioBitrate: '192k', saveFirstFrame: false, saveLastFrame: false,
    },
    mainTrackEnabled: true,
    segments: [],
    audioTrackEnabled: false,
    motionTrackEnabled: false,
    useCustomAudio: false,
    useCustomMotion: false,
    overrideAudio: false,
    inpaintAudio: true,
    audioSegments: [],
    motionSegments: [],
    retake: { enabled: false, start: 24, length: 48, prompt: '', strength: 1, video: null },
    tritonVae: { enabled: false, fuseNormSilu: true, channelsLast: true, int8Conv: true, autotune: false },
    samplingPreview: { enabled: false, previewVae: '', previewRate: 24 },
    colorTransfer: { enabled: false, method: 'reinhard_lab', sourceStats: 'per_frame', targetIndex: 0, strength: 0.75 },
    watermarks: [defaultWatermark('top-left'), defaultWatermark('top-right')],
    resize: {
      enabled: false, sizeMode: 'Multiplier', aspectMode: 'Fit', targetWidth: 1920, targetHeight: 1080,
      scaleMultiplier: 2, interpolation: 'Nearest', gammaCorrect: true, divisibleBy: 1, padColor: '0, 0, 0',
      cropPosition: 'center', batchSize: 0, maxBatchMegapixels: 16, cacheSize: 64,
    },
    modelUpscale: { enabled: false, modelName: '', maxBatchSize: 0, tileSize: 0, channelsLast: false, precision: 'fp32' },
    rtx: {
      enabled: false, denoise: true, denoiseQuality: 'Ultra', deblur: true, deblurQuality: 'Ultra',
      upscale: 'VSR', upscaleQuality: 'Ultra', resizeType: 'Scale', scale: 2, megapixels: 2,
      width: 1920, height: 1080, divisibleBy: '32', ratioPreset: '16:9', resizeMethod: 'Center Crop (Fill)',
      deviceId: 0, emptyCache: false, useMmap: true, autoUnloadModels: true, chunking: true,
      losslessFp16: true, chunkFrames: 16,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : bounded;
}

export function isLtx23ComfyInputName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\\:\x00-\x1f]/.test(value)
    && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export const isLtx23ComfyImageName = isLtx23ComfyInputName;

export function normalizeLtx23OmniForgeControls(raw: unknown): Ltx23OmniForgeControls {
  const defaults = createDefaultLtx23OmniForgeControls();
  const value = record(raw);
  const tiled = record(value.tiledDecode);
  const chunk = record(value.chunkFeedForward);
  const nag = record(value.nag);
  const tuner = record(value.attentionTuner);
  const director = record(value.directorOptions);
  const output = record(value.outputEncoding);
  const retake = record(value.retake);
  const retakeVideo = record(retake.video);
  const triton = record(value.tritonVae);
  const preview = record(value.samplingPreview);
  const color = record(value.colorTransfer);
  const resize = record(value.resize);
  const modelUpscale = record(value.modelUpscale);
  const rtx = record(value.rtx);
  const usedIds = new Set<string>();
  const segments = Array.isArray(value.segments) ? value.segments.map((item, index) => {
    const segment = record(item);
    let id = string(segment.id).trim() || `segment-${index + 1}`;
    if (usedIds.has(id)) id = `segment-${index + 1}-${id}`;
    usedIds.add(id);
    const sourceImageName = string(segment.sourceImageName);
    return {
      id,
      type: segment.type === 'image' ? 'image' as const : 'text' as const,
      start: number(segment.start, 0, 0, 10_000, true),
      length: number(segment.length, 1, 1, 10_000, true),
      prompt: string(segment.prompt),
      guideStrength: number(segment.guideStrength, 1, 0, 1),
      sourceImageName,
      sourcePath: string(segment.sourcePath) || undefined,
      isEndFrame: segment.isEndFrame === true,
      previewUrl: string(segment.previewUrl) || undefined,
    };
  }) : [];
  const audioSegments: Ltx23DirectorAudioSegment[] = Array.isArray(value.audioSegments) ? value.audioSegments.map((item, index) => {
    const segment = record(item);
    return {
      id: string(segment.id).trim() || `audio-${index + 1}`,
      type: 'audio',
      start: number(segment.start, 0, 0, 10_000, true),
      length: number(segment.length, 1, 1, 10_000, true),
      trimStart: number(segment.trimStart, 0, 0, 10_000, true),
      audioDurationFrames: number(segment.audioDurationFrames, 0, 0, 10_000, true),
      audioFile: string(segment.audioFile),
      sourcePath: string(segment.sourcePath) || undefined,
      previewUrl: string(segment.previewUrl) || undefined,
    };
  }) : [];
  const motionSegments: Ltx23DirectorMotionSegment[] = Array.isArray(value.motionSegments) ? value.motionSegments.map((item, index) => {
    const segment = record(item);
    return {
      id: string(segment.id).trim() || `motion-${index + 1}`,
      type: 'motion_video',
      start: number(segment.start, 0, 0, 10_000, true),
      length: number(segment.length, 1, 1, 10_000, true),
      trimStart: number(segment.trimStart, 0, 0, 10_000, true),
      videoDurationFrames: number(segment.videoDurationFrames, 0, 0, 10_000, true),
      videoFile: string(segment.videoFile),
      sourcePath: string(segment.sourcePath) || undefined,
      videoStrength: number(segment.videoStrength, 1, 0, 1),
      videoAttentionStrength: number(segment.videoAttentionStrength, 0.65, 0, 1),
      resampleMode: choice(segment.resampleMode, ['nearest', 'bilinear'] as const, 'nearest'),
      previewUrl: string(segment.previewUrl) || undefined,
    };
  }) : [];
  const watermarkValues = Array.isArray(value.watermarks) ? value.watermarks : [];
  const watermarks = [0, 1].map((index) => {
    const watermark = record(watermarkValues[index]);
    const defaults = defaultWatermark(index === 0 ? 'top-left' : 'top-right');
    return {
      enabled: watermark.enabled === true,
      imageName: string(watermark.imageName),
      sourcePath: string(watermark.sourcePath) || undefined,
      position: choice(watermark.position, WATERMARK_POSITIONS, defaults.position),
      scale: number(watermark.scale, defaults.scale, 0.01, 1),
      resampling: choice(watermark.resampling, WATERMARK_RESAMPLING, defaults.resampling),
      transparency: number(watermark.transparency, defaults.transparency, 0, 1),
      rotation: number(watermark.rotation, defaults.rotation, 0, 359, true),
      paddingX: number(watermark.paddingX, defaults.paddingX, 0, 4096, true),
      paddingY: number(watermark.paddingY, defaults.paddingY, 0, 4096, true),
      opticalPadding: watermark.opticalPadding === true,
      opticalStrength: number(watermark.opticalStrength, defaults.opticalStrength, 0, 1),
      randomSwitches: number(watermark.randomSwitches, defaults.randomSwitches, 1, 64, true),
      fade: watermark.fade === true,
      fadeMargin: number(watermark.fadeMargin, defaults.fadeMargin, 0.01, 0.5),
      randomizePosition: watermark.randomizePosition === true,
      randomSeed: number(watermark.randomSeed, defaults.randomSeed, 0, 2_147_483_647, true),
      previewUrl: string(watermark.previewUrl) || undefined,
    };
  }) as [Ltx23Watermark, Ltx23Watermark];
  return {
    enabled: value.enabled === true,
    modelSource: value.modelSource === 'gguf' ? 'gguf' : 'safetensors',
    modelName: string(value.modelName),
    textEncoderSource: value.textEncoderSource === 'gguf' ? 'gguf' : 'safetensors',
    textEncoder: string(value.textEncoder),
    connector: string(value.connector),
    videoVae: string(value.videoVae),
    audioVae: string(value.audioVae),
    latentUpscaleModel: string(value.latentUpscaleModel),
    passCount: value.passCount === 1 || value.passCount === 2 ? value.passCount : 3,
    passes: defaults.passes.map((pass, index) => {
      const incoming = record(Array.isArray(value.passes) ? value.passes[index] : null);
      return {
        sampler: string(incoming.sampler, pass.sampler),
        scheduler: string(incoming.scheduler, pass.scheduler),
        steps: number(incoming.steps, pass.steps, 1, 10_000, true),
        denoise: number(incoming.denoise, pass.denoise, 0, 1),
        cfg: number(incoming.cfg, pass.cfg, 0, 100),
        imageAttentionStrength: number(incoming.imageAttentionStrength, pass.imageAttentionStrength, 0, 1),
        icLoraName: string(incoming.icLoraName, pass.icLoraName),
        icLoraStrength: number(incoming.icLoraStrength, pass.icLoraStrength, 0, 10),
      };
    }) as Ltx23OmniForgeControls['passes'],
    tiledDecode: {
      enabled: tiled.enabled === true,
      spatialTileSize: number(tiled.spatialTileSize, defaults.tiledDecode.spatialTileSize, 1, 8, true),
      spatialOverlap: number(tiled.spatialOverlap, defaults.tiledDecode.spatialOverlap, 0, 8, true),
      temporalTileSize: number(tiled.temporalTileSize, defaults.tiledDecode.temporalTileSize, 2, 1000, true),
      temporalOverlap: number(tiled.temporalOverlap, defaults.tiledDecode.temporalOverlap, 0, 8, true),
    },
    chunkFeedForward: {
      enabled: chunk.enabled === true,
      chunks: number(chunk.chunks, defaults.chunkFeedForward.chunks, 1, 100, true),
    },
    nag: {
      enabled: nag.enabled === true,
      scale: number(nag.scale, defaults.nag.scale, 0, 100),
      tau: number(nag.tau, defaults.nag.tau, 0, 10),
      alpha: number(nag.alpha, defaults.nag.alpha, 0, 1),
    },
    attentionBackend: string(value.attentionBackend),
    attentionTuner: {
      enabled: tuner.enabled === true,
      blocks: string(tuner.blocks),
      videoScale: number(tuner.videoScale, 1, 0, 10),
      audioScale: number(tuner.audioScale, 1, 0, 10),
      audioToVideoScale: number(tuner.audioToVideoScale, 1, 0, 10),
      videoToAudioScale: number(tuner.videoToAudioScale, 1, 0, 10),
      tritonKernels: tuner.tritonKernels !== false,
    },
    fp16Accumulation: value.fp16Accumulation !== false,
    directorOptions: {
      resizeMethod: choice(director.resizeMethod, RESIZE_METHODS, 'maintain aspect ratio'),
      imageCompression: number(director.imageCompression, 18, 0, 100, true),
      epsilon: number(director.epsilon, 0.001, 0.0001, 0.99),
    },
    outputEncoding: {
      codec: choice(output.codec, VIDEO_CODECS, 'Auto'),
      container: choice(output.container, VIDEO_CONTAINERS, 'Auto'),
      quality: number(output.quality, 20, 0, 51, true),
      bitDepth: choice(output.bitDepth, BIT_DEPTHS, 'Auto'),
      pingpong: output.pingpong === true,
      cropToAudio: output.cropToAudio === true,
      audioCodec: choice(output.audioCodec, AUDIO_CODECS, 'Auto'),
      audioBitrate: choice(output.audioBitrate, AUDIO_BITRATES, '192k'),
      saveFirstFrame: output.saveFirstFrame === true,
      saveLastFrame: output.saveLastFrame === true,
    },
    mainTrackEnabled: value.mainTrackEnabled !== false,
    segments,
    audioTrackEnabled: value.audioTrackEnabled === true,
    motionTrackEnabled: value.motionTrackEnabled === true,
    useCustomAudio: value.useCustomAudio === true,
    useCustomMotion: value.useCustomMotion === true,
    overrideAudio: value.overrideAudio === true,
    inpaintAudio: value.inpaintAudio !== false,
    audioSegments,
    motionSegments,
    retake: {
      enabled: retake.enabled === true,
      start: number(retake.start, 24, 0, 10_000, true),
      length: number(retake.length, 48, 1, 10_000, true),
      prompt: string(retake.prompt),
      strength: number(retake.strength, 1, 0, 1),
      video: retake.video && typeof retake.video === 'object' ? {
        imageFile: string(retakeVideo.imageFile),
        videoDurationFrames: number(retakeVideo.videoDurationFrames, 0, 0, 10_000, true),
        sourcePath: string(retakeVideo.sourcePath) || undefined,
        previewUrl: string(retakeVideo.previewUrl) || undefined,
      } : null,
    },
    tritonVae: {
      enabled: triton.enabled === true,
      fuseNormSilu: triton.fuseNormSilu !== false,
      channelsLast: triton.channelsLast !== false,
      int8Conv: triton.int8Conv !== false,
      autotune: triton.autotune === true,
    },
    samplingPreview: {
      enabled: preview.enabled === true,
      previewVae: string(preview.previewVae),
      previewRate: number(preview.previewRate, 24, 1, 240, true),
    },
    colorTransfer: {
      enabled: color.enabled === true,
      method: choice(color.method, COLOR_METHODS, 'reinhard_lab'),
      sourceStats: choice(color.sourceStats, COLOR_STATS, 'per_frame'),
      targetIndex: number(color.targetIndex, 0, 0, 10_000, true),
      strength: number(color.strength, 0.75, 0, 10),
    },
    watermarks,
    resize: {
      enabled: resize.enabled === true,
      sizeMode: choice(resize.sizeMode, ['Multiplier', 'Target resolution'] as const, 'Multiplier'),
      aspectMode: choice(resize.aspectMode, RESIZE_ASPECTS, 'Fit'),
      targetWidth: number(resize.targetWidth, 1920, 1, 16_384, true),
      targetHeight: number(resize.targetHeight, 1080, 1, 16_384, true),
      scaleMultiplier: number(resize.scaleMultiplier, 2, 0.01, 16),
      interpolation: choice(resize.interpolation, RESIZE_INTERPOLATIONS, 'Nearest'),
      gammaCorrect: resize.gammaCorrect !== false,
      divisibleBy: number(resize.divisibleBy, 1, 1, 4096, true),
      padColor: string(resize.padColor, '0, 0, 0'),
      cropPosition: choice(resize.cropPosition, CROP_POSITIONS, 'center'),
      batchSize: number(resize.batchSize, 0, 0, 4096, true),
      maxBatchMegapixels: number(resize.maxBatchMegapixels, 16, 0.25, 512),
      cacheSize: number(resize.cacheSize, 64, 1, 512, true),
    },
    modelUpscale: {
      enabled: modelUpscale.enabled === true,
      modelName: string(modelUpscale.modelName),
      maxBatchSize: number(modelUpscale.maxBatchSize, 0, 0, 4096, true),
      tileSize: number(modelUpscale.tileSize, 0, 0, 8192, true),
      channelsLast: modelUpscale.channelsLast === true,
      precision: choice(modelUpscale.precision, ['fp32', 'fp16', 'bf16'] as const, 'fp32'),
    },
    rtx: {
      enabled: rtx.enabled === true,
      denoise: rtx.denoise !== false,
      denoiseQuality: choice(rtx.denoiseQuality, RTX_QUALITIES, 'Ultra'),
      deblur: rtx.deblur !== false,
      deblurQuality: choice(rtx.deblurQuality, RTX_QUALITIES, 'Ultra'),
      upscale: choice(rtx.upscale, ['Off', 'VSR', 'High Bitrate'] as const, 'VSR'),
      upscaleQuality: choice(rtx.upscaleQuality, RTX_QUALITIES, 'Ultra'),
      resizeType: choice(rtx.resizeType, RTX_RESIZE_TYPES, 'Scale'),
      scale: number(rtx.scale, 2, 1, 4),
      megapixels: number(rtx.megapixels, 2, 0.01, 64),
      width: number(rtx.width, 1920, 64, 8192, true),
      height: number(rtx.height, 1080, 64, 8192, true),
      divisibleBy: choice(rtx.divisibleBy, RTX_DIVISORS, '32'),
      ratioPreset: choice(rtx.ratioPreset, RTX_RATIOS, '16:9'),
      resizeMethod: choice(rtx.resizeMethod, ['Center Crop (Fill)', 'Letterbox (Fit)'] as const, 'Center Crop (Fill)'),
      deviceId: number(rtx.deviceId, 0, 0, 8, true),
      emptyCache: rtx.emptyCache === true,
      useMmap: rtx.useMmap !== false,
      autoUnloadModels: rtx.autoUnloadModels !== false,
      chunking: rtx.chunking !== false,
      losslessFp16: rtx.losslessFp16 !== false,
      chunkFrames: number(rtx.chunkFrames, 16, 1, 1024, true),
    },
  };
}

export interface Ltx23DirectorInputs {
  timeline_data: string;
  local_prompts: string;
  segment_lengths: string;
  guide_strength: string;
  global_prompt: string;
  start_frame: number;
  end_frame: number;
  duration_frames: number;
  start_second: number;
  end_second: number;
  duration_seconds: number;
  frame_rate: number;
  resize_method: Ltx23OmniForgeControls['directorOptions']['resizeMethod'];
  img_compression: number;
  epsilon: number;
  use_custom_audio: boolean;
  use_custom_motion: boolean;
  override_audio: boolean;
  inpaint_audio: boolean;
}

export function getLtx23ColorReferenceImageName(controls: Ltx23OmniForgeControls): string {
  if (!controls.mainTrackEnabled || controls.retake.enabled) {
    throw new Error('Color transfer needs an active main timeline image.');
  }
  const image = controls.segments.filter((segment) => segment.type === 'image')
    .sort((a, b) => a.start - b.start)[0];
  if (!image || !isLtx23ComfyInputName(image.sourceImageName)) {
    throw new Error('Color transfer needs a staged image in the main timeline.');
  }
  return image.sourceImageName;
}

// Mirrors the first-party LTXDirector editor's frame-space timeline and derived prompt widgets.
export function buildLtx23DirectorInputs(controls: Ltx23OmniForgeControls, frameRate: number, frames: number, globalPrompt: string): Ltx23DirectorInputs {
  const fps = number(frameRate, 24, 1, 240);
  const duration = number(frames, 120, 1, 10_000, true);
  const retakeActive = controls.retake.enabled;
  const segments = controls.mainTrackEnabled && !retakeActive ? [...controls.segments].sort((a, b) => a.start - b.start) : [];
  if (segments.some((segment) => segment.type === 'image' && !segment.sourceImageName)) {
    throw new Error('Upload an image for every image segment before generating.');
  }
  if (segments.some((segment) => segment.type === 'image' && !isLtx23ComfyImageName(segment.sourceImageName))) {
    throw new Error('Unsafe staged image path. Upload that image through ComfyUI before generating.');
  }
  if (segments.some((segment) => segment.prompt.includes('|')) || (retakeActive && controls.retake.prompt.includes('|'))) {
    throw new Error('Director prompts cannot contain the pipe delimiter (|).');
  }
  if (segments.some((segment) => segment.start >= duration || segment.start + segment.length > duration)) {
    throw new Error('Main timeline segment exceeds the requested frame range.');
  }
  if (segments.some((segment, index) => index > 0 && segments[index - 1].start + segments[index - 1].length > segment.start)) {
    throw new Error('Main timeline segments cannot overlap.');
  }
  if (retakeActive && (!controls.retake.video || !isLtx23ComfyInputName(controls.retake.video.imageFile)
    || controls.retake.video.videoDurationFrames < 1)) {
    throw new Error('Retake needs a staged base video with a known duration.');
  }
  if (retakeActive && controls.retake.start + controls.retake.length > controls.retake.video!.videoDurationFrames) {
    throw new Error('Retake region exceeds the staged base video.');
  }
  if (retakeActive && controls.retake.start + controls.retake.length > duration) {
    throw new Error('Retake region exceeds the requested frame range.');
  }
  const activeAudio = !retakeActive && controls.audioTrackEnabled && controls.useCustomAudio && !controls.overrideAudio;
  const activeMotion = !retakeActive && controls.motionTrackEnabled && controls.useCustomMotion;
  const overrideAudio = activeMotion && controls.overrideAudio;
  const audioSegments = activeAudio ? controls.audioSegments : [];
  const motionSegments = activeMotion ? controls.motionSegments : [];
  if (activeAudio && !audioSegments.length) throw new Error('Add a staged audio segment or disable custom audio.');
  if (activeMotion && !motionSegments.length) throw new Error('Add a staged motion segment or disable custom motion.');
  if (audioSegments.some((segment) => !isLtx23ComfyInputName(segment.audioFile)
    || segment.audioDurationFrames < 1 || segment.trimStart + segment.length > segment.audioDurationFrames
    || segment.start + segment.length > duration)) {
    throw new Error('Audio segment needs a safe staged file and a trim within its duration.');
  }
  if (motionSegments.some((segment) => !isLtx23ComfyInputName(segment.videoFile)
    || segment.videoDurationFrames < 1 || segment.trimStart + segment.length > segment.videoDurationFrames
    || segment.start + segment.length > duration)) {
    throw new Error('Motion segment needs a safe staged file and a trim within its duration.');
  }
  const timelineSegments = segments.map((segment) => ({
    id: segment.id,
    start: segment.start,
    length: segment.length,
    prompt: segment.prompt,
    type: segment.type,
    ...(segment.type === 'image' ? {
      imageFile: segment.sourceImageName, guideStrength: segment.guideStrength, isEndFrame: segment.isEndFrame,
    } : {}),
  }));
  const prompts: string[] = [];
  const lengths: number[] = [];
  let cursor = 0;
  let pendingGap = 0;
  for (const segment of segments) {
    if (segment.start >= duration) break;
    const start = Math.max(0, segment.start);
    if (start > cursor) {
      const gap = start - cursor;
      if (lengths.length) lengths[lengths.length - 1] += gap;
      else pendingGap += gap;
    }
    const length = Math.min(segment.length, duration - start);
    if (length <= 0) continue;
    lengths.push(length + pendingGap);
    prompts.push(segment.prompt);
    pendingGap = 0;
    cursor = Math.max(cursor, start + segment.length);
  }
  if (lengths.length && cursor < duration) lengths[lengths.length - 1] += duration - cursor;
  if (retakeActive) {
    const start = Math.min(duration, controls.retake.start);
    const end = Math.min(duration, controls.retake.start + controls.retake.length);
    if (start > 0) {
      lengths.push(start);
      prompts.push(globalPrompt || 'video');
    }
    if (end > start) {
      lengths.push(end - start);
      prompts.push(controls.retake.prompt || 'video');
    }
    if (end < duration) {
      lengths.push(duration - end);
      prompts.push(globalPrompt || 'video');
    }
  }
  const retakeStrengths = retakeActive ? lengths.map((_, index) => (
    index === (controls.retake.start > 0 ? 1 : 0) ? controls.retake.strength.toFixed(2) : '0.00'
  )).join(',') : '';
  return {
    timeline_data: JSON.stringify({
      mainTrackEnabled: controls.mainTrackEnabled && !retakeActive,
      audioTrackEnabled: activeAudio,
      motionTrackEnabled: activeMotion,
      global_prompt: globalPrompt,
      retake_global_prompt: globalPrompt,
      overrideAudio,
      inpaint_audio: controls.inpaintAudio,
      retakeMode: retakeActive,
      retakeStart: controls.retake.start,
      retakeLength: controls.retake.length,
      retakePrompt: controls.retake.prompt,
      retakeStrength: controls.retake.strength,
      retakeVideo: retakeActive ? {
        imageFile: controls.retake.video!.imageFile,
        videoDurationFrames: controls.retake.video!.videoDurationFrames,
      } : null,
      normalStartFrame: 0,
      normalDurationFrames: duration,
      segments: timelineSegments,
      audioSegments: audioSegments.map((segment) => ({
        id: segment.id, type: 'audio', start: segment.start, length: segment.length,
        trimStart: segment.trimStart, audioDurationFrames: segment.audioDurationFrames, audioFile: segment.audioFile,
      })),
      motionSegments: motionSegments.map((segment) => ({
        id: segment.id, type: 'motion_video', start: segment.start, length: segment.length,
        trimStart: segment.trimStart, videoDurationFrames: segment.videoDurationFrames, videoFile: segment.videoFile,
        videoStrength: segment.videoStrength, videoAttentionStrength: segment.videoAttentionStrength,
        resampleMode: segment.resampleMode,
      })),
    }),
    local_prompts: prompts.join(' | '),
    segment_lengths: lengths.join(','),
    guide_strength: retakeActive ? retakeStrengths : segments.filter((segment) => segment.type === 'image' && segment.start < duration)
      .map((segment) => segment.guideStrength.toFixed(2)).join(','),
    global_prompt: globalPrompt,
    start_frame: 0,
    end_frame: duration,
    duration_frames: duration,
    start_second: 0,
    end_second: duration / fps,
    duration_seconds: duration / fps,
    frame_rate: fps,
    resize_method: controls.directorOptions.resizeMethod,
    img_compression: controls.directorOptions.imageCompression,
    epsilon: controls.directorOptions.epsilon,
    use_custom_audio: activeAudio,
    use_custom_motion: activeMotion,
    override_audio: overrideAudio,
    inpaint_audio: controls.inpaintAudio,
  };
}
