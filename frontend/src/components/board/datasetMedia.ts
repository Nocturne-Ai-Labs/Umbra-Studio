import type { DatasetImage } from './types';

export function datasetImageUrl(dataset: string, concept: string, image: DatasetImage): string {
  return `/api/files/datasets/${[dataset, concept, image.filename].map(encodeURIComponent).join('/')}?v=${image.revision || 0}`;
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
