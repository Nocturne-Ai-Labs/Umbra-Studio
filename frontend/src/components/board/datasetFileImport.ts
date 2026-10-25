import type { DroppedImage } from '@/lib/dnd/SimpleDragDrop';

export const DATASET_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif';
const IMAGE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);

export function isDatasetImageFile(file: File): boolean {
  return IMAGE_EXTENSION.test(file.name) || IMAGE_TYPES.has(file.type.toLowerCase());
}

export function isExternalDatasetFileDrag(transfer: DataTransfer): boolean {
  const types = Array.from(transfer.types || []);
  // Umbra's internal drags retain their own selection and copy behavior.
  return !types.includes('application/json') && (types.includes('Files') || transfer.files.length > 0);
}

export function prepareDatasetFileImport(files: Iterable<File>): { images: DroppedImage[]; skipped: number } {
  const all = Array.from(files);
  const images: DroppedImage[] = all
    .filter(file => file.size > 0 && isDatasetImageFile(file))
    .map(file => ({ kind: 'file', file, name: file.name, type: file.type }));
  return { images, skipped: all.length - images.length };
}

export async function uploadDatasetImage(file: File, dataset: string, concept: string): Promise<void> {
  const formData = new FormData();
  formData.append('dataset', dataset);
  formData.append('concept', concept);
  formData.append('image', file, file.name || 'image.png');
  const response = await fetch('/api/datasets/import-uploaded-image', { method: 'POST', body: formData });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || 'Image upload failed. Please try again.');
  }
}
