const VIDEO_EXTENSION = /\.(?:avi|m4v|mkv|mov|mp4|webm)$/i;
const UNSAFE_FILENAME = /[<>:"/\\|?*\x00-\x1f]/;

export function resolveUmbraVideoQueueSourceUrl({
  mode,
  sourceVideoPath,
  sourceVideoName,
}: {
  mode: string;
  sourceVideoPath: string;
  sourceVideoName: string;
}): string {
  const path = String(sourceVideoPath || '').trim();
  if (!path) return '';

  const stagedName = String(sourceVideoName || '').trim();
  const pathName = path.replace(/\\/g, '/').split('/').pop() || '';
  if (mode === 'video_to_video'
    && stagedName === pathName
    && VIDEO_EXTENSION.test(stagedName)
    && !UNSAFE_FILENAME.test(stagedName)) {
    return `/api/comfy/staged-video-preview?${new URLSearchParams({ filename: stagedName }).toString()}`;
  }

  return `/api/fs/image?path=${encodeURIComponent(path)}`;
}
