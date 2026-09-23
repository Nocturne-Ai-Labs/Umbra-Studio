import { isAbsolute, relative, sep } from 'node:path';
import { assertPowerPrompterCardStorageRevision, assertPowerPrompterSessionRevision, PowerPrompterSessionConflictError } from './PowerPrompterSessionGate';

export function isPowerPrompterRawWriteCandidate(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.txt') || lower.endsWith('.ppcards.json');
}

export function getPowerPrompterRawCardLogicalFile(path: string): string {
  const extension = '.ppcards.json';
  return path.toLowerCase().endsWith(`.txt${extension}`) ? path.slice(0, -extension.length) : path;
}

export function isPowerPrompterRawWritePhysicalTarget(
  logicalPath: string,
  physicalPath: string,
  logicalPromptsRoot: string,
  physicalPromptsRoot: string,
): boolean {
  const logicalRelative = relative(logicalPromptsRoot, logicalPath);
  const physicalRelative = relative(physicalPromptsRoot, physicalPath);
  const inside = (value: string) => value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
  if (!inside(logicalRelative) || !inside(physicalRelative)) return false;
  return process.platform === 'win32'
    ? logicalRelative.toLowerCase() === physicalRelative.toLowerCase()
    : logicalRelative === physicalRelative;
}

export function isPowerPrompterRawWriteActiveTarget(
  targetPath: string,
  activeFilePath: string | null,
  activeSidecarPath: string | null,
): boolean {
  return !!activeFilePath && (relative(targetPath, activeFilePath) === ''
    || (!!activeSidecarPath && relative(targetPath, activeSidecarPath) === ''));
}

export function choosePowerPrompterRawCardSaveFile(active: boolean, activeFile: string | null, logicalFile: string): string {
  return active && activeFile ? activeFile : logicalFile;
}

interface PowerPrompterRawWriteSessionState<TDocument> {
  document: TDocument | null;
  composedPrompt: string;
  revision: number;
  dirty: boolean;
  lastSavedAt: number;
  updatedAt: number;
  sourceClientId: string;
}

export function advancePowerPrompterRawWriteSession<TDocument, TSession extends PowerPrompterRawWriteSessionState<TDocument>>(
  session: TSession,
  now: number,
  saved: { document: TDocument; composedPrompt: string },
): TSession {
  return {
    ...session,
    document: saved.document,
    composedPrompt: saved.composedPrompt,
    dirty: false,
    lastSavedAt: now,
    revision: Math.max(session.revision + 1, now),
    updatedAt: now,
    sourceClientId: '',
  } as TSession;
}

export async function runGuardedPowerPrompterRawWrite<T>(options: {
  kind: 'card' | 'text';
  textHasCardSidecar?: boolean;
  textHasOtherHardlinks?: boolean;
  active: boolean;
  currentRevision: number;
  expectedRevision: unknown;
  storageRevision: string;
  expectedStorageRevision: unknown;
  write: () => Promise<T>;
  publishActiveWrite: (written: T) => Promise<number>;
}): Promise<{ written: T; sessionRevision: number | null }> {
  if (options.kind === 'text' && options.textHasOtherHardlinks) {
    throw new PowerPrompterSessionConflictError('This Power Prompter text file is linked to another file and cannot be written through the raw file API.');
  }
  if (options.kind === 'text' && (options.active || options.textHasCardSidecar)) {
    throw new PowerPrompterSessionConflictError('Power Prompter card text must be updated through its document or card editor.');
  }
  if (options.active) {
    assertPowerPrompterSessionRevision(options.currentRevision, options.expectedRevision);
  } else if (options.storageRevision !== 'missing' || options.expectedStorageRevision !== undefined) {
    assertPowerPrompterCardStorageRevision(options.storageRevision, options.expectedStorageRevision);
  }
  const written = await options.write();
  const sessionRevision = options.active ? await options.publishActiveWrite(written) : null;
  return { written, sessionRevision };
}
