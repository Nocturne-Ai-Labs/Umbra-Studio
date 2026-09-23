import type { PowerPrompterVideoControls } from '@/types/powerPrompter';

export async function refreshUmbraVideoRequeueSourceDimensions(
  video: PowerPrompterVideoControls,
  fetchMetadata: typeof fetch = fetch,
): Promise<PowerPrompterVideoControls> {
  if (video.mode !== 'video_to_video' || !video.sourceVideoPath || video.sourceVideoName) return video;

  const response = await fetchMetadata(
    `/api/fs/metadata?${new URLSearchParams({ path: video.sourceVideoPath }).toString()}`,
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error('Could not read the new reference video dimensions. Choose a video from Gallery before requeueing.');

  const metadata = await response.json().catch(() => ({}));
  const width = Math.round(Number(metadata?.width));
  const height = Math.round(Number(metadata?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Could not read the new reference video dimensions. Choose a different video.');
  }
  return { ...video, sourceWidth: width, sourceHeight: height };
}
