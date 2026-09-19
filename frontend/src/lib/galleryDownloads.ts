export async function prepareGalleryDownload(
  paths: string[], metadata: 'keep' | 'strip' | null, signal?: AbortSignal,
): Promise<{ url: string; filename: string }> {
  if (paths.length > 1000) throw new Error('Select at most 1000 files per export.');
  const response = await fetch(metadata === null ? '/api/fs/download-zip' : '/api/fs/download-jpeg-zip', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ paths, ...(metadata === null ? {} : { metadata }) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Gallery export failed (${response.status}).`);
  if (!payload || typeof payload.url !== 'string' || !/^\/api\/fs\/download-archive\?id=[a-f0-9-]+$/.test(payload.url)) {
    throw new Error('The server did not return a valid Gallery download.');
  }
  return { url: payload.url, filename: String(payload.filename || 'umbra-export.zip') };
}

export function startGalleryDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
