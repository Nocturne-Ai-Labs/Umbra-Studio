import type { DatasetImage } from './types';
import { classifyUmbraPrompt } from '@/lib/nsfwPrivacy';

export function isProtectedDatasetImage(image: DatasetImage | null | undefined): boolean {
  return !!image && classifyUmbraPrompt([image.caption || '', ...(image.tags || [])].join(', ')) === 'nsfw';
}

export function datasetImageUrl(dataset: string, concept: string, image: DatasetImage): string {
  const parts = image.path?.startsWith('/User/Datasets/')
    ? image.path.slice('/User/Datasets/'.length).split('/')
    : [dataset, concept, image.filename];
  return `/api/files/datasets/${parts.map(encodeURIComponent).join('/')}?v=${image.revision || 0}`;
}

export async function redownloadDatasetImage(dataset: string, concept: string, filename: string): Promise<number> {
  const response = await fetch('/api/datasets/redownload-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset, concept, filename }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || 'Could not re-download the original image.');
  return Number(result.revision) || Date.now();
}
