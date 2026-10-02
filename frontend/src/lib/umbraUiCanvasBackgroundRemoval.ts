export interface UmbraCanvasBackgroundRemovalStatus {
  available: boolean;
  provider: 'CPUExecutionProvider';
  model: 'isnet-anime';
  reason?: string;
}

export async function getUmbraCanvasBackgroundRemovalStatus(signal?: AbortSignal): Promise<UmbraCanvasBackgroundRemovalStatus> {
  const response = await fetch('/api/umbra-ui/canvas/background-removal/status', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Canvas CPU background-removal status could not be checked.');
  return response.json();
}

export async function removeUmbraCanvasImageBackground(options: { image: Blob; imageName: string; signal: AbortSignal }): Promise<{ blob: Blob }> {
  const requestId = crypto.randomUUID();
  const form = new FormData();
  form.append('image', options.image, options.imageName);
  let cancellation: Promise<void> | null = null;
  const cancel = () => {
    cancellation ??= (async () => {
      const response = await fetch('/api/umbra-ui/canvas/background-removal/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }), signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json();
      if (!response.ok || payload?.stopped !== true) throw new Error('The cutout was discarded, but its CPU worker could not confirm that it stopped.');
    })();
    // Handle the rejection now; the caller awaits it before finishing an abort.
    void cancellation.catch(() => undefined);
  };
  options.signal.throwIfAborted();
  options.signal.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch('/api/umbra-ui/canvas/remove-background', {
      method: 'POST', body: form, headers: { 'X-Umbra-Canvas-Request': requestId }, signal: options.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload?.error || `Canvas CPU background removal returned ${response.status}.`));
    }
    if (response.headers.get('X-Umbra-Background-Provider') !== 'CPUExecutionProvider' || response.headers.get('X-Umbra-Background-Mask') !== 'soft') {
      throw new Error('Canvas did not receive a CPU soft-alpha cutout. The original layer was kept.');
    }
    return { blob: await response.blob() };
  } catch (error) {
    if (options.signal.aborted) {
      cancel();
      await cancellation;
    }
    throw error;
  } finally {
    options.signal.removeEventListener('abort', cancel);
  }
}
