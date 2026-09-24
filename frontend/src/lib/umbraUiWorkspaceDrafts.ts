import { normalizeUmbraUiImageControlsSnapshot, type UmbraUiImageControlsSnapshot } from '@/lib/umbraUiImageControlsPersistence';
import { createUmbraUiPromptSegment, type UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';

export type ImageWorkspace = 'image' | 'img2img' | 'inpaint' | 'canvas';
export interface ImageWorkspaceDraft {
  controls: UmbraUiImageControlsSnapshot;
  promptSegments: UmbraUiPromptSegment[];
  activePromptSegmentId: string;
  imageAgentModeEnabled: boolean;
  imageAgentPrompt: string;
}
export type ImageWorkspaceDrafts = Partial<Record<ImageWorkspace, ImageWorkspaceDraft>>;

export function isImageWorkspace(mode: string): mode is ImageWorkspace {
  return mode === 'image' || mode === 'img2img' || mode === 'inpaint' || mode === 'canvas';
}

export function normalizeImageWorkspaceDrafts(value: unknown): ImageWorkspaceDrafts {
  const result: ImageWorkspaceDrafts = {};
  if (!value || typeof value !== 'object') return result;
  for (const [mode, raw] of Object.entries(value)) {
    if (!isImageWorkspace(mode) || !raw || typeof raw !== 'object' || !raw.controls) continue;
    const controls = normalizeUmbraUiImageControlsSnapshot(raw.controls);
    if (!controls || !Array.isArray(raw.promptSegments)) continue;
    const promptSegments = raw.promptSegments.filter((segment: UmbraUiPromptSegment) => (
      segment && typeof segment.id === 'string' && typeof segment.text === 'string'
    ));
    result[mode] = {
      controls,
      promptSegments: promptSegments.length ? promptSegments : [createUmbraUiPromptSegment()],
      activePromptSegmentId: typeof raw.activePromptSegmentId === 'string' ? raw.activePromptSegmentId : '',
      imageAgentModeEnabled: raw.imageAgentModeEnabled === true,
      imageAgentPrompt: typeof raw.imageAgentPrompt === 'string' ? raw.imageAgentPrompt : '',
    };
  }
  return result;
}

export function createImageWorkspaceDraft(): ImageWorkspaceDraft {
  return {
    controls: normalizeUmbraUiImageControlsSnapshot({ modelFamily: 'Anima', generation: {} })!,
    promptSegments: [createUmbraUiPromptSegment()],
    activePromptSegmentId: '',
    imageAgentModeEnabled: false,
    imageAgentPrompt: '',
  };
}
