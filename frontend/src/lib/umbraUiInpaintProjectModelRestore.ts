import type { PowerPrompterModelType } from '@/types/powerPrompter';
import type { UmbraUiLoraEntry } from '@/lib/umbraUiModels';

interface InpaintProjectModelSettings {
  modelFamily: string;
  modelSource: string;
  loras: UmbraUiLoraEntry[];
}

const MODEL_SOURCES: PowerPrompterModelType[] = ['checkpoint', 'diffusers', 'diffusion_model', 'unet', 'gguf'];

interface InpaintProjectModelCallbacks {
  onModelFamilyChange: (family: string) => void;
  onModelSourceChange: (source: PowerPrompterModelType) => void;
  onLorasChange: (loras: UmbraUiLoraEntry[], family?: string) => void;
}

export function restoreUmbraUiInpaintProjectModels(
  generation: InpaintProjectModelSettings,
  callbacks: InpaintProjectModelCallbacks,
): void {
  if (generation.modelFamily) callbacks.onModelFamilyChange(generation.modelFamily);
  // These callbacks run in one React event, before modelFamily and modelSource props update.
  const modelSource = MODEL_SOURCES.find((source) => source === generation.modelSource);
  if (modelSource) callbacks.onModelSourceChange(modelSource);
  callbacks.onLorasChange(generation.loras, generation.modelFamily || undefined);
}
