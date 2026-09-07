export type SavedQueueAvailability = {
  canSave: boolean;
  remaining: number;
  reason: string;
};

export interface SaveableQueueState {
  paused: boolean;
  requests: Array<{
    origin: string;
    prompts: Array<{ status: string }>;
  }>;
}

export function getSavedQueueAvailability(state: SaveableQueueState): SavedQueueAvailability {
  let remaining = 0;
  let running = false;
  for (const request of state.requests) {
    if (request.origin !== 'power_prompter') continue;
    for (const prompt of request.prompts) {
      if (prompt.status === 'pending') remaining++;
      else if (prompt.status === 'running' || prompt.status === 'submitting') running = true;
    }
  }
  const reason = !state.paused ? 'Pause Power Prompter before saving.'
    : running ? 'Waiting for the current Power Prompter image to finish.'
      : !remaining ? 'No remaining Power Prompter prompts to save.' : '';
  return { canSave: !reason, remaining, reason };
}
