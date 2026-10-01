import type { PowerPrompterVideoControls } from '@/types/powerPrompter';

export function applyLtxOmniForgeFrameHandoff(
  current: PowerPrompterVideoControls,
  role: 'first' | 'middle' | 'last',
  image: { name: string; sourcePath?: string; previewUrl?: string } | null,
): PowerPrompterVideoControls {
  const id = `umbra-${role}-frame`;
  const segments = current.ltx.omniForge.segments.filter((segment) => segment.id !== id);
  if (image) segments.push({
    id, type: 'image', start: role === 'last' ? current.frames - 1 : role === 'middle' ? Math.floor(current.frames / 2) : 0,
    length: 1, prompt: '', guideStrength: 1, isEndFrame: role === 'last',
    sourceImageName: image.name, sourcePath: image.sourcePath, previewUrl: image.previewUrl,
  });
  return {
    ...current, mode: image ? 'image_to_video' : current.mode,
    ltx: { ...current.ltx, omniForge: { ...current.ltx.omniForge, mainTrackEnabled: true, segments } },
  };
}
