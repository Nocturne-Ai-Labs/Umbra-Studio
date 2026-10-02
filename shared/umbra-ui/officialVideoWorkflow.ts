export type OfficialVideoWorkflowId = 'h3-26' | 'ltx23-50';
export interface OfficialVideoBinding {
  nodeId: string;
  inputName: string;
  value: string;
}
export interface OfficialVideoWorkflowSelection {
  workflowId: OfficialVideoWorkflowId;
  captureId: string;
  bindings: OfficialVideoBinding[];
}
export const isOfficialVideoWorkflowId = (value: unknown): value is OfficialVideoWorkflowId => value === 'h3-26' || value === 'ltx23-50';
export function normalizeOfficialVideoWorkflowSelection(value: unknown): OfficialVideoWorkflowSelection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!isOfficialVideoWorkflowId(raw.workflowId) || typeof raw.captureId !== 'string'
    || !new RegExp(`^official-dasiwa-${raw.workflowId}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`).test(raw.captureId)) return undefined;
  if (raw.bindings != null && !Array.isArray(raw.bindings)) return undefined;
  const bindings: OfficialVideoBinding[] = [];
  for (const entry of (raw.bindings || []) as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    const binding = entry as Record<string, unknown>;
    if (typeof binding.nodeId !== 'string' || !binding.nodeId || binding.nodeId.length > 160
      || typeof binding.inputName !== 'string' || !binding.inputName || binding.inputName.length > 100
      || typeof binding.value !== 'string' || binding.value.length > 4096) return undefined;
    bindings.push({ nodeId: binding.nodeId, inputName: binding.inputName, value: binding.value });
  }
  if (bindings.length > 100) return undefined;
  return { workflowId: raw.workflowId, captureId: raw.captureId, bindings };
}
