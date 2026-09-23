interface ImageQueuePreviewState {
  umbraUiRunning: number;
  umbraUiActiveRequestId: string;
  activePosition: number;
}

interface LiveImagePreview {
  requestId: string;
  promptIndex: number;
  imageDataUrl: string;
  privacyClass: string;
}

interface SavedImagePreview {
  imageUrl: string;
  privacyClass: string;
}

export function selectUmbraUiImagePreviewState(
  queue: ImageQueuePreviewState,
  preview: LiveImagePreview | null,
  saved: SavedImagePreview | null,
): { showingLivePreview: boolean; imagePreviewUrl: string; imagePreviewIsNsfw: boolean } {
  const showingLivePreview = queue.umbraUiRunning > 0
    && !!queue.umbraUiActiveRequestId
    && preview?.requestId === queue.umbraUiActiveRequestId
    && preview.promptIndex === queue.activePosition - 1
    && !!preview.imageDataUrl;
  const imagePreviewUrl = showingLivePreview
    ? preview?.imageDataUrl || ''
    : saved?.imageUrl || '';
  const imagePreviewIsNsfw = (showingLivePreview ? preview : saved)?.privacyClass === 'nsfw';
  return { showingLivePreview, imagePreviewUrl, imagePreviewIsNsfw };
}
