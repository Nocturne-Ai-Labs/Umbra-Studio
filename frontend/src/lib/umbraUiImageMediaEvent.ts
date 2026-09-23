export type UmbraUiRequestMediaKind = 'image' | 'video';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function readUmbraUiGenerationMediaKind(value: unknown): UmbraUiRequestMediaKind | null {
  const generation = asRecord(value);
  if (!generation) return null;
  const mediaType = String(generation.mediaType || '').trim().toLowerCase();
  const outputMode = String(generation.outputMode || '').trim().toLowerCase();
  // A legacy video generation can carry the old default image media type.
  if (mediaType === 'video' || outputMode === 'txt2vid' || outputMode === 'img2vid'
    || outputMode === 'ref2vid' || outputMode === 'vid2vid') return 'video';
  if (mediaType === 'image') return 'image';
  if (mediaType) return null;
  if (outputMode === 'txt2img' || outputMode === 'img2img') return 'image';
  return null;
}

export function readUmbraUiSnapshotRequestMediaKinds(value: unknown): Map<string, UmbraUiRequestMediaKind> {
  const result = new Map<string, UmbraUiRequestMediaKind>();
  const snapshot = asRecord(value);
  if (!snapshot || !Array.isArray(snapshot.requests)) return result;
  const generations = Array.isArray(snapshot.generations) ? snapshot.generations : [];
  for (const rawRequest of snapshot.requests) {
    const request = asRecord(rawRequest);
    if (!request || request.origin !== 'umbra_ui') continue;
    const requestId = String(request.requestId || '').trim();
    const prompts = Array.isArray(request.prompts) ? request.prompts : [];
    if (!requestId || prompts.length === 0) continue;
    const kinds = prompts.map((rawPrompt) => {
      const prompt = asRecord(rawPrompt);
      if (!prompt) return null;
      const index = prompt.generationIndex;
      const generation = prompt.generation
        ?? (typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? generations[index] : null);
      return readUmbraUiGenerationMediaKind(generation);
    });
    const kind = kinds[0];
    if (kind && kinds.every((candidate) => candidate === kind)) result.set(requestId, kind);
  }
  return result;
}

export function isUmbraUiImageMediaEvent(
  payload: Record<string, unknown>,
  owned: boolean,
  trustedKind: UmbraUiRequestMediaKind | null | undefined = null,
): boolean {
  if (!owned || trustedKind === 'video') return false;
  if (payload.mediaType === 'video') return false;
  if (payload.mediaType === 'image') return true;
  return (payload.mediaType === undefined || payload.mediaType === null || payload.mediaType === '')
    && trustedKind === 'image';
}
