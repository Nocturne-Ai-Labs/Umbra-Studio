import type {
  PowerPrompterGenerationControls,
  PowerPrompterResolutionSplitTarget,
} from './types';

export interface PowerPrompterResolutionSplitPlanEntry {
  sourceIndex: number;
  targetIndex: number;
  target: PowerPrompterResolutionSplitTarget | null;
  batchSize: number;
}

function buildSmoothWeightedTargetIndices(
  count: number,
  targets: PowerPrompterResolutionSplitTarget[],
): number[] {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount <= 0 || targets.length <= 0) return [];
  const weights = targets.map((target) => Math.max(1, Math.floor(Number(target.weight) || 1)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const current = weights.map(() => 0);
  const assignments: number[] = [];

  for (let position = 0; position < safeCount; position += 1) {
    let selectedIndex = 0;
    for (let index = 0; index < weights.length; index += 1) {
      current[index] += weights[index];
      if (current[index] > current[selectedIndex]) selectedIndex = index;
    }
    assignments.push(selectedIndex);
    current[selectedIndex] -= totalWeight;
  }
  return assignments;
}

export function buildPowerPrompterResolutionSplitPlan(
  promptCount: number,
  generation: PowerPrompterGenerationControls,
): PowerPrompterResolutionSplitPlanEntry[] {
  const safePromptCount = Math.max(0, Math.floor(Number(promptCount) || 0));
  const batchSize = Math.max(1, Math.floor(Number(generation.batchSize) || 1));
  const split = generation.resolutionSplit;
  const activeTargets = split?.enabled
    ? split.targets.filter((target) => target.enabled !== false && Number(target.weight) > 0).slice(0, 5)
    : [];

  if (activeTargets.length < 2) {
    return Array.from({ length: safePromptCount }, (_, sourceIndex) => ({
      sourceIndex,
      targetIndex: -1,
      target: null,
      batchSize,
    }));
  }

  if (split?.mode !== 'batch') {
    const assignments = buildSmoothWeightedTargetIndices(safePromptCount, activeTargets);
    return assignments.map((targetIndex, sourceIndex) => ({
      sourceIndex,
      targetIndex,
      target: activeTargets[targetIndex],
      batchSize,
    }));
  }

  const assignments = buildSmoothWeightedTargetIndices(safePromptCount * batchSize, activeTargets);
  return assignments.map((targetIndex, imageIndex) => ({
    sourceIndex: Math.floor(imageIndex / batchSize),
    targetIndex,
    target: activeTargets[targetIndex],
    batchSize: 1,
  }));
}

