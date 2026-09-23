import type { PowerPrompterVideoControls, PowerPrompterVideoMode } from '@/types/powerPrompter';

export function selectUmbraVideoMode(
  current: PowerPrompterVideoControls,
  mode: PowerPrompterVideoMode,
): PowerPrompterVideoControls {
  return {
    ...current,
    mode,
    sourceWidth: current.mode === mode ? current.sourceWidth : 0,
    sourceHeight: current.mode === mode ? current.sourceHeight : 0,
    ltx: {
      ...current.ltx,
      storyboard: { ...current.ltx.storyboard, enabled: false },
      extended: { ...current.ltx.extended, enabled: false },
    },
  };
}

export function startsUmbraLtxExtendedFromImage(video: PowerPrompterVideoControls): boolean {
  return video.mode === 'image_to_video'
    && !!(String(video.sourceImagePath || '').trim() || String(video.sourceImageName || '').trim());
}

export function hasUmbraVideoSourceDimensions(video: PowerPrompterVideoControls): boolean {
  return video.mode === 'text_to_video'
    || (Number.isFinite(video.sourceWidth) && video.sourceWidth > 0
      && Number.isFinite(video.sourceHeight) && video.sourceHeight > 0);
}

// The queue bridge calls this on its own copy of the editor controls.
export function normalizeUmbraVideoQueueSources(
  video: PowerPrompterVideoControls,
  extendedEnabled: boolean,
): boolean {
  const extendedStartsFromImage = extendedEnabled && startsUmbraLtxExtendedFromImage(video);
  if (extendedEnabled) {
    video.mode = extendedStartsFromImage ? 'image_to_video' : 'text_to_video';
    video.frameGuideMode = 'first';
    video.middleImagePath = '';
    video.middleImageName = '';
    video.lastImagePath = '';
    video.lastImageName = '';
  }
  if (video.mode !== 'video_to_video') {
    video.sourceVideoPath = '';
    video.sourceVideoName = '';
  }
  if (video.mode === 'text_to_video' || video.mode === 'video_to_video') {
    video.sourceImagePath = '';
    video.sourceImageName = '';
    video.middleImagePath = '';
    video.middleImageName = '';
    video.lastImagePath = '';
    video.lastImageName = '';
    if (video.mode === 'text_to_video') {
      video.sourceWidth = 0;
      video.sourceHeight = 0;
    }
  }
  return extendedStartsFromImage;
}
