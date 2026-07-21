import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import {
  createDefaultUmbraUiAgentInstructions,
  type UmbraUiAgentContext,
  type UmbraUiAgentDraft,
  type UmbraUiAgentImageContext,
  type UmbraUiAgentInstruction,
  type UmbraUiAgentMediaType,
  type UmbraUiAgentVideoContext,
} from '../../../shared/umbra-ui/agentTypes';

export type {
  UmbraUiAgentContext,
  UmbraUiAgentDraft,
  UmbraUiAgentImageContext,
  UmbraUiAgentInstruction,
  UmbraUiAgentMediaType,
  UmbraUiAgentVideoContext,
};

export interface UmbraUiAgentConnectionSettings {
  endpoint: string;
  token: string;
  updatedAt: number;
  hermesConfig: {
    mcp_servers: {
      umbra_ui: {
        url: string;
        headers: { Authorization: string };
      };
    };
  };
}

function createInstructionId(): string {
  try {
    return `agent-instruction-${crypto.randomUUID()}`;
  } catch {
    return `agent-instruction-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createUmbraUiAgentInstruction(
  mediaType: UmbraUiAgentMediaType = 'image',
  order = 0,
): UmbraUiAgentInstruction {
  const now = Date.now();
  return {
    id: createInstructionId(),
    name: mediaType === 'video' ? 'New Video Instruction' : 'New Image Instruction',
    mediaType,
    instruction: '',
    createdAt: now,
    updatedAt: now,
    order,
  };
}

function normalizeInstructions(value: unknown): UmbraUiAgentInstruction[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const seen = new Set<string>();
  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Partial<UmbraUiAgentInstruction>;
      const name = String(raw.name || '').trim().slice(0, 120);
      const instruction = String(raw.instruction || '').trim().slice(0, 24_000);
      if (!name || !instruction) return null;
      let id = String(raw.id || '').trim().slice(0, 120);
      if (!id || seen.has(id.toLowerCase())) id = createInstructionId();
      seen.add(id.toLowerCase());
      const mediaType = raw.mediaType === 'image' || raw.mediaType === 'video' || raw.mediaType === 'both'
        ? raw.mediaType
        : 'both';
      const createdAt = Math.max(0, Number(raw.createdAt) || now);
      return {
        id,
        name,
        mediaType,
        instruction,
        createdAt,
        updatedAt: Math.max(createdAt, Number(raw.updatedAt) || createdAt),
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
      } satisfies UmbraUiAgentInstruction;
    })
    .filter((entry): entry is UmbraUiAgentInstruction => !!entry)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    .map((entry, order) => ({ ...entry, order }));
}

export async function loadUmbraUiAgentInstructions(): Promise<UmbraUiAgentInstruction[]> {
  const defaults = createDefaultUmbraUiAgentInstructions();
  const stored = await readUserConfig<unknown>('umbra-ui-agent-instructions', defaults);
  const normalized = normalizeInstructions(stored);
  if (normalized.length > 0) return normalized;
  await writeUserConfig('umbra-ui-agent-instructions', defaults);
  return defaults;
}

export async function saveUmbraUiAgentInstructions(instructions: UmbraUiAgentInstruction[]): Promise<UmbraUiAgentInstruction[]> {
  const now = Date.now();
  const normalized = normalizeInstructions(instructions.map((entry, order) => ({
    ...entry,
    updatedAt: now,
    order,
  })));
  if (normalized.length <= 0) throw new Error('Keep at least one complete agent instruction.');
  await writeUserConfig('umbra-ui-agent-instructions', normalized);
  return normalized;
}

async function readAgentApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `Umbra UI agent request failed (${response.status}).`));
  }
  return payload as T;
}

export async function loadUmbraUiAgentSettings(): Promise<UmbraUiAgentConnectionSettings> {
  const payload = await readAgentApi<UmbraUiAgentConnectionSettings & { success: boolean }>('/api/umbra-ui/agent/settings');
  return payload;
}

export async function regenerateUmbraUiAgentToken(): Promise<{ token: string; updatedAt: number }> {
  return readAgentApi('/api/umbra-ui/agent/settings/regenerate-token', { method: 'POST' });
}

export async function publishUmbraUiAgentContext(context: UmbraUiAgentContext): Promise<void> {
  await readAgentApi('/api/umbra-ui/agent/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });
}

export interface UmbraUiAgentGenerateRequest {
  mediaType: 'image' | 'video';
  prompt: string;
  instructionId?: string;
  context?: Record<string, unknown>;
}

export interface UmbraUiAgentGenerateResult {
  prompt: string;
  instructionId: string;
  instructionName: string;
  durationMs: number;
}

export async function generateUmbraUiAgentPrompt(
  request: UmbraUiAgentGenerateRequest,
): Promise<UmbraUiAgentGenerateResult> {
  return readAgentApi<UmbraUiAgentGenerateResult & { success: boolean }>('/api/umbra-ui/agent/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function loadUmbraUiAgentDrafts(): Promise<UmbraUiAgentDraft[]> {
  const payload = await readAgentApi<{ success: boolean; drafts: UmbraUiAgentDraft[] }>('/api/umbra-ui/agent/drafts');
  return Array.isArray(payload.drafts) ? payload.drafts : [];
}

export async function discardUmbraUiAgentDraft(id: string): Promise<void> {
  await readAgentApi(`/api/umbra-ui/agent/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function formatHermesMcpConfig(settings: UmbraUiAgentConnectionSettings): string {
  return [
    'mcp_servers:',
    '  umbra_ui:',
    `    url: "${settings.endpoint.replace(/"/g, '\\"')}"`,
    '    headers:',
    `      Authorization: "Bearer ${settings.token.replace(/"/g, '\\"')}"`,
  ].join('\n');
}
