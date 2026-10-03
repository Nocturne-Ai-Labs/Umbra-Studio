type Output = Record<string, unknown>;

export interface UmbraUiVideoOutputHandoffState {
  initialized: boolean;
  seen: ReadonlySet<string>;
}

const MAX_SEEN_OUTPUTS = 8192;
const VIDEO_EXTENSION = /\.(?:mp4|webm|mkv|mov|avi|m4v|flv|wmv)$/i;

export function createUmbraUiVideoOutputHandoffState(): UmbraUiVideoOutputHandoffState {
  return { initialized: false, seen: new Set<string>() };
}

function outputPath(output: Output): string {
  return String(output.fullpath || output.fullPath || output.path || '').trim().replace(/\\/g, '/');
}

function outputKey(requestId: string, output: Output): string {
  const path = outputPath(output).toLowerCase();
  const outputRoot = 'tools/comfyui/output/';
  const rootIndex = path.indexOf(outputRoot);
  return `${requestId}:${rootIndex >= 0 ? path.slice(rootIndex) : path}`;
}

function videoOutputs(outputs: unknown): Output[] {
  return (Array.isArray(outputs) ? outputs : []).filter((value): value is Output => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const output = value as Output;
    const path = outputPath(output);
    return !output.lastFrameFor && Boolean(path)
      && (String(output.type || '').toLowerCase() === 'video' || VIDEO_EXTENSION.test(path));
  });
}

function remember(seen: Set<string>, key: string): void {
  seen.add(key);
  while (seen.size > MAX_SEEN_OUTPUTS) {
    const oldest = seen.values().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

export function primaryUmbraUiVideoSavedOutputs(payload: Record<string, unknown>): Record<string, unknown> | null {
  const outputs = videoOutputs(payload.outputs);
  return outputs.length > 0 ? { ...payload, outputs } : null;
}

export function observeUmbraUiVideoSavedOutput(
  state: UmbraUiVideoOutputHandoffState,
  payload: Record<string, unknown>,
): { state: UmbraUiVideoOutputHandoffState; event: Record<string, unknown> | null } {
  const primary = primaryUmbraUiVideoSavedOutputs(payload);
  if (!primary) return { state, event: null };
  const requestId = String(payload.requestId || '').trim();
  const seen = new Set(state.seen);
  const outputs = (primary.outputs as Output[]).filter((output) => {
    const key = outputKey(requestId, output);
    if (seen.has(key)) return false;
    remember(seen, key);
    return true;
  });
  return { state: { ...state, seen }, event: outputs.length ? { ...primary, outputs } : null };
}

export function observeUmbraUiVideoJobs(
  state: UmbraUiVideoOutputHandoffState,
  jobs: unknown,
  canApply: boolean,
): { state: UmbraUiVideoOutputHandoffState; events: Record<string, unknown>[] } {
  if (!canApply) return { state, events: [] };
  const completed = (Array.isArray(jobs) ? jobs : [])
    .filter((job): job is Output => !!job && typeof job === 'object' && job.status === 'completed')
    .sort((left, right) => Number(right.completedAt || right.updatedAt || 0) - Number(left.completedAt || left.updatedAt || 0));
  const seen = new Set(state.seen);
  const events: Record<string, unknown>[] = [];
  let primaryJobs = 0;
  for (const job of completed) {
    const requestId = String(job.requestId || '').trim();
    if (!requestId) continue;
    const primaryOutputs = videoOutputs(job.outputs);
    if (!primaryOutputs.length) continue;
    const startupSlot = primaryJobs++ < 3;
    const outputs = primaryOutputs.filter((output) => {
      const key = outputKey(requestId, output);
      if (seen.has(key)) return false;
      remember(seen, key);
      return true;
    });
    if (!outputs.length || (!state.initialized && !startupSlot)) continue;
    const modifiedMs = Number(job.completedAt || job.updatedAt || Date.now());
    events.push({
      type: 'queue_saved_outputs', mediaType: 'video', source: 'umbra-ui-video-jobs',
      requestId, promptIndex: job.promptIndex, promptId: job.promptId,
      positivePrompt: job.prompt,
      outputs: outputs.map((output) => ({
        ...output, fullpath: outputPath(output), filename: String(output.name || output.filename || outputPath(output).split('/').pop() || ''),
        mediaKind: 'videos', type: 'output', modifiedMs,
      })),
    });
  }
  return { state: { initialized: true, seen }, events: events.reverse() };
}
