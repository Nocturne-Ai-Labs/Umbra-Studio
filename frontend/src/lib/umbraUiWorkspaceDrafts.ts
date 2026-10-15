import { normalizeUmbraUiImageControlsSnapshot, type UmbraUiImageControlsSnapshot } from '@/lib/umbraUiImageControlsPersistence';
import { createUmbraUiPromptSegment, migrateLegacyUmbraUiAgentPrompt, type UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';

export type ImageWorkspace = 'image' | 'img2img' | 'inpaint' | 'canvas' | 'edit';
export interface ImageWorkspaceDraft {
  controls: UmbraUiImageControlsSnapshot;
  promptSegments: UmbraUiPromptSegment[];
  activePromptSegmentId: string;
}
export type ImageWorkspaceDrafts = Partial<Record<ImageWorkspace, ImageWorkspaceDraft>>;

export function isImageWorkspace(mode: string): mode is ImageWorkspace {
  return mode === 'image' || mode === 'img2img' || mode === 'inpaint' || mode === 'canvas' || mode === 'edit';
}

export function usesInpaintWorkspacePipeline(mode: string): boolean {
  return mode === 'inpaint' || mode === 'canvas' || mode === 'edit';
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
      promptSegments: migrateLegacyUmbraUiAgentPrompt(
        promptSegments.length ? promptSegments : [createUmbraUiPromptSegment()],
        raw.imageAgentModeEnabled === true,
        typeof raw.imageAgentPrompt === 'string' ? raw.imageAgentPrompt : '',
      ),
      activePromptSegmentId: typeof raw.activePromptSegmentId === 'string' ? raw.activePromptSegmentId : '',
    };
  }
  return result;
}

export function createImageWorkspaceDraft(mode?: ImageWorkspace): ImageWorkspaceDraft {
  return {
    controls: normalizeUmbraUiImageControlsSnapshot(mode === 'edit'
      ? { modelFamily: 'FLUX.3', generation: { modelType: 'diffusion_model', steps: 16, cfg: 1, samplerName: 'euler', scheduler: 'simple' } }
      : { modelFamily: 'Anima', generation: {} })!,
    promptSegments: [createUmbraUiPromptSegment()],
    activePromptSegmentId: '',
  };
}

export function stageImageWorkspaceNavigation(
  drafts: ImageWorkspaceDrafts,
  fromMode: string,
  fromDraft: ImageWorkspaceDraft | null,
  toMode: string,
): ImageWorkspaceDraft | null {
  if (isImageWorkspace(fromMode) && fromDraft) {
    drafts[fromMode] = structuredClone(fromDraft);
    // Canvas and Edit are two views of the same editor. Keep their model and
    // controls together so changing views cannot disable the Edit selector.
    if (fromMode === 'canvas' || fromMode === 'edit') {
      drafts[fromMode === 'canvas' ? 'edit' : 'canvas'] = structuredClone(fromDraft);
    }
  }
  if (!isImageWorkspace(toMode)) return null;
  // Save the first destination draft before the active mode changes. A reload
  // during the debounced save must still restore this workspace's own controls.
  drafts[toMode] ||= createImageWorkspaceDraft(toMode);
  return drafts[toMode];
}
