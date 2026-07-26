export interface UmbraLtxStoryboardShot {
  id: string;
  prompt: string;
  durationSeconds: number;
  sourceImagePath: string;
  sourceImageName: string;
  strength: number;
  agentEnabled: boolean;
}

export interface UmbraLtxStoryboardControls {
  enabled: boolean;
  epsilon: number;
  shots: UmbraLtxStoryboardShot[];
}

export interface UmbraLtxStoryboardTimelineShot extends UmbraLtxStoryboardShot {
  startFrame: number;
  lengthFrames: number;
}

export interface UmbraLtxStoryboardTimeline {
  enabled: boolean;
  frames: number;
  timelineFrames: number;
  durationSeconds: number;
  localPrompts: string;
  segmentLengths: string;
  shots: UmbraLtxStoryboardTimelineShot[];
}

export interface UmbraLtxDirectorInputContract {
  timeline: UmbraLtxStoryboardTimeline;
  inputs: Record<string, unknown>;
}

export const UMBRA_LTX_STORYBOARD_MAX_SHOTS = 24;
export const UMBRA_LTX_STORYBOARD_MIN_DURATION_SECONDS = 0.5;
export const UMBRA_LTX_STORYBOARD_MAX_DURATION_SECONDS = 60;
export const UMBRA_VIDEO_MIN_DURATION_SECONDS = 0.5;
export const UMBRA_VIDEO_MAX_DURATION_SECONDS = 600;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizePrompt(value: unknown): string {
  return String(value || '')
    .replace(/\|/g, ',')
    .trim()
    .slice(0, 40_000);
}

function createShotId(index: number): string {
  return `ltx-storyboard-shot-${index + 1}`;
}

export function normalizeUmbraLtxStoryboardControls(
  value: unknown,
): UmbraLtxStoryboardControls {
  const raw = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const shots = (Array.isArray(raw.shots) ? raw.shots : [])
    .slice(0, UMBRA_LTX_STORYBOARD_MAX_SHOTS)
    .map((entry, index): UmbraLtxStoryboardShot => {
      const shot = entry && typeof entry === 'object'
        ? entry as Record<string, unknown>
        : {};
      return {
        id: String(shot.id || createShotId(index)).trim().slice(0, 160) || createShotId(index),
        prompt: sanitizePrompt(shot.prompt),
        durationSeconds: clamp(
          finiteNumber(shot.durationSeconds, 4),
          UMBRA_LTX_STORYBOARD_MIN_DURATION_SECONDS,
          UMBRA_LTX_STORYBOARD_MAX_DURATION_SECONDS,
        ),
        sourceImagePath: String(shot.sourceImagePath || '').trim().replace(/\\/g, '/').slice(0, 4_000),
        sourceImageName: String(shot.sourceImageName || '').trim().replace(/\\/g, '/').slice(0, 1_000),
        strength: clamp(finiteNumber(shot.strength, 1), 0, 1),
        agentEnabled: shot.agentEnabled === true,
      };
    });
  return {
    enabled: raw.enabled === true,
    epsilon: clamp(finiteNumber(raw.epsilon, 0.001), 0.0001, 0.99),
    shots,
  };
}

export function snapUmbraLtxFrameCount(value: unknown, fallback = 121): number {
  const numeric = Math.max(1, Math.min(16_385, Math.ceil(finiteNumber(value, fallback))));
  return Math.max(1, Math.ceil((numeric - 1) / 8) * 8 + 1);
}

export function resolveUmbraVideoDurationSeconds(
  framesInput: unknown,
  fpsInput: unknown,
): number {
  const frames = clamp(Math.round(finiteNumber(framesInput, 1)), 1, 16_385);
  const fps = clamp(finiteNumber(fpsInput, 25), 1, 240);
  return Math.max(0, frames - 1) / fps;
}

export function resolveUmbraVideoFramesForDuration(
  durationSecondsInput: unknown,
  fpsInput: unknown,
  frameStrideInput: unknown,
): number {
  const durationSeconds = clamp(
    finiteNumber(durationSecondsInput, 5),
    UMBRA_VIDEO_MIN_DURATION_SECONDS,
    UMBRA_VIDEO_MAX_DURATION_SECONDS,
  );
  const fps = clamp(finiteNumber(fpsInput, 25), 1, 240);
  const frameStride = clamp(Math.round(finiteNumber(frameStrideInput, 8)), 1, 64);
  const timelineFrames = Math.max(
    frameStride,
    Math.round((durationSeconds * fps) / frameStride) * frameStride,
  );
  return clamp(timelineFrames + 1, 1, 16_385);
}

