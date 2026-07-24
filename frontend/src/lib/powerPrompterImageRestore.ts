import type { ImageMetadata } from '@/utils/metadata';

const MAX_RESTORE_BYTES = 32 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toOwnedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function decompressGzip(value: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot decompress Power Prompter restore data.');
  }
  const stream = new Blob([toOwnedArrayBuffer(value)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export interface PowerPrompterImageRestoreResult {
  ppuid: string;
  promptIndex: number;
  setId: number;
  snapshot: unknown;
}

export async function decodePowerPrompterImageRestore(
  metadata: ImageMetadata | null | undefined,
): Promise<PowerPrompterImageRestoreResult> {
  const powerPrompter = isRecord(metadata?.umbra_power_prompter)
    ? metadata.umbra_power_prompter
    : null;
  if (!powerPrompter) {
    throw new Error('This PNG does not contain Power Prompter metadata.');
  }
  const restore = isRecord(powerPrompter.restore) ? powerPrompter.restore : null;
  if (!restore) {
    throw new Error('This image predates restorable Power Prompter snapshots.');
  }
  if (String(restore.encoding || '') !== 'gzip-base64') {
    throw new Error(`Unsupported Power Prompter restore encoding: ${String(restore.encoding || 'unknown')}.`);
  }
  const compressedBytes = Number(restore.compressedBytes);
  const uncompressedBytes = Number(restore.uncompressedBytes);
  if (
    (Number.isFinite(compressedBytes) && compressedBytes > MAX_RESTORE_BYTES)
    || (Number.isFinite(uncompressedBytes) && uncompressedBytes > MAX_RESTORE_BYTES)
  ) {
    throw new Error('The embedded Power Prompter snapshot is too large to load safely.');
  }

  const encoded = String(restore.data || '').trim();
  if (!encoded) throw new Error('The embedded Power Prompter snapshot is empty.');
  const compressed = decodeBase64(encoded);
  if (compressed.byteLength > MAX_RESTORE_BYTES) {
    throw new Error('The embedded Power Prompter snapshot is too large to load safely.');
  }
  const restoredBytes = await decompressGzip(compressed);
  if (restoredBytes.byteLength > MAX_RESTORE_BYTES) {
    throw new Error('The restored Power Prompter snapshot is too large to load safely.');
  }

  const expectedHash = String(restore.sha256 || '').trim().toLowerCase();
  if (expectedHash) {
    const actualHash = await sha256Hex(restoredBytes);
    if (actualHash !== expectedHash) {
      throw new Error('The embedded Power Prompter snapshot failed its integrity check.');
    }
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(new TextDecoder().decode(restoredBytes));
  } catch {
    throw new Error('The embedded Power Prompter snapshot is not valid JSON.');
  }

  return {
    ppuid: String(powerPrompter.ppuid || '').trim(),
    promptIndex: Math.max(0, Math.floor(Number(powerPrompter.promptIndex) || 0)),
    setId: Math.max(1, Math.floor(Number(powerPrompter.setId ?? powerPrompter.promptSetId) || 1)),
    snapshot,
  };
}
