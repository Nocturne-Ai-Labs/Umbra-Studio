import type { PowerPrompterGenerationControls } from '@/types/powerPrompter';
import { buildPowerPrompterResolutionSplitPlan } from '../../../../../shared/power-prompter/resolutionSplit';

export interface PowerPrompterResolutionSplitQueue<TPromptEntry> {
  prompts: string[];
  promptEntries: TPromptEntry[];
  promptSetIds: number[];
  promptOutputSubfolders: string[];
  promptStyleNames: string[];
  promptSeedGroupIds: string[];
  generationByPrompt: PowerPrompterGenerationControls[];
  logicalPromptCount: number;
  imageCount: number;
  splitApplied: boolean;
}

export function expandPowerPrompterQueueForResolutionSplit<TPromptEntry>({
  prompts,
  promptEntries,
  promptSetIds,
  promptOutputSubfolders,
  promptStyleNames,
  promptSeedGroupIds,
  generationByPrompt,
}: Omit<PowerPrompterResolutionSplitQueue<TPromptEntry>, 'logicalPromptCount' | 'imageCount' | 'splitApplied'>): PowerPrompterResolutionSplitQueue<TPromptEntry> {
  const logicalPromptCount = prompts.length;
  const baseGeneration = generationByPrompt[0];
  if (!baseGeneration) {
    return {
      prompts,
      promptEntries,
      promptSetIds,
      promptOutputSubfolders,
      promptStyleNames,
      promptSeedGroupIds,
      generationByPrompt,
      logicalPromptCount,
      imageCount: 0,
      splitApplied: false,
    };
  }

  const plan = buildPowerPrompterResolutionSplitPlan(logicalPromptCount, baseGeneration);
  const splitApplied = Boolean(
    baseGeneration.resolutionSplit?.enabled
    && baseGeneration.resolutionSplit.targets.filter((target) => target.enabled !== false).length >= 2
  );

  return {
    prompts: plan.map((entry) => prompts[entry.sourceIndex] || ''),
    promptEntries: promptEntries.length > 0
      ? plan.map((entry) => promptEntries[entry.sourceIndex])
      : [],
    promptSetIds: plan.map((entry) => promptSetIds[entry.sourceIndex]),
    promptOutputSubfolders: plan.map((entry) => promptOutputSubfolders[entry.sourceIndex] || ''),
    promptStyleNames: plan.map((entry) => promptStyleNames[entry.sourceIndex] || ''),
    promptSeedGroupIds: plan.map((entry) => promptSeedGroupIds[entry.sourceIndex] || ''),
    generationByPrompt: plan.map((entry) => {
      const sourceGeneration = generationByPrompt[entry.sourceIndex] || baseGeneration;
      return entry.target
        ? {
            ...sourceGeneration,
            aspectRatio: entry.target.aspectRatio,
            width: entry.target.width,
            height: entry.target.height,
            batchSize: entry.batchSize,
          }
        : sourceGeneration;
    }),
    logicalPromptCount,
    imageCount: plan.reduce((sum, entry) => sum + entry.batchSize, 0),
    splitApplied,
  };
}

