import type { UmbraUiPipelineSelection } from '../../../shared/umbra-ui/pipelineTypes';

export type PowerPrompterSourceType = 'tag' | 'character';
export type PowerPrompterAutocompleteMode = 'tags' | 'characters' | 'mixed';
export type PowerPrompterMatchMode = 'prefix' | 'wordBoundary' | 'substring';
export type PowerPrompterEditorMode = 'cards' | 'classic';
export type PowerPrompterCardType = 'character' | 'location' | 'expression' | 'action' | 'style' | 'custom';
export type PowerPrompterCardSuggestionScope = 'scoped' | 'all';
export type PowerPrompterSeedControlMode = 'fixed' | 'increment' | 'decrement' | 'randomize';
export type PowerPrompterStyleSeedMode = 'same' | 'different';
export type PowerPrompterModelType = 'checkpoint' | 'diffusers' | 'diffusion_model' | 'unet' | 'gguf';
export type PowerPrompterMediaType = 'image' | 'video';
export type PowerPrompterHiresResizeMode = 'scale' | 'dimensions';
export type PowerPrompterVideoFamily = 'wan22' | 'ltx23';
export type PowerPrompterVideoMode = 'text_to_video' | 'image_to_video' | 'video_to_video';
export type PowerPrompterVideoFrameGuideMode = 'first' | 'first_last' | 'first_middle_last';
export type PowerPrompterVideoDecodeMode = 'auto' | 'full' | 'tiled';
export type PowerPrompterVideoUpscaleMode = 'none' | 'lanczos' | 'model' | 'rtx';
export type PowerPrompterVideoRtxQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export type PowerPrompterQueueTraversalMode = 'cycle' | 'exhaustive';
export type PowerPrompterQueueTraversalRole = 'hold' | 'cycle' | 'fast';
export type PowerPrompterCompletionSoundStyle =
  | 'glass_tick'
  | 'soft_chime'
  | 'muted_bell'
  | 'mellow_ping'
  | 'warm_click'
  | 'crystal_drop'
  | 'airy_pluck'
  | 'soft_mallet'
  | 'bamboo_tap'
  | 'quiet_blip'
  | 'silver_ping'
  | 'velvet_tone'
  | 'tiny_marimba'
  | 'hollow_knock'
  | 'amber_chime'
  | 'misty_note'
  | 'calm_beep'
  | 'soft_triangle'
  | 'dusk_ting'
  | 'studio_tick';

export interface PowerPrompterLoraEntry {
  id: string;
  name: string;
  strengthModel: number;
  strengthClip: number;
  enabled: boolean;
  queueEnabled: boolean;
  queueSetIds: number[];
}

export interface PowerPrompterWanVideoControls {
  highModel: string;
  lowModel: string;
  highLora: string;
  lowLora: string;
  highLoraStrength: number;
  lowLoraStrength: number;
  textEncoder: string;
  vae: string;
  clipVision: string;
  steps: number;
  splitStep: number;
  cfg: number;
  shift: number;
  highSamplerName: string;
  highScheduler: string;
  lowSamplerName: string;
  lowScheduler: string;
}

export interface PowerPrompterLtxVideoControls {
  checkpoint: string;
  textEncoder: string;
  distilledLora: string;
  distilledLoraStrength: number;
  promptLora: string;
  promptLoraStrength: number;
  latentUpscaleModel: string;
  audioVae: string;
  baseCfg: number;
  refineCfg: number;
  baseSamplerName: string;
  refineSamplerName: string;
  baseSigmas: string;
  refineSigmas: string;
  twoStage: boolean;
  audioEnabled: boolean;
  promptEnhance: boolean;
  imageStrength: number;
  imageCompression: number;
  keyframes: PowerPrompterLtxVideoKeyframe[];
}

export interface PowerPrompterLtxVideoKeyframe {
  id: string;
  sourceImagePath: string;
  sourceImageName: string;
  frameIndex: number;
  strength: number;
}

export interface PowerPrompterVideoPostprocessControls {
  interpolationEnabled: boolean;
  interpolationModel: string;
  interpolationMultiplier: number;
  upscaleMode: PowerPrompterVideoUpscaleMode;
  upscaleModel: string;
  upscaleScale: number;
  maxDimension: number;
  rtxQuality: PowerPrompterVideoRtxQuality;
}

export interface PowerPrompterVideoControls {
  family: PowerPrompterVideoFamily;
  mode: PowerPrompterVideoMode;
  frameGuideMode: PowerPrompterVideoFrameGuideMode;
  sourceImagePath: string;
  sourceImageName: string;
  middleImagePath: string;
  middleImageName: string;
  lastImagePath: string;
  lastImageName: string;
  sourceVideoPath: string;
  sourceVideoName: string;
  denoise: number;
  preserveSourceAudio: boolean;
  sourceAudioPath: string;
  sourceAudioName: string;
  resolutionPreset: string;
  aspectRatio: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  seed: number;
  seedMode: PowerPrompterSeedControlMode;
  outputPrefix: string;
  format: 'auto' | 'mp4';
  codec: 'auto' | 'h264';
  decodeMode: PowerPrompterVideoDecodeMode;
  decodeTileSize: number;
  decodeOverlap: number;
  temporalTileSize: number;
  temporalOverlap: number;
  postprocess: PowerPrompterVideoPostprocessControls;
  wan: PowerPrompterWanVideoControls;
  ltx: PowerPrompterLtxVideoControls;
}

export interface PowerPrompterHiresFixControls {
  enabled: boolean;
  upscaler: string;
  resizeMode: PowerPrompterHiresResizeMode;
  scaleBy: number;
  targetWidth: number;
  targetHeight: number;
  steps: number;
  denoise: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
}

