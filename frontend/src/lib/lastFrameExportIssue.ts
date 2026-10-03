import { useToastStore } from '@/store/useToastStore';

const MAX_REPORTED_EXPORTS = 500;
const reportedExports = new Set<string>();

export function reportLastFrameExportIssues(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const event = payload as Record<string, unknown>;
  const requestId = String(event.requestId || '').trim();
  if (!requestId || !Array.isArray(event.outputs)) return;

  for (const entry of event.outputs) {
    if (!entry || typeof entry !== 'object') continue;
    const output = entry as Record<string, unknown>;
    const warning = typeof output.lastFrameExportError === 'string'
      ? output.lastFrameExportError.trim() : '';
    if (!warning) continue;

    const path = String(output.fullpath || output.fullPath || output.path || output.filename || '').trim();
    const promptId = String(event.promptId || '').trim();
    const key = JSON.stringify([requestId, promptId, event.promptIndex, path]);
    if (reportedExports.has(key)) continue;
    reportedExports.add(key);
    if (reportedExports.size > MAX_REPORTED_EXPORTS) {
      reportedExports.delete(reportedExports.values().next().value!);
    }

    const cause = warning.replace(/^Video saved, but its last frame could not be exported:\s*/i, '').trim().replace(/[.!?]+$/, '');
    const filename = String(output.filename || path.replace(/\\/g, '/').split('/').pop() || '').trim();
    useToastStore.getState().addToast({
      type: 'error',
      message: `Video${filename ? ` (${filename})` : ''} was saved, but its last frame was not exported. Cause: ${cause || warning}. Check the cause, then extract the final frame from the saved video or rerun with Save last frame enabled.`,
    });
  }
}
