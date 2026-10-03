import { DEFAULT_OFFICIAL_H3_RESOLUTION, type OfficialVideoEditorDraft } from '../../../shared/umbra-ui/officialVideoEditor';
import type { OfficialVideoWorkflowId } from '../../../shared/umbra-ui/officialVideoWorkflow';

export async function prepareOfficialVideoResolution(draft: OfficialVideoEditorDraft, workflowId: OfficialVideoWorkflowId): Promise<OfficialVideoEditorDraft> {
  if (draft.resolution?.mode !== 'workflow') return draft;
  const h3 = { ...DEFAULT_OFFICIAL_H3_RESOLUTION, ...draft.resolution.h3 };
  const needsSource = workflowId === 'h3-26'
    ? h3.aspect === 'auto' && !(h3.resolution === 'custom' && h3.custom_mode === 'fixed')
    : draft.resolution.followSourceAspect;
  const reference = draft.references.find(item => item.kind !== 'audio');
  if (!needsSource || !reference) return draft;
  const dimensions = await new Promise<{ sourceWidth: number; sourceHeight: number }>((resolve, reject) => {
    const media = reference.kind === 'image' ? new Image() : document.createElement('video');
    const cleanup = () => {
      window.clearTimeout(timer);
      media.onload = null; media.onerror = null;
      if (media instanceof HTMLVideoElement) { media.onloadedmetadata = null; media.removeAttribute('src'); media.load(); }
      else media.removeAttribute('src');
    };
    const fail = () => { cleanup(); reject(new Error('Could not read the first reference dimensions. Re-upload it or choose a fixed aspect ratio.')); };
    const loaded = () => {
      const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      if (!sourceWidth || !sourceHeight) { fail(); return; }
      cleanup(); resolve({ sourceWidth, sourceHeight });
    };
    const timer = window.setTimeout(fail, 10000);
    media.onerror = fail;
    if (media instanceof HTMLVideoElement) { media.preload = 'metadata'; media.onloadedmetadata = loaded; }
    else media.onload = loaded;
    media.src = `/comfy/view?filename=${encodeURIComponent(reference.filename)}&type=input`;
  });
  return { ...draft, references: draft.references.map(item => item.id === reference.id ? { ...item, ...dimensions } : item) };
}
