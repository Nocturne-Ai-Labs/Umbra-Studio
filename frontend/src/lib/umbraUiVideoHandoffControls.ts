import type { PowerPrompterVideoControls } from '@/types/powerPrompter';
import {
  resolveUmbraVideoDurationSeconds,
  resolveUmbraVideoFramesForDuration,
} from '../../../shared/umbra-ui/videoStoryboard';

export function prepareVideoControlsForHandoff(
  current: PowerPrompterVideoControls,
  needsThreeFrameGuidanceOrVideoSource: boolean,
): PowerPrompterVideoControls {
  const switchFromMiniMax = needsThreeFrameGuidanceOrVideoSource && current.family === 'minimax_h3';
  const durationSeconds = switchFromMiniMax
    ? resolveUmbraVideoDurationSeconds(current.frames, current.fps)
    : 0;
  return {
    ...current,
    ...(switchFromMiniMax ? {
      family: 'wan22' as const,
      fps: 16,
      frames: resolveUmbraVideoFramesForDuration(durationSeconds, 16, 4),
    } : {}),
    ltx: {
      ...current.ltx,
      storyboard: { ...current.ltx.storyboard, enabled: false },
      extended: { ...current.ltx.extended, enabled: false },
    },
  };
}
