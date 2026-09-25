import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';

/** The saved card stays canonical; a dirty session record is a recoverable draft. */
export interface PersistedPowerPrompterDocumentSession<TDocument = unknown> {
  version: 1;
  file: string | null;
  revision: number;
  lastSavedAt: number;
  updatedAt: number;
  dirty?: true;
  document?: TDocument;
  documentChecksum?: string;
  storageToken?: string;
}

function checksumPowerPrompterDocument(document: unknown): string {
  const serialized = JSON.stringify(document);
  if (typeof serialized !== 'string') throw new Error('Invalid Power Prompter recovery document.');
  return createHash('sha256').update(serialized).digest('hex');
}

function checksumPowerPrompterDocumentWithoutUpdatedAt(document: unknown): string {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Invalid Power Prompter recovery document.');
  }
  const comparable = { ...(document as Record<string, unknown>) };
  delete comparable.updatedAt;
  return checksumPowerPrompterDocument(comparable);
}

interface PowerPrompterSessionRecordSource<TDocument> {
  file: string | null;
  revision: number;
  lastSavedAt: number;
  updatedAt: number;
  dirty: boolean;
  document: TDocument | null;
}

export function buildPowerPrompterSessionRecord<TDocument>(
  session: PowerPrompterSessionRecordSource<TDocument>,
  storageToken?: string | null,
): PersistedPowerPrompterDocumentSession<TDocument> {
  const summary: PersistedPowerPrompterDocumentSession<TDocument> = {
    version: 1,
    file: session.file,
    revision: session.revision,
    lastSavedAt: session.lastSavedAt,
    updatedAt: session.updatedAt,
  };
  if (!session.dirty) return summary;
  if (!session.file || !session.document || !storageToken) {
    throw new Error('A dirty Power Prompter session needs a saved card and a storage token.');
  }
  return {
    ...summary,
    dirty: true,
    document: session.document,
    documentChecksum: checksumPowerPrompterDocument(session.document),
    storageToken,
  };
}

/** Publish a live dirty session only after its recovery record is durable. */
export async function commitPowerPrompterDirtySession<TSession>(
  session: TSession,
  storageToken: string,
  persist: (session: TSession, storageToken: string) => Promise<void>,
  commit: (session: TSession, storageToken: string) => void,
): Promise<void> {
  await persist(session, storageToken);
  commit(session, storageToken);
}

export function parsePowerPrompterSessionRecord(raw: unknown): PersistedPowerPrompterDocumentSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || (value.file !== null && typeof value.file !== 'string')) return null;
  const file = typeof value.file === 'string' ? value.file.trim().replace(/\\/g, '/') || null : null;
  const revision = value.revision;
  const lastSavedAt = value.lastSavedAt;
  const updatedAt = value.updatedAt;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0
    || typeof lastSavedAt !== 'number' || !Number.isSafeInteger(lastSavedAt) || lastSavedAt < 0
    || typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0) return null;
  const summary: PersistedPowerPrompterDocumentSession = {
    version: 1,
    file,
    revision,
    lastSavedAt,
    updatedAt,
  };
  if (value.dirty !== undefined && value.dirty !== false && value.dirty !== true) return null;
  if (value.dirty !== true) {
    if ('document' in value || 'documentChecksum' in value || 'storageToken' in value) return null;
    return summary;
  }
  const document = value.document;
  const cards = document && typeof document === 'object' && !Array.isArray(document)
    ? (document as Record<string, unknown>).cards
    : null;
  if (!file || !document || typeof document !== 'object' || Array.isArray(document)
    || (document as Record<string, unknown>).file !== file
    || !Array.isArray(cards) || cards.length === 0
    || !cards.every((card) => card && typeof card === 'object' && !Array.isArray(card)
      && typeof card.id === 'string' && card.id.trim().length > 0
      && ['character', 'location', 'expression', 'action', 'style', 'custom'].includes(card.type)
      && typeof card.text === 'string')
    || ('documentChecksum' in value && (typeof value.documentChecksum !== 'string'
      || value.documentChecksum !== checksumPowerPrompterDocument(document)))
    || typeof value.storageToken !== 'string' || !value.storageToken) return null;
  return {
    ...summary,
    dirty: true,
    document,
    ...(typeof value.documentChecksum === 'string' ? { documentChecksum: value.documentChecksum } : {}),
    storageToken: value.storageToken,
  };
}

export function getRestorablePowerPrompterDraft(
  record: PersistedPowerPrompterDocumentSession | null,
  resolvedFile: string,
  currentStorageToken: string | null,
): unknown | null {
  return record?.dirty === true && record.file === resolvedFile
    && !!currentStorageToken && record.storageToken === currentStorageToken
    ? record.document ?? null
    : null;
}

/** A failed clean-summary write may leave a dirty record after its card was saved. */
export function isPowerPrompterDirtyDraftAlreadySaved(
  record: PersistedPowerPrompterDocumentSession | null,
  resolvedFile: string,
  canonicalDocument: unknown,
): boolean {
  if (record?.dirty !== true || record.file !== resolvedFile || !canonicalDocument) return false;
  try {
    return checksumPowerPrompterDocumentWithoutUpdatedAt(record.document)
      === checksumPowerPrompterDocumentWithoutUpdatedAt(canonicalDocument);
  } catch {
    return false;
  }
}

export async function getPowerPrompterCanonicalStorageToken(
  resolved: { fullPath: string; sidecarPath: string },
): Promise<string | null> {
  const storagePath = existsSync(resolved.sidecarPath) ? resolved.sidecarPath : resolved.fullPath;
  const canonicalStat = await stat(storagePath).catch(() => null);
  if (!canonicalStat?.isFile()) return null;
  const kind = storagePath === resolved.sidecarPath ? 'card' : 'text';
  return `${kind}:${canonicalStat.dev}:${canonicalStat.ino}:${canonicalStat.size}:${canonicalStat.mtimeMs}:${canonicalStat.ctimeMs}`;
}
