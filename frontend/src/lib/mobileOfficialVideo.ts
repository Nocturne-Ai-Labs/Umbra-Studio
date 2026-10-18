import type { OfficialVideoEditorDraft } from '../../../shared/umbra-ui/officialVideoEditor';
import type { OfficialVideoWorkflowId } from '../../../shared/umbra-ui/officialVideoWorkflow';
import { readOfficialH3DirectorSettings } from '../../../shared/umbra-ui/officialH3Director';
import { readOfficialLtxDirectorSettings } from '../../../shared/umbra-ui/officialLtxDirector';

export type MobileVideoMode = 'text' | 'image';

/** Phone jobs are standalone clips. Never carry hidden Director tracks into them. */
export function mobileOfficialVideoDraft(
  workflowId: OfficialVideoWorkflowId,
  draft: OfficialVideoEditorDraft,
  requestedMode?: MobileVideoMode,
): OfficialVideoEditorDraft {
  const h3 = workflowId === 'h3-26';
  const image = draft.references.find(item => item.kind === 'image' && item.enabled !== false);
  const imageMode = requestedMode ? requestedMode === 'image'
    : ['I2VA', 'I2V'].includes(draft.mode) || (!['T2VA', 'T2V'].includes(draft.mode) && !!image);
  const values = { ...draft.values };
  // The pinned LTX graph needs its second pass to remove appended guide frames.
  if (!h3 && imageMode && !values['3676.value_1'] && !values['3676.value_2']) values['3676.value_1'] = true;
  return {
    ...draft,
    mode: h3 ? imageMode ? 'I2VA' : 'T2VA' : imageMode ? 'I2V' : 'T2V',
    references: imageMode && image ? [{
      id: image.id, kind: 'image', filename: image.filename, prompt: '', enabled: true,
      startSeconds: 0, durationSeconds: h3 ? 1 : 1 / draft.frameRate, guideStrength: 1,
      sourceWidth: image.sourceWidth, sourceHeight: image.sourceHeight,
    }] : [],
    h3: h3 ? readOfficialH3DirectorSettings({}) : undefined,
    ltx: h3 ? undefined : readOfficialLtxDirectorSettings({}),
    resolution: draft.resolution ? { ...draft.resolution, followSourceAspect: imageMode && draft.resolution.followSourceAspect } : undefined,
    values,
  };
}

export function mobileOfficialVideoInputError(draft: OfficialVideoEditorDraft): string {
  if (['I2VA', 'I2V'].includes(draft.mode)) {
    return draft.references.some(item => item.kind === 'image' && item.enabled !== false) ? '' : 'Choose an image to animate.';
  }
  return draft.prompt.trim() ? '' : 'Describe the video you want to make.';
}
