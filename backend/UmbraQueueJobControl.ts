export type UmbraQueueJobAction = 'skip' | 'remove';

export async function cancelComfyJobById(baseUrl: string, promptId: string): Promise<boolean> {
  if (!promptId.trim()) throw new Error('The generation is still submitting. Try again once it is queued.');
  // Never fall back to /interrupt: it can hit another owner's generation.
  const response = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(promptId)}/cancel`, {
    method: 'POST', signal: AbortSignal.timeout(15_000),
  });
  const raw: unknown = await response.json().catch(() => ({}));
  const payload = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(response.status === 404
      ? 'Update ComfyUI to use targeted generation cancellation.'
      : String(payload.error || `Could not cancel the generation (${response.status}).`));
  }
  if (typeof payload.cancelled !== 'boolean') throw new Error('ComfyUI returned an invalid cancellation response.');
  return payload.cancelled;
}

export async function controlUmbraControllerJob(options: {
  request: { origin: string; status: string } | null | undefined;
  action: UmbraQueueJobAction;
  skip: () => Promise<boolean>;
  remove: () => boolean;
}): Promise<void> {
  if (!options.request || options.request.origin !== 'umbra_ui') throw new Error('Umbra UI job was not found.');
  if (['completed', 'partial', 'failed', 'canceled', 'interrupted'].includes(options.request.status)) return;
  const changed = options.action === 'skip' ? await options.skip() : options.remove();
  if (!changed) throw new Error('The job changed or finished. Refresh the queue and try again.');
}
