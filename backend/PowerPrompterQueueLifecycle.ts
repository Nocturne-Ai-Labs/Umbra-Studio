type PromptState = { status: string; promptId?: string };

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
