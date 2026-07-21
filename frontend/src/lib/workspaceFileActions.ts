import type { ImageItem } from '@/types/media';

type WorkspaceCopyTarget = 'comfy' | 'comfyui';

export interface WorkspaceCopyResult {
  sourcePath: string;
  name: string;
  filename?: string;
  destPath?: string;
  path?: string;
  success?: boolean;
  raw?: unknown;
}

const resolveCopyEndpoint = (workspace: WorkspaceCopyTarget): string => {
  switch (workspace) {
    case 'comfy':
    case 'comfyui':
    default:
      return '/api/comfy/copy-image';
  }
};

const readCopyResponse = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
};

export async function copyImagesToWorkspace(images: ImageItem[], workspace: WorkspaceCopyTarget): Promise<WorkspaceCopyResult[]> {
  const copyEndpoint = resolveCopyEndpoint(workspace);
  const failed: string[] = [];
  const copied: WorkspaceCopyResult[] = [];

  for (const img of images) {
    const sourcePath = String(img?.path || '').trim();
    try {
      if (!sourcePath) {
        failed.push(`${img?.name || 'Unknown file'}: Missing source path`);
        continue;
      }

      const response = await fetch(copyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath }),
      });

      const payload = await readCopyResponse(response);
      if (!response.ok) {
        const errorText = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : `HTTP ${response.status}`;
        failed.push(`${img.name}: ${errorText}`);
        continue;
      }

      copied.push({
        sourcePath,
        name: img?.name || String(payload.filename || payload.name || 'Unknown file'),
        filename: typeof payload.filename === 'string' ? payload.filename : undefined,
        destPath: typeof payload.destPath === 'string' ? payload.destPath : undefined,
        path: typeof payload.path === 'string' ? payload.path : undefined,
        success: Boolean(payload.success ?? true),
        raw: payload,
      });
    } catch (error) {
      failed.push(`${img.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed.length > 0) {
    const workspaceName = 'ComfyUI';
    const suffix = failed.length === 1 ? '' : 's';
    throw new Error(`Failed to copy ${failed.length}/${images.length} image${suffix} to ${workspaceName}. ${failed[0]}`);
  }

  return copied;
}
