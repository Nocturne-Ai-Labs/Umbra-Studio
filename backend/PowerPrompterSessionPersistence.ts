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
  storageToken?: string;
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
  return { ...summary, dirty: true, document: session.document, storageToken };
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
  if (value.dirty !== true) return summary;
  const document = value.document;
  if (!file || !document || typeof document !== 'object' || Array.isArray(document)
    || (document as Record<string, unknown>).file !== file
    || !Array.isArray((document as Record<string, unknown>).cards)
    || typeof value.storageToken !== 'string' || !value.storageToken) return null;
  return { ...summary, dirty: true, document, storageToken: value.storageToken };
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

export async function getPowerPrompterCanonicalStorageToken(
  resolved: { fullPath: string; sidecarPath: string },
): Promise<string | null> {
  const storagePath = existsSync(resolved.sidecarPath) ? resolved.sidecarPath : resolved.fullPath;
  const canonicalStat = await stat(storagePath).catch(() => null);
  if (!canonicalStat?.isFile()) return null;
  const kind = storagePath === resolved.sidecarPath ? 'card' : 'text';
  return `${kind}:${canonicalStat.dev}:${canonicalStat.ino}:${canonicalStat.size}:${canonicalStat.mtimeMs}:${canonicalStat.ctimeMs}`;
}
