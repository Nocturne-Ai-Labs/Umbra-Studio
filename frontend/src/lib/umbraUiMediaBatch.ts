export type UmbraUiMediaBatchKind = 'image' | 'video';

export interface UmbraUiMediaBatchItem {
  id: string;
  kind: UmbraUiMediaBatchKind;
}

export const UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY = 25;
export const UMBRA_UI_MEDIA_BATCH_VIDEO_CONCURRENCY = 1;

export function clearCompletedUmbraUiMediaBatch<T extends { id: string; status: string }>(
  current: T[],
  submitted: ReadonlyArray<{ id: string }>,
): T[] {
  const submittedIds = new Set(submitted.map((item) => item.id));
  return current.filter((item) => item.status !== 'completed' || !submittedIds.has(item.id));
}

export async function runUmbraUiMediaBatch<T extends UmbraUiMediaBatchItem>(options: {
  items: T[];
  runItem: (item: T, sequenceNumber: number) => Promise<void>;
  onItemStart?: (item: T) => void;
  onItemSettled?: (item: T, error?: unknown) => void;
  shouldStop?: () => boolean;
  imageConcurrency?: number;
}): Promise<{ completed: number; failed: number }> {
  const images = options.items.filter((item) => item.kind === 'image');
  const videos = options.items.filter((item) => item.kind === 'video');
  let completed = 0;
  let failed = 0;

  const runOne = async (item: T, sequenceNumber: number) => {
    options.onItemStart?.(item);
    try {
      await options.runItem(item, sequenceNumber);
      completed += 1;
      options.onItemSettled?.(item);
    } catch (error) {
      failed += 1;
      options.onItemSettled?.(item, error);
    }
  };

  const imageConcurrency = Math.max(1, Math.min(UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY, Math.floor(options.imageConcurrency || UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY)));
  for (let offset = 0; offset < images.length; offset += imageConcurrency) {
    if (options.shouldStop?.()) break;
    const chunk = images.slice(offset, offset + imageConcurrency);
    await Promise.all(chunk.map((item, index) => runOne(item, offset + index + 1)));
  }
  for (let index = 0; index < videos.length; index += UMBRA_UI_MEDIA_BATCH_VIDEO_CONCURRENCY) {
    if (options.shouldStop?.()) break;
    await runOne(videos[index], index + 1);
  }

  return { completed, failed };
}
