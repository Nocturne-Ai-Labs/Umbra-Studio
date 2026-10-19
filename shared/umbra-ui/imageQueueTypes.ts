import type { ImagePipelineSettings } from './imagePipelineSettings';
import type { PowerPrompterDetailerStage, PowerPrompterHiresFixControls, PowerPrompterModelType, PowerPrompterOutputUpscaleControls, PowerPrompterSeedControlMode, PowerPrompterSeedIncrement, PowerPrompterTiledVaeControls } from '../power-prompter/types';
import type { UmbraUiLoraEntry } from '../../frontend/src/lib/umbraUiModels';
import type { UmbraUiPromptSegment } from '../../frontend/src/lib/umbraUiPromptSegments';

export type UmbraQueuePlacement = 'next' | 'end' | 'interrupt';

export interface UmbraImageQueueOptions {
  imagePipeline?: ImagePipelineSettings;
  prompt: string;
  promptSegments?: UmbraUiPromptSegment[];
  negativePrompt: string;
  modelFamily: string;
  modelType: PowerPrompterModelType;
  checkpointName: string;
  workflowResources: Record<string, string>;
  clipSkip: number;
  seed: number;
  seedMode: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  width: number;
  height: number;
  batchSize: number;
  hiresFix: PowerPrompterHiresFixControls;
  detailerPipeline: PowerPrompterDetailerStage[];
  outputUpscale: PowerPrompterOutputUpscaleControls;
  tiledVae: PowerPrompterTiledVaeControls;
  loras: UmbraUiLoraEntry[];
  outputMode?: 'txt2img' | 'img2img';
  outputFolder?: string;
  sourceImagePath?: string;
  sourceImageName?: string;
  denoise?: number;
  styleName?: string;
  queuePlacement?: UmbraQueuePlacement;
}