export interface PowerPrompterDetailerStage {
  id: string;
  enabled: boolean;
  label: string;
  detectorModel: string;
  guideSize: number;
  guideSizeFor: 'bbox' | 'crop_region';
  maxSize: number;
  seedOffset: number;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  denoise: number;
  feather: number;
  noiseMask: boolean;
  forceInpaint: boolean;
  bboxThreshold: number;
  bboxDilation: number;
  bboxCropFactor: number;
  useSam: boolean;
  samModel: string;
  samDeviceMode: 'AUTO' | 'Prefer GPU' | 'CPU';
  samDetectionHint: string;
  samDilation: number;
  samThreshold: number;
  samBboxExpansion: number;
  samMaskHintThreshold: number;
  samMaskHintUseNegative: 'False' | 'Small' | 'Outter';
  dropSize: number;
  wildcard: string;
  cycle: number;
  noiseMaskFeather: number;
  tiledEncode: boolean;
  tiledDecode: boolean;
}

export interface PowerPrompterOutputUpscaleControls {
  enabled: boolean;
  modelName: string;
  maxDimension: number;
}

export interface PowerPrompterImg2ImgControls {
  sourceImagePath: string;
  sourceImageName: string;
  denoise: number;
}

export type PowerPrompterOutputOwner = 'power_prompter' | 'umbra_ui';
export type UmbraUiOutputMode = 'txt2img' | 'img2img' | 'img2vid' | 'txt2vid' | 'vid2vid' | 'inpainting' | 'extras';

export interface PowerPrompterGenerationControls {
  mediaType?: PowerPrompterMediaType;
  outputOwner?: PowerPrompterOutputOwner;
  outputMode?: UmbraUiOutputMode;
  img2img?: PowerPrompterImg2ImgControls;
  video?: PowerPrompterVideoControls;
  hiresFix?: PowerPrompterHiresFixControls;
  detailerPipeline?: PowerPrompterDetailerStage[];
  outputUpscale?: PowerPrompterOutputUpscaleControls;
  negativePrompt: string;
  seed: number;
  controlAfterGenerate: PowerPrompterSeedControlMode;
  steps: number;
  cfg: number;
  clipSkip: number;
  samplerName: string;
  scheduler: string;
  modelType: PowerPrompterModelType;
  checkpointName: string;
  workflowResources?: Record<string, string>;
  aspectRatio: string;
  swapDimensions: boolean;
  width: number;
  height: number;
  batchSize: number;
  loras: PowerPrompterLoraEntry[];
  thumbnailOverrides: Record<string, string[]>;
}

export interface PowerPrompterColors {
  general: string;
  artist: string;
  copyright: string;
  character: string;
  metadata: string;
}

export interface PowerPrompterAutocompleteSettings {
  mode: PowerPrompterAutocompleteMode;
  enabledSourceIds: string[];
  primarySourceId: string | null;
  matchMode: PowerPrompterMatchMode;
  minQueryLength: number;
  replaceUnderscores: boolean;
  appendComma: boolean;
}

export interface PowerPrompterSettings {
  colors: PowerPrompterColors;
  fuzzySensitivity: number;
  enabledCSVs: string[];
  editorMode: PowerPrompterEditorMode;
  queueTraversalMode: PowerPrompterQueueTraversalMode;
  queueDiversity: number;
  queuePromptLimit: number | null;
  queueShuffleEnabled: boolean;
  queueShuffleSeed: number;
  generationCompleteSoundEnabled: boolean;
  generationCompleteSoundStyle: PowerPrompterCompletionSoundStyle;
  generationCompleteSoundVolume: number;
  activePromptTypingSoundEnabled: boolean;
  activePromptTypingSoundStyle: PowerPrompterCompletionSoundStyle;
  activePromptTypingSoundVolume: number;
  autocomplete: PowerPrompterAutocompleteSettings;
}

export interface PowerPrompterCardNode {
  id: string;
  slotId: string;
  type: PowerPrompterCardType;
  label: string;
  variantName?: string;
  variantTags: string[];
  skipVariant?: boolean;
  text: string;
  randomEnabled: boolean;
  randomSetIds: number[];
  queueEnabled: boolean;
  queueSetIds: number[];
  queueTraversalRole?: PowerPrompterQueueTraversalRole;
  queueCycleWeights?: Record<string, number>;
  chainLinks?: string[];
  blockLinks?: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface PowerPrompterDeletedCardGroup {
  key: string;
  type: PowerPrompterCardType;
  label: string;
  deletedAt: string;
  cards: PowerPrompterCardNode[];
}

export interface PowerPrompterCardDocument {
  version: number;
  file: string | null;
  createdAt: string;
  updatedAt: string;
  modelType?: string;
  modelColor?: string;
  pipeline?: UmbraUiPipelineSelection;
  activeQueueSet: number;
  styleSeedMode?: PowerPrompterStyleSeedMode;
  generation: PowerPrompterGenerationControls;
  cards: PowerPrompterCardNode[];
  deletedCardGroups?: Record<string, PowerPrompterDeletedCardGroup>;
}

export interface PowerPrompterCsvSource {
  id: string;
  name: string;
  path: string;
  type: PowerPrompterSourceType;
  rowCount: number;
  modifiedAt: string | null;
}

export interface PowerPrompterSearchResult {
  tag: string;
  category: number;
  count?: number;
  aliases?: string;
  extra?: string;
  sourceId: string;
  sourceName: string;
  type: PowerPrompterSourceType;
  score?: number;
}
