export async function ensureUmbraUiQueuedMedia(
  kind: 'image' | 'video' | 'audio',
  sourcePath: string,
  filename: string,
  label: string,
): Promise<string> {
  const response = await fetch('/api/comfy/ensure-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sourcePath, filename }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `Failed to stage ${label} in ComfyUI.`));
  }
  const stagedName = String(payload?.filename || '').trim();
  if (!stagedName) throw new Error(`ComfyUI did not return a staged ${label} name.`);
  return stagedName;
}
