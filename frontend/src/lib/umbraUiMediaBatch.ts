export type UmbraUiMediaBatchKind = 'image' | 'video';

export interface UmbraUiMediaBatchItem {
  id: string;
  kind: UmbraUiMediaBatchKind;
}

export const UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY = 25;
export const UMBRA_UI_MEDIA_BATCH_VIDEO_CONCURRENCY = 1;

export async function runUmbraUiMediaBatch<T extends UmbraUiMediaBatchItem>(options: {
  items: T[];
  runItem: (item: T, sequenceNumber: number) => Promise<void>;
  onItemStart?: (item: T) => void;
  onItemSettled?: (item: T, error?: unknown) => void;
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

  for (let offset = 0; offset < images.length; offset += UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY) {
    const chunk = images.slice(offset, offset + UMBRA_UI_MEDIA_BATCH_IMAGE_CONCURRENCY);
    await Promise.all(chunk.map((item, index) => runOne(item, offset + index + 1)));
  }
  for (let index = 0; index < videos.length; index += UMBRA_UI_MEDIA_BATCH_VIDEO_CONCURRENCY) {
    await runOne(videos[index], index + 1);
  }

  return { completed, failed };
}
