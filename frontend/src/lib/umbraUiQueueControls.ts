export interface UmbraUiQueueControlPrompt {
  status: string;
}

export interface UmbraUiQueueControlRequest {
  requestId: string;
  origin: 'power_prompter' | 'umbra_ui';
  prompts: UmbraUiQueueControlPrompt[];
}

export interface UmbraUiQueueControlTargets {
  activeRequestId: string;
  requestIds: string[];
  running: number;
  pending: number;
}

export function resolveUmbraUiQueueControlTargets(
  activeRequestId: string,
  requests: UmbraUiQueueControlRequest[],
): UmbraUiQueueControlTargets {
  const umbraRequests = requests.filter((request) => request.origin === 'umbra_ui');
  const activeRequest = umbraRequests.find((request) => (
    request.requestId === activeRequestId
    && request.prompts.some((prompt) => prompt.status === 'running' || prompt.status === 'submitting')
  )) || null;
  const requestIds = umbraRequests
    .filter((request) => request.prompts.some((prompt) => (
      prompt.status === 'pending' || prompt.status === 'submitting' || prompt.status === 'running'
    )))
    .map((request) => request.requestId);
  const prompts = umbraRequests.flatMap((request) => request.prompts);

  return {
    activeRequestId: activeRequest?.requestId || '',
    requestIds,
    running: prompts.filter((prompt) => prompt.status === 'running' || prompt.status === 'submitting').length,
    pending: prompts.filter((prompt) => prompt.status === 'pending').length,
  };
}
