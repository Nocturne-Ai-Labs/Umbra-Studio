export interface UmbraUiMediaToolResult {
  path: string;
  filename: string;
  mediaType: 'image' | 'video' | 'gif';
}

export interface UmbraUiWatermarkAsset {
  path: string;
  filename: string;
  previewUrl: string;
}

export async function uploadUmbraUiWatermarkAsset(file: File): Promise<UmbraUiWatermarkAsset> {
  const form = new FormData();
  form.set('watermark', file, file.name);
  const response = await fetch('/api/umbra-ui/media-tools/watermark-assets', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.path) {
    throw new Error(String(payload?.error || `Failed to save watermark asset (${response.status}).`));
  }
  return {
    path: String(payload.path),
    filename: String(payload.filename || file.name),
    previewUrl: String(payload.previewUrl || `/api/fs/image?${new URLSearchParams({ path: String(payload.path) }).toString()}`),
  };
}

async function readMediaToolResponse(response: Response, fallback: string): Promise<UmbraUiMediaToolResult> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.path) {
    throw new Error(String(payload?.error || `${fallback} (${response.status}).`));
  }
  return {
    path: String(payload.path),
    filename: String(payload.filename || '').trim(),
    mediaType: payload.mediaType === 'video' || payload.mediaType === 'gif' ? payload.mediaType : 'image',
  };
}

export async function submitUmbraUiWatermark(options: {
  source?: File;
  sourcePath?: string;
  watermark?: File;
  watermarkPath?: string;
  outputFolder: string;
  sequenceNumber: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  resizeEnabled: boolean;
  longEdge: number;
  imageFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
  outputWidth: number;
}): Promise<UmbraUiMediaToolResult> {
  const form = new FormData();
  if (options.source) form.set('source', options.source, options.source.name);
  if (options.sourcePath) form.set('sourcePath', options.sourcePath);
  if (options.watermark) form.set('watermark', options.watermark, options.watermark.name);
  if (options.watermarkPath) form.set('watermarkPath', options.watermarkPath);
  form.set('outputFolder', options.outputFolder);
  form.set('sequenceNumber', String(options.sequenceNumber));
  form.set('x', String(options.x));
  form.set('y', String(options.y));
  form.set('scale', String(options.scale));
  form.set('opacity', String(options.opacity));
  form.set('resizeEnabled', String(options.resizeEnabled));
  form.set('longEdge', String(options.longEdge));
  form.set('imageFormat', options.imageFormat);
  form.set('quality', String(options.quality));
  form.set('outputWidth', String(options.outputWidth));
  const response = await fetch('/api/umbra-ui/media-tools/watermark', { method: 'POST', body: form });
  return readMediaToolResponse(response, 'Watermark processing failed');
}

export async function submitUmbraUiVideoToGif(options: {
  source?: File;
  sourcePath?: string;
  outputFolder: string;
  sequenceNumber: number;
  width: number;
}): Promise<UmbraUiMediaToolResult> {
  const form = new FormData();
  if (options.source) form.set('source', options.source, options.source.name);
  if (options.sourcePath) form.set('sourcePath', options.sourcePath);
  form.set('outputFolder', options.outputFolder);
  form.set('sequenceNumber', String(options.sequenceNumber));
  form.set('width', String(options.width));
  const response = await fetch('/api/umbra-ui/media-tools/video-to-gif', { method: 'POST', body: form });
  return readMediaToolResponse(response, 'GIF conversion failed');
}

export async function browseUmbraUiMediaToolsOutputFolder(startDir = ''): Promise<string> {
  const response = await fetch('/api/umbra-ui/media-tools/browse-output-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDir, title: 'Select Extras Output Folder' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || `Folder picker failed (${response.status}).`));
  return String(payload?.path || '').trim();
}

export async function browseUmbraUiMediaToolsSourceFiles(
  kind: 'image' | 'video' | 'media',
  startDir = '',
): Promise<string[]> {
  const response = await fetch('/api/umbra-ui/media-tools/browse-source-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, startDir }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || `File picker failed (${response.status}).`));
  return Array.isArray(payload?.paths) ? payload.paths.map((path: unknown) => String(path || '').trim()).filter(Boolean) : [];
}
