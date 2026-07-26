export const UMBRA_LTX_EXTENDED_MAX_CLIPS = 12;
export const UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS = 10;
export const UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS = 120;

export interface UmbraLtxExtendedClip {
  id: string;
  prompt: string;
  durationSeconds: number;
}

export interface UmbraLtxExtendedControls {
  enabled: boolean;
  clips: UmbraLtxExtendedClip[];
}

export interface UmbraLtxExtendedSequenceMetadata {
  kind: 'ltx_extended';
  sessionId: string;
  clipId: string;
  clipIndex: number;
  clipCount: number;
  clipDurationSeconds: number;
  totalDurationSeconds: number;
  finalClip: boolean;
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampFiniteNumber(value, fallback, min, max));
}

function normalizeClipId(value: unknown, index: number): string {
  return String(value || `ltx-extended-clip-${index + 1}`)
    .trim()
    .slice(0, 160) || `ltx-extended-clip-${index + 1}`;
}

export function createDefaultUmbraLtxExtendedControls(): UmbraLtxExtendedControls {
  return {
    enabled: false,
    clips: [
      { id: 'ltx-extended-clip-1', prompt: '', durationSeconds: 10 },
      { id: 'ltx-extended-clip-2', prompt: '', durationSeconds: 10 },
    ],
  };
}

export function normalizeUmbraLtxExtendedControls(
  rawValue: unknown,
): UmbraLtxExtendedControls {
  const defaults = createDefaultUmbraLtxExtendedControls();
  const value = rawValue && typeof rawValue === 'object'
    ? rawValue as Record<string, unknown>
    : {};
  const rawClips = Array.isArray(value.clips) ? value.clips : defaults.clips;
  const clips = rawClips
    .slice(0, UMBRA_LTX_EXTENDED_MAX_CLIPS)
    .map((rawClip, index) => {
      const clip = rawClip && typeof rawClip === 'object'
        ? rawClip as Record<string, unknown>
        : {};
      return {
        id: normalizeClipId(clip.id, index),
        prompt: String(clip.prompt || '').trim(),
        durationSeconds: clampFiniteNumber(
          clip.durationSeconds,
          10,
          1,
          UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS,
        ),
      };
    });
  return {
    enabled: value.enabled === true,
    clips: clips.length > 0 ? clips : defaults.clips,
  };
}

export function resolveUmbraLtxExtendedTotalSeconds(
  controls: UmbraLtxExtendedControls,
): number {
  return controls.clips.reduce((total, clip) => total + clip.durationSeconds, 0);
}

export function normalizeUmbraLtxExtendedSequenceMetadata(
  rawValue: unknown,
): UmbraLtxExtendedSequenceMetadata | undefined {
  if (!rawValue || typeof rawValue !== 'object') return undefined;
  const value = rawValue as Record<string, unknown>;
  if (String(value.kind || '').trim() !== 'ltx_extended') return undefined;
  const sessionId = String(value.sessionId || '').trim().slice(0, 200);
  const clipId = String(value.clipId || '').trim().slice(0, 160);
  if (!sessionId || !clipId) return undefined;
  const clipCount = clampFiniteInteger(
    value.clipCount,
    1,
    1,
    UMBRA_LTX_EXTENDED_MAX_CLIPS,
  );
  const clipIndex = clampFiniteInteger(value.clipIndex, 0, 0, clipCount - 1);
  const clipDurationSeconds = clampFiniteNumber(
    value.clipDurationSeconds,
    10,
    1,
    UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS,
  );
  return {
    kind: 'ltx_extended',
    sessionId,
    clipId,
    clipIndex,
    clipCount,
    clipDurationSeconds,
    totalDurationSeconds: clampFiniteNumber(
      value.totalDurationSeconds,
      clipDurationSeconds * clipCount,
      clipDurationSeconds,
      UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS,
    ),
    finalClip: value.finalClip === true || clipIndex === clipCount - 1,
  };
}