export function resolveUmbraVideoFrameIndexForSeconds(
  secondsInput: unknown,
  fpsInput: unknown,
  frameStrideInput: unknown,
  maximumFrameInput: unknown,
): number {
  const seconds = Math.max(0, finiteNumber(secondsInput, 0));
  const fps = clamp(finiteNumber(fpsInput, 25), 1, 240);
  const frameStride = clamp(Math.round(finiteNumber(frameStrideInput, 8)), 1, 64);
  const maximumFrame = clamp(Math.round(finiteNumber(maximumFrameInput, 0)), 0, 16_384);
  return Math.max(
    0,
    Math.min(maximumFrame, Math.round((seconds * fps) / frameStride) * frameStride),
  );
}

function allocateShotFrames(
  shots: UmbraLtxStoryboardShot[],
  fps: number,
  totalFrames: number,
): number[] {
  if (shots.length <= 0) return [];
  const safeFps = clamp(finiteNumber(fps, 25), 1, 240);
  const raw = shots.map((shot) => Math.max(1, shot.durationSeconds * safeFps));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const target = Math.max(shots.length, totalFrames);
  const scaled = raw.map((value) => value * target / rawTotal);
  const result = scaled.map((value) => Math.max(1, Math.floor(value)));
  let remaining = target - result.reduce((sum, value) => sum + value, 0);
  const fractionalOrder = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remaining > 0) {
    result[fractionalOrder[cursor % fractionalOrder.length].index] += 1;
    cursor += 1;
    remaining -= 1;
  }
  while (remaining < 0) {
    const index = result.reduce(
      (largest, value, candidate) => value > result[largest] ? candidate : largest,
      0,
    );
    if (result[index] <= 1) break;
    result[index] -= 1;
    remaining += 1;
  }
  return result;
}

export function resolveUmbraLtxStoryboardTimeline(
  value: unknown,
  fpsInput: unknown,
  fallbackFramesInput: unknown = 121,
): UmbraLtxStoryboardTimeline {
  const storyboard = normalizeUmbraLtxStoryboardControls(value);
  const fps = clamp(finiteNumber(fpsInput, 25), 1, 240);
  const fallbackFrames = snapUmbraLtxFrameCount(fallbackFramesInput);
  if (!storyboard.enabled || storyboard.shots.length <= 0) {
    return {
      enabled: false,
      frames: fallbackFrames,
      timelineFrames: Math.max(1, fallbackFrames - 1),
      durationSeconds: Math.max(1, fallbackFrames - 1) / fps,
      localPrompts: '',
      segmentLengths: '',
      shots: [],
    };
  }

  const requestedFrames = storyboard.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds * fps,
    0,
  );
  const frames = snapUmbraLtxFrameCount(requestedFrames);
  const timelineFrames = Math.max(storyboard.shots.length, frames - 1);
  const lengths = allocateShotFrames(storyboard.shots, fps, timelineFrames);
  let startFrame = 0;
  const shots = storyboard.shots.map((shot, index): UmbraLtxStoryboardTimelineShot => {
    const lengthFrames = lengths[index];
    const resolved = { ...shot, startFrame, lengthFrames };
    startFrame += lengthFrames;
    return resolved;
  });

  return {
    enabled: true,
    frames,
    timelineFrames,
    durationSeconds: timelineFrames / fps,
    localPrompts: shots.map((shot) => shot.prompt || 'video').join('|'),
    segmentLengths: shots.map((shot) => shot.lengthFrames).join(','),
    shots,
  };
}

export function buildUmbraLtxDirectorInputContract(
  value: unknown,
  fpsInput: unknown,
  fallbackFramesInput: unknown,
  globalPromptInput: unknown,
): UmbraLtxDirectorInputContract {
  const timeline = resolveUmbraLtxStoryboardTimeline(value, fpsInput, fallbackFramesInput);
  const fps = clamp(finiteNumber(fpsInput, 25), 1, 240);
  const storyboard = normalizeUmbraLtxStoryboardControls(value);
  const storyboardData = JSON.stringify({
    version: 1,
    fps,
    outputFrames: timeline.frames,
    timelineFrames: timeline.timelineFrames,
    shots: timeline.shots.map((shot) => ({
      id: shot.id,
      startFrame: shot.startFrame,
      lengthFrames: shot.lengthFrames,
      prompt: shot.prompt || 'video',
    })),
  });
  return {
    timeline,
    inputs: {
      global_prompt: String(globalPromptInput || '').trim().slice(0, 80_000),
      storyboard_json: storyboardData,
      transition_epsilon: storyboard.epsilon,
    },
  };
}
