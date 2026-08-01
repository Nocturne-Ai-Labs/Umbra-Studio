import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';

type UnknownRecord = Record<string, unknown>;

export interface PowerPrompterReceiptInput {
  ppuid: string;
  outputPath: string;
  metadata: UnknownRecord;
  savedAt?: string;
}

export interface PowerPrompterReceipt extends PowerPrompterReceiptInput {
  version: 1;
}

interface StoredPowerPrompterReceipt {
  version: 1;
  ppuid: string;
  outputPath: string;
  savedAt: string;
  metadata: UnknownRecord;
  restoreSnapshot?: string;
}

const PPUID_PATTERN = /^pp_[a-z0-9][a-z0-9_-]{7,127}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePowerPrompterReceiptUid(value: unknown): string {
  const ppuid = String(value || '').trim().toLowerCase();
  return PPUID_PATTERN.test(ppuid) ? ppuid : '';
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
  try {
    await rm(path, { force: true });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writePowerPrompterReceipt(
  receiptRoot: string,
  input: PowerPrompterReceiptInput,
): Promise<PowerPrompterReceipt> {
  const ppuid = normalizePowerPrompterReceiptUid(input.ppuid);
  if (!ppuid) throw new Error('Invalid Power Prompter UID.');
  if (!isRecord(input.metadata)) throw new Error('Power Prompter receipt metadata is required.');

  const indexDirectory = join(receiptRoot, 'Index');
  const snapshotDirectory = join(receiptRoot, 'Snapshots');
  await Promise.all([
    mkdir(indexDirectory, { recursive: true }),
    mkdir(snapshotDirectory, { recursive: true }),
  ]);

  const metadata = { ...input.metadata };
  const restore = isRecord(metadata.restore) ? { ...metadata.restore } : null;
  const restoreHash = String(restore?.sha256 || '').trim().toLowerCase();
  let restoreSnapshot: string | undefined;

  if (restore && SHA256_PATTERN.test(restoreHash)) {
    restoreSnapshot = restoreHash;
    const snapshotPath = join(snapshotDirectory, `${restoreHash}.json`);
    if (!(await fileExists(snapshotPath))) {
      try {
        await atomicWriteJson(snapshotPath, restore);
      } catch (error) {
        // Concurrent outputs from one job share this snapshot. Another write winning is success.
        if (!(await fileExists(snapshotPath))) throw error;
      }
    }
    delete metadata.restore;
  }

  const receipt: StoredPowerPrompterReceipt = {
    version: 1,
    ppuid,
    outputPath: String(input.outputPath || '').trim(),
    savedAt: String(input.savedAt || new Date().toISOString()),
    metadata,
    ...(restoreSnapshot ? { restoreSnapshot } : {}),
  };
  await atomicWriteJson(join(indexDirectory, `${ppuid}.json`), receipt);

  return {
    version: 1,
    ppuid,
    outputPath: receipt.outputPath,
    savedAt: receipt.savedAt,
    metadata: { ...metadata, ...(restore ? { restore } : {}) },
  };
}

export async function readPowerPrompterReceipt(
  receiptRoot: string,
  value: unknown,
): Promise<PowerPrompterReceipt | null> {
  const ppuid = normalizePowerPrompterReceiptUid(value);
  if (!ppuid) return null;

  let stored: StoredPowerPrompterReceipt;
  try {
    stored = JSON.parse(await readFile(join(receiptRoot, 'Index', `${ppuid}.json`), 'utf8'));
  } catch {
    return null;
  }
  if (
    stored?.version !== 1
    || normalizePowerPrompterReceiptUid(stored.ppuid) !== ppuid
    || !isRecord(stored.metadata)
  ) {
    return null;
  }

  const metadata = { ...stored.metadata };
  if (stored.restoreSnapshot && SHA256_PATTERN.test(stored.restoreSnapshot)) {
    try {
      const restore = JSON.parse(
        await readFile(join(receiptRoot, 'Snapshots', `${stored.restoreSnapshot}.json`), 'utf8'),
      );
      if (!isRecord(restore)) return null;
      metadata.restore = restore;
    } catch {
      return null;
    }
  }

  return {
    version: 1,
    ppuid,
    outputPath: String(stored.outputPath || ''),
    savedAt: String(stored.savedAt || ''),
    metadata,
  };
}
