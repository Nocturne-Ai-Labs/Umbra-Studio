type VideoWorkflowDescriptor = {
  mediaType: string;
  videoFamily?: string;
  videoMode?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

// Readiness and graph compilation must see the same video controls. Legacy
// image-typed queue entries use the saved video session when a video workflow
// is selected, so the saved LoRA stack must be validated before submission.
export function bindPPGenerationToWorkflowVideo(
  rawGeneration: unknown,
  workflow: VideoWorkflowDescriptor,
  getSavedVideoControls: () => unknown,
): unknown {
  if (workflow.mediaType !== 'video') return rawGeneration;
  const generation = asRecord(rawGeneration);
  const video = String(generation.mediaType || '').trim().toLowerCase() === 'video'
    ? asRecord(generation.video)
    : asRecord(getSavedVideoControls());
  return {
    ...generation,
    mediaType: 'video',
    video: {
      ...video,
      family: workflow.videoFamily || 'wan22',
      mode: workflow.videoMode || 'text_to_video',
    },
  };
}
