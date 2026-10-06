import type { OfficialVideoEditorDraft } from '../../../shared/umbra-ui/officialVideoEditor';
import type { OfficialVideoWorkflowId } from '../../../shared/umbra-ui/officialVideoWorkflow';
import { hasOfficialH3Continuity } from '../../../shared/umbra-ui/officialH3Director';
import type { UmbraUiMediaHandoff } from './umbraUiMediaHandoff';

export function officialVideoHandoffWorkflow(current: OfficialVideoWorkflowId, handoff: UmbraUiMediaHandoff): OfficialVideoWorkflowId {
  if (handoff.h3DirectorRole) return 'h3-26';
  return handoff.videoFrameRole === 'middle' || handoff.videoFrameRole === 'source_video' ? 'ltx23-50' : current;
}

export function applyOfficialVideoMediaHandoff(
  current: OfficialVideoEditorDraft,
  workflowId: OfficialVideoWorkflowId,
  handoff: UmbraUiMediaHandoff,
  filename: string,
): OfficialVideoEditorDraft {
  if (!filename || /[\x00-\x1f:]|^[\\/]|(^|[\\/])\.\.?([\\/]|$)/.test(filename)) {
    throw new Error('The transferred media did not return a valid ComfyUI input filename.');
  }
  const h3 = workflowId === 'h3-26';
  const role = handoff.h3DirectorRole || handoff.videoFrameRole || 'first';
  const video = role === 'motion_video' || role === 'source_video';
  const addingReference = h3 && (role === 'reference_image' || video);
  const frame = 1 / current.frameRate;
  const lastStart = Math.max(0, current.durationSeconds - frame);
  const prompt = handoff.generation?.positivePrompt
    || handoff.generation?.positivePromptSegments?.map(segment => segment.text).filter(Boolean).join(', ');
  const reference: OfficialVideoEditorDraft['references'][number] = {
    id: crypto.randomUUID(), kind: video ? 'video' : 'image', filename, prompt: '',
    startSeconds: 0, durationSeconds: h3 ? video ? Math.min(2, current.durationSeconds) : 1 : frame,
    ...(video ? { mediaMode: 'video' as const } : {}),
  };
  let mode: string;
  let references: OfficialVideoEditorDraft['references'];
  if (addingReference) {
    mode = 'REF2VA';
    references = [...current.references.filter(item => item.filename !== filename), reference];
    if (references.length > 12 || references.filter(item => item.kind === 'image').length > 9
      || references.filter(item => item.kind === 'video').length > 3) throw new Error('The H3 reference slots are full. Remove a reference and resend.');
  } else if (video) {
    mode = 'V2V'; references = [{ ...reference, durationSeconds: current.durationSeconds }];
  } else if (role === 'middle') {
    if (h3) throw new Error('Middle frames require the LTX workflow.');
    mode = 'I2V';
    const startSeconds = Math.round(current.durationSeconds * current.frameRate / 2) / current.frameRate;
    references = [...current.references.filter(item => item.kind === 'image' && item.startSeconds !== startSeconds), { ...reference, startSeconds }]
      .sort((a, b) => a.startSeconds - b.startSeconds);
    if (references.some((item, index) => index > 0 && item.startSeconds < references[index - 1].startSeconds + references[index - 1].durationSeconds)) {
      throw new Error('The middle frame overlaps an existing reference. Adjust its timing and resend.');
    }
  } else if (role === 'last') {
    const first = ['I2VA', 'FL2VA', 'I2V', 'FLF2V'].includes(current.mode)
      ? current.references.find(item => item.kind === 'image' && item.startSeconds === 0) : undefined;
    if (!h3 && !first) throw new Error('Send a first frame before adding the last frame to LTX.');
    const middle = !h3 ? current.references.filter(item => item.kind === 'image' && item.startSeconds > 0 && item.startSeconds < lastStart) : [];
    mode = h3 ? first ? 'FL2VA' : 'L2VA' : middle.length ? 'I2V' : 'FLF2V';
    references = [...(first ? [{ ...first, startSeconds: 0, durationSeconds: h3 ? 1 : frame }] : []), ...middle, { ...reference, startSeconds: h3 ? 0 : lastStart }];
  } else {
    const last = current.mode === 'L2VA' ? current.references[0]
      : current.mode === 'FL2VA' ? current.references[1]
      : current.mode === 'FLF2V' ? current.references.find(item => item.startSeconds === lastStart) : undefined;
    const timeline = !h3 && ['I2V', 'FLF2V'].includes(current.mode)
      ? current.references.filter(item => item.kind === 'image' && item.startSeconds > 0) : [];
    mode = h3 ? last ? 'FL2VA' : 'I2VA' : timeline.length === 1 && timeline[0].startSeconds === lastStart ? 'FLF2V' : 'I2V';
    references = [reference, ...(h3 ? last ? [{ ...last, startSeconds: 0, durationSeconds: 1 }] : [] : timeline)];
  }
  return {
    ...current, mode, references, ...(prompt ? { prompt } : {}),
    // A new source must not remain hidden behind an old continuation source.
    ...(current.h3 ? { h3: { ...current.h3, continuity: addingReference
      ? { ...current.h3.continuity, useReferences: true, ...(prompt && hasOfficialH3Continuity(current.h3) ? { nextPrompt: prompt } : {}) }
      : { ...current.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' } } } : {}),
    ...(!h3 && current.ltx ? { ltx: { ...current.ltx, retake: { ...current.ltx.retake, enabled: false } } } : {}),
  };
}
