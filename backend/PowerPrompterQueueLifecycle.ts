type PromptState = { status: string; promptId?: string };

export function getInterruptedPromptHistoryStatus(
  prompt: PromptState & { interruptionDrainConfirmed?: boolean },
): 'interrupted_confirmed' | 'running' | 'submitting' | null {
  if (prompt.status !== 'interrupted') return null;
  if (prompt.interruptionDrainConfirmed === true) return 'interrupted_confirmed';
  return prompt.promptId ? 'running' : 'submitting';
}

export function canInterruptPowerPrompterPrompt(
  prompt: PromptState | null | undefined,
  taskPromptId: string,
  alreadyInterrupted: boolean,
): boolean {
  return !!taskPromptId
    && (prompt?.status === 'running' || prompt?.status === 'submitting')
    && (!prompt.promptId || prompt.promptId === taskPromptId)
    && !alreadyInterrupted;
}

export function hasLivePowerPrompterQueuePrompts(prompts: readonly { status: string }[] | null | undefined): boolean {
  return prompts?.some((prompt) => prompt.status === 'pending' || prompt.status === 'submitting' || prompt.status === 'running') === true;
}

export function getLiveUmbraUiQueueRequestIds(
  requests: readonly { requestId: string; origin: string; prompts: readonly { status: string }[] }[],
): string[] {
  return requests
    .filter((request) => request.origin === 'umbra_ui' && hasLivePowerPrompterQueuePrompts(request.prompts))
    .map((request) => request.requestId);
}

export function getQueueClearFutureKeepIds(
  activeTaskIds: Iterable<string>,
  requests: readonly { requestId: string; prompts: readonly PromptState[] }[],
): string[] {
  const activeTasks = new Set(activeTaskIds);
  const keep = new Set<string>();
  for (const request of requests) {
    if (!activeTasks.has(request.requestId)) continue;
    if (request.prompts.some((prompt) => prompt.status === 'running' || prompt.status === 'submitting'
      || (prompt.status === 'interrupted' && !!prompt.promptId))) {
      keep.add(request.requestId);
    }
  }
  return Array.from(keep);
}

export function shouldFinishStoppedPowerPrompterQueue(
  stopAfterCurrent: boolean,
  counts: { completed: number; failed: number; interrupted: number; removed: number; total: number },
): boolean {
  return stopAfterCurrent && (
    counts.interrupted > 0
    || counts.completed + counts.failed + counts.removed < counts.total
  );
}

export function summarizePowerPrompterQueuePrompts(
  prompts: readonly { status: string; promptIndex: number; updatedAt?: number }[],
) {
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  let runningIndex: number | null = null;
  let pendingIndex: number | null = null;
  let hasInterrupted = false;
  let hasCanceled = false;
  let updatedAt = 0;
  for (const prompt of prompts) {
    if (prompt.status === 'completed') completed += 1;
    else if (prompt.status === 'failed') failed += 1;
    else if (prompt.status === 'canceled') { canceled += 1; hasCanceled = true; }
    else if (prompt.status === 'interrupted') { canceled += 1; hasInterrupted = true; }
    else if ((prompt.status === 'running' || prompt.status === 'submitting') && runningIndex === null) runningIndex = prompt.promptIndex;
    else if (prompt.status === 'pending' && pendingIndex === null) pendingIndex = prompt.promptIndex;
    updatedAt = Math.max(updatedAt, Number(prompt.updatedAt) || 0);
  }
  return {
    completed,
    failed,
    canceled,
    activeIndex: runningIndex ?? pendingIndex ?? prompts[prompts.length - 1]?.promptIndex ?? 0,
    hasRunning: runningIndex !== null,
    hasPending: pendingIndex !== null,
    hasInterrupted,
    hasCanceled,
    updatedAt,
  };
}
