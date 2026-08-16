export interface QueuePromptCompletionNotification {
  key: string;
  requestId: string;
  promptIndex: number;
}

export function createQueuePromptCompletionNotification(
  requestIdInput: unknown,
  promptIndexInput: unknown,
): QueuePromptCompletionNotification | null {
  const requestId = String(requestIdInput || '').trim();
  const promptIndexRaw = Number(promptIndexInput);
  if (!requestId || !Number.isFinite(promptIndexRaw)) return null;
  const promptIndex = Math.max(0, Math.floor(promptIndexRaw));
  return {
    key: `${requestId}:${promptIndex}`,
    requestId,
    promptIndex,
  };
}

export function collectSuccessfulQueuePromptCompletions(
  requestsInput: unknown,
): QueuePromptCompletionNotification[] {
  const requests = Array.isArray(requestsInput) ? requestsInput : [];
  const notifications: QueuePromptCompletionNotification[] = [];
  for (const request of requests) {
    if (!request || typeof request !== 'object') continue;
    const source = request as Record<string, unknown>;
    const prompts = Array.isArray(source.prompts) ? source.prompts : [];
    for (const prompt of prompts) {
      if (!prompt || typeof prompt !== 'object') continue;
      const promptSource = prompt as Record<string, unknown>;
      if (String(promptSource.status || '').trim().toLowerCase() !== 'completed') continue;
      const notification = createQueuePromptCompletionNotification(
        source.requestId,
        promptSource.promptIndex,
      );
      if (notification) notifications.push(notification);
    }
  }
  return notifications;
}

export function claimQueuePromptCompletionNotification(
  notifiedKeys: Set<string>,
  requestIdInput: unknown,
  promptIndexInput: unknown,
  maxEntries = 10000,
): QueuePromptCompletionNotification | null {
  const notification = createQueuePromptCompletionNotification(requestIdInput, promptIndexInput);
  if (!notification || notifiedKeys.has(notification.key)) return null;
  notifiedKeys.add(notification.key);
  if (notifiedKeys.size > maxEntries) {
    const trimCount = Math.max(1, Math.floor(maxEntries * 0.2));
    const oldestKeys = Array.from(notifiedKeys).slice(0, trimCount);
    for (const key of oldestKeys) notifiedKeys.delete(key);
  }
  return notification;
}
