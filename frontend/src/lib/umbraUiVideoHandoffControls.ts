import type { PowerPrompterVideoControls } from '@/types/powerPrompter';
import type { UmbraUiH3DirectorRole, UmbraUiMediaHandoff } from './umbraUiMediaHandoff';
import {
  resolveUmbraVideoDurationSeconds,
  resolveUmbraVideoFramesForDuration,
} from '../../../shared/umbra-ui/videoStoryboard';

export function resolveVideoHandoffDirectorRole(
  current: PowerPrompterVideoControls,
  handoff: UmbraUiMediaHandoff,
): UmbraUiH3DirectorRole | undefined {
  if (handoff.h3DirectorRole) return handoff.h3DirectorRole;
  if (current.family !== 'minimax_h3' || !current.minimaxH3.director.enabled) return undefined;
  const role = handoff.videoFrameRole || 'first';
  if (role === 'middle') return undefined;
  return role === 'source_video' ? 'motion_video' : role;
}

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
