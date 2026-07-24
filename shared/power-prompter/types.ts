import type { UmbraUiPipelineSelection } from '../umbra-ui/pipelineTypes';

export type PowerPrompterSourceType = 'tag' | 'character';
export type PowerPrompterAutocompleteMode = 'tags' | 'characters' | 'mixed';
export type PowerPrompterMatchMode = 'prefix' | 'wordBoundary' | 'substring';
export type PowerPrompterEditorMode = 'cards' | 'classic';
export type PowerPrompterCardType = 'character' | 'location' | 'expression' | 'action' | 'style' | 'custom';
export type PowerPrompterCardSuggestionScope = 'scoped' | 'all';
export type PowerPrompterSeedControlMode = 'fixed' | 'increment' | 'decrement' | 'randomize';
export type PowerPrompterSeedIncrement = 1 | 100 | 1000;
export type PowerPrompterStyleSeedMode = 'same' | 'different';
export type PowerPrompterModelType = 'checkpoint' | 'diffusers' | 'diffusion_model' | 'unet' | 'gguf';
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

export type PowerPrompterHiresResizeMode = 'scale' | 'dimensions';

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

export interface PowerPrompterGenerationControls {
  hiresFix?: PowerPrompterHiresFixControls;
  detailerPipeline?: PowerPrompterDetailerStage[];
  outputUpscale?: PowerPrompterOutputUpscaleControls;
  negativePrompt: string;
  seed: number;
  controlAfterGenerate: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
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
