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
  previewUrl?: string;
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

function choice<const T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && choices.includes(value) ? value as T[number] : fallback;
}

export function getLtx23PassGuideScale(passIndex: number, passCount: 1 | 2 | 3): number {
  return passIndex === 0 && passCount > 1 ? 0.5 : 1;
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

export function isLtx23ComfyImageName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\\:\x00-\x1f]/.test(value)
    && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function normalizeLtx23OmniForgeControls(raw: unknown): Ltx23OmniForgeControls {
  const defaults = createDefaultLtx23OmniForgeControls();
  const value = record(raw);
  const tiled = record(value.tiledDecode);
  const chunk = record(value.chunkFeedForward);
  const nag = record(value.nag);
  const tuner = record(value.attentionTuner);
  const director = record(value.directorOptions);
  const output = record(value.outputEncoding);
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
      previewUrl: string(segment.previewUrl) || undefined,
    };
  }) : [];
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
      spatialTileSize: number(tiled.spatialTileSize, defaults.tiledDecode.spatialTileSize, 1, 8192, true),
      spatialOverlap: number(tiled.spatialOverlap, defaults.tiledDecode.spatialOverlap, 0, 8192, true),
      temporalTileSize: number(tiled.temporalTileSize, defaults.tiledDecode.temporalTileSize, 1, 10_000, true),
      temporalOverlap: number(tiled.temporalOverlap, defaults.tiledDecode.temporalOverlap, 0, 10_000, true),
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
  use_custom_audio: false;
  use_custom_motion: false;
}

// Mirrors the first-party LTXDirector editor's frame-space timeline and derived prompt widgets.
export function buildLtx23DirectorInputs(controls: Ltx23OmniForgeControls, frameRate: number, frames: number, globalPrompt: string): Ltx23DirectorInputs {
  const fps = number(frameRate, 24, 1, 240);
  const duration = number(frames, 120, 1, 10_000, true);
  const segments = controls.mainTrackEnabled ? [...controls.segments].sort((a, b) => a.start - b.start) : [];
  if (segments.some((segment) => segment.type === 'image' && !segment.sourceImageName)) {
    throw new Error('Upload an image for every image segment before generating.');
  }
  if (segments.some((segment) => segment.type === 'image' && !isLtx23ComfyImageName(segment.sourceImageName))) {
    throw new Error('Unsafe staged image path. Upload that image through ComfyUI before generating.');
  }
  const timelineSegments = segments.map((segment) => ({
    id: segment.id,
    start: segment.start,
    length: segment.length,
    prompt: segment.prompt,
    type: segment.type,
    ...(segment.type === 'image' ? { imageFile: segment.sourceImageName, guideStrength: segment.guideStrength } : {}),
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
  return {
    timeline_data: JSON.stringify({
      mainTrackEnabled: controls.mainTrackEnabled,
      audioTrackEnabled: false,
      motionTrackEnabled: false,
      global_prompt: globalPrompt,
      retakeMode: false,
      normalStartFrame: 0,
      normalDurationFrames: duration,
      segments: timelineSegments,
      audioSegments: [],
      motionSegments: [],
    }),
    local_prompts: prompts.join(' | '),
    segment_lengths: lengths.join(','),
    guide_strength: segments.filter((segment) => segment.type === 'image' && segment.start < duration)
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
    use_custom_audio: false,
    use_custom_motion: false,
  };
}
