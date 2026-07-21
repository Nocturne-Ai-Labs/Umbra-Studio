import type {
  PersistedPausedQueueSnapshot,
  PowerPrompterQueueHistoryDocument,
  PowerPrompterQueueHistorySummary,
  SavedPowerPrompterQueueDocument,
  SavedPowerPrompterQueueSummary,
} from './queueCore';
import {
  normalizePowerPrompterQueueHistoryDocument,
  normalizePowerPrompterQueueHistorySummary,
  normalizeSavedPowerPrompterQueueDocument,
  normalizeSavedPowerPrompterQueueSummary,
} from './queuePersistence';

type JsonPayload = Record<string, unknown>;

async function readJsonPayload(response: Response, fallbackMessage: string): Promise<JsonPayload> {
  const payload = await response.json().catch(() => ({})) as JsonPayload;
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `${fallbackMessage} (${response.status})`));
  }
  return payload;
}

export async function listSavedPowerPrompterQueues(): Promise<SavedPowerPrompterQueueSummary[]> {
  const response = await fetch('/api/powerprompter/queues');
  const payload = await readJsonPayload(response, 'Failed to list saved queues');
  return Array.isArray(payload?.items)
    ? payload.items
      .map(normalizeSavedPowerPrompterQueueSummary)
      .filter((entry: SavedPowerPrompterQueueSummary | null): entry is SavedPowerPrompterQueueSummary => !!entry)
    : [];
}

export async function savePowerPrompterQueueSnapshot(
  name: string,
  snapshot: PersistedPausedQueueSnapshot
): Promise<SavedPowerPrompterQueueDocument | null> {
  const response = await fetch('/api/powerprompter/queues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, snapshot }),
  });
  const payload = await readJsonPayload(response, 'Failed to save queue');
  return normalizeSavedPowerPrompterQueueDocument(payload?.item);
}

export async function loadSavedPowerPrompterQueue(id: string): Promise<SavedPowerPrompterQueueDocument | null> {
  const response = await fetch(`/api/powerprompter/queues?id=${encodeURIComponent(id)}`);
  const payload = await readJsonPayload(response, 'Failed to load saved queue');
  return normalizeSavedPowerPrompterQueueDocument(payload?.item);
}

export async function deleteSavedPowerPrompterQueue(id: string): Promise<boolean> {
  const response = await fetch(`/api/powerprompter/queues?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const payload = await readJsonPayload(response, 'Failed to delete saved queue');
  return payload?.deleted !== false;
}

export async function listPowerPrompterQueueHistory(): Promise<PowerPrompterQueueHistorySummary[]> {
  const response = await fetch('/api/powerprompter/queue-history');
  const payload = await readJsonPayload(response, 'Failed to list queue history');
  return Array.isArray(payload?.items)
    ? payload.items
      .map(normalizePowerPrompterQueueHistorySummary)
      .filter((entry: PowerPrompterQueueHistorySummary | null): entry is PowerPrompterQueueHistorySummary => !!entry)
    : [];
}

export async function loadPowerPrompterQueueHistory(id: string): Promise<PowerPrompterQueueHistoryDocument | null> {
  const response = await fetch(`/api/powerprompter/queue-history?id=${encodeURIComponent(id)}`);
  const payload = await readJsonPayload(response, 'Failed to load queue history');
  return normalizePowerPrompterQueueHistoryDocument(payload?.item);
}

export async function createPowerPrompterQueueHistory(input: {
  name: string;
  status: PowerPrompterQueueHistorySummary['status'];
  snapshot: PersistedPausedQueueSnapshot;
  previewImages?: PowerPrompterQueueHistorySummary['previewImages'];
}): Promise<PowerPrompterQueueHistoryDocument | null> {
  const response = await fetch('/api/powerprompter/queue-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJsonPayload(response, 'Failed to create queue history');
  return normalizePowerPrompterQueueHistoryDocument(payload?.item);
}

export async function patchPowerPrompterQueueHistory(
  id: string,
  patch: Record<string, unknown>
): Promise<PowerPrompterQueueHistoryDocument | null> {
  const response = await fetch(`/api/powerprompter/queue-history?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const payload = await readJsonPayload(response, 'Failed to update queue history');
  return normalizePowerPrompterQueueHistoryDocument(payload?.item);
}

export async function deletePowerPrompterQueueHistory(id: string): Promise<void> {
  const response = await fetch(`/api/powerprompter/queue-history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await readJsonPayload(response, 'Failed to delete queue history');
}
