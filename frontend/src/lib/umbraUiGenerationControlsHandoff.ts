import {
  normalizePowerPrompterCardDocument,
  normalizePowerPrompterGenerationControls,
} from '@/lib/powerPrompter';
import type {
  PowerPrompterCardDocument,
  PowerPrompterGenerationControls,
} from '@/types/powerPrompter';
import { normalizeUmbraUiPipelineSelection } from '../../../shared/umbra-ui/pipelineTypes';

export const UMBRA_UI_GENERATION_CONTROLS_HANDOFF_KEY = 'umbra-ui:pending-generation-controls-handoff';
export const UMBRA_UI_GENERATION_CONTROLS_HANDOFF_EVENT = 'umbra:umbra-ui-generation-controls-handoff';

export interface UmbraUiGenerationControlsHandoff {
  version: 1;
  modelFamily: string;
  pipelineName: string;
  generation: PowerPrompterGenerationControls;
  createdAt: number;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeUmbraUiGenerationControlsHandoff(
  value: unknown,
): UmbraUiGenerationControlsHandoff | null {
  const source = normalizeRecord(value);
  const modelFamily = String(source.modelFamily || '').trim();
  if (!modelFamily) return null;
  const generation = normalizePowerPrompterGenerationControls(source.generation);
  return {
    version: 1,
    modelFamily,
    pipelineName: String(source.pipelineName || '').trim(),
    generation: {
      ...generation,
      outputOwner: 'power_prompter',
      outputMode: 'txt2img',
      outputFolder: '',
    },
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now(),
  };
}

export function applyUmbraUiGenerationControlsToPowerPrompterDocument(
  document: PowerPrompterCardDocument,
  value: unknown,
  file?: string | null,
): PowerPrompterCardDocument | null {
  const handoff = normalizeUmbraUiGenerationControlsHandoff(value);
  if (!handoff) return null;
  const normalizedDocument = normalizePowerPrompterCardDocument(document, file ?? document.file);
  const existingOutputFolder = normalizedDocument.generation.outputFolder || '';
  const generation = normalizePowerPrompterGenerationControls({
    ...handoff.generation,
    mediaType: 'image',
    outputOwner: 'power_prompter',
    outputMode: 'txt2img',
    outputFolder: existingOutputFolder,
  });
  return {
    ...normalizedDocument,
    file: file ?? normalizedDocument.file,
    modelType: handoff.modelFamily,
    pipeline: normalizeUmbraUiPipelineSelection({
      feature: 'txt2img',
      modelFamily: handoff.modelFamily,
      modelSource: generation.modelType,
    }),
    generation,
    updatedAt: new Date().toISOString(),
  };
}

export function stageUmbraUiGenerationControlsHandoff(
  detail: Pick<UmbraUiGenerationControlsHandoff, 'modelFamily' | 'pipelineName' | 'generation'>,
): UmbraUiGenerationControlsHandoff {
  const payload = normalizeUmbraUiGenerationControlsHandoff({
    ...detail,
    version: 1,
    createdAt: Date.now(),
  });
  if (!payload) throw new Error('Select a model pipeline before sending controls to Power Prompter.');
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(UMBRA_UI_GENERATION_CONTROLS_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      // The live event still supports an already-mounted Power Prompter workspace.
    }
    window.dispatchEvent(new CustomEvent(UMBRA_UI_GENERATION_CONTROLS_HANDOFF_EVENT, { detail: payload }));
  }
  return payload;
}

export function takePendingUmbraUiGenerationControlsHandoff(): UmbraUiGenerationControlsHandoff | null {
  if (typeof window === 'undefined') return null;
  let stored = '';
  try {
    stored = window.sessionStorage.getItem(UMBRA_UI_GENERATION_CONTROLS_HANDOFF_KEY) || '';
    window.sessionStorage.removeItem(UMBRA_UI_GENERATION_CONTROLS_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    return normalizeUmbraUiGenerationControlsHandoff(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearPendingUmbraUiGenerationControlsHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(UMBRA_UI_GENERATION_CONTROLS_HANDOFF_KEY);
  } catch {
    // Best effort only.
  }
}
