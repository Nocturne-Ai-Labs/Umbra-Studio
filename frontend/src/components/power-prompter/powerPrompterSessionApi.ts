import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import { normalizePowerPrompterCardDocument } from '@/lib/powerPrompter';
import { normalizeChainCards } from '@/lib/powerPrompterChain';

export interface PowerPrompterDocumentSession {
  version: 1;
  file: string | null;
  document: PowerPrompterCardDocument | null;
  composedPrompt: string;
  revision: number;
  dirty: boolean;
  lastSavedAt: number;
  updatedAt: number;
  sourceClientId: string;
}

export interface PowerPrompterDocumentSessionEnvelope {
  type?: string;
  reason?: string;
  success?: boolean;
  session?: PowerPrompterDocumentSession | null;
  error?: string;
}

function normalizeSession(rawValue: unknown): PowerPrompterDocumentSession | null {
  const raw = rawValue as Partial<PowerPrompterDocumentSession> | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const file = String(raw.file || '').trim().replace(/\\/g, '/') || null;
  const normalizedDocument = raw.document ? normalizePowerPrompterCardDocument(raw.document, file) : null;
  const document = normalizedDocument
    ? {
      ...normalizedDocument,
      cards: normalizeChainCards(normalizedDocument.cards),
    }
    : null;
  return {
    version: 1,
    file,
    document,
    composedPrompt: String(raw.composedPrompt || ''),
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
    dirty: raw.dirty === true,
    lastSavedAt: Math.max(0, Math.floor(Number(raw.lastSavedAt) || 0)),
    updatedAt: Math.max(0, Math.floor(Number(raw.updatedAt) || 0)),
    sourceClientId: String(raw.sourceClientId || '').trim(),
  };
}

async function readSessionResponse(response: Response): Promise<PowerPrompterDocumentSessionEnvelope> {
  const payload = await response.json().catch(() => null) as PowerPrompterDocumentSessionEnvelope | null;
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `Power Prompter session request failed (${response.status})`));
  }
  return {
    ...payload,
    session: normalizeSession(payload?.session),
  };
}

export async function loadPowerPrompterDocumentSession(file?: string | null): Promise<PowerPrompterDocumentSessionEnvelope> {
  const query = file ? `?file=${encodeURIComponent(file)}` : '';
  const response = await fetch(`/api/powerprompter/session${query}`, { cache: 'no-store' });
  return readSessionResponse(response);
}

export async function openPowerPrompterDocumentSession(file: string, clientId: string): Promise<PowerPrompterDocumentSessionEnvelope> {
  const response = await fetch('/api/powerprompter/session/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, clientId }),
  });
  return readSessionResponse(response);
}

export async function updatePowerPrompterDocumentSession(input: {
  file: string;
  document: PowerPrompterCardDocument;
  clientId: string;
  save?: boolean;
  intent?: string;
}): Promise<PowerPrompterDocumentSessionEnvelope> {
  const response = await fetch('/api/powerprompter/session', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readSessionResponse(response);
}

export function normalizePowerPrompterDocumentSessionEnvelope(rawValue: unknown): PowerPrompterDocumentSessionEnvelope | null {
  const raw = rawValue as PowerPrompterDocumentSessionEnvelope | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const session = normalizeSession(raw.session);
  if (!session) return null;
  return {
    ...raw,
    session,
  };
}
