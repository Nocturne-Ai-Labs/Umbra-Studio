/** Keep document opens, saves, and live edits in request order across file I/O. */
export function createPowerPrompterSessionGate() {
  let tail: Promise<void> = Promise.resolve();
  return function run<T>(action: () => T | Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

export class PowerPrompterSessionConflictError extends Error {
  constructor(message = 'The Power Prompter document changed on another client. Your edits were not saved.') {
    super(message);
    this.name = 'PowerPrompterSessionConflictError';
  }
}

export function assertPowerPrompterSessionFile(activeFile: string | null, requestedFile: string): void {
  if (activeFile !== requestedFile) {
    throw new PowerPrompterSessionConflictError('The active Power Prompter document changed. Reopen the file before saving.');
  }
}

export function assertPowerPrompterSessionRevision(currentRevision: number, expectedRevision: unknown): void {
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision)
    || expectedRevision !== currentRevision) {
    throw new PowerPrompterSessionConflictError();
  }
}

export function shouldReusePowerPrompterSession(activeFile: string | null, requestedFile: string, hasDocument: boolean): boolean {
  return hasDocument && activeFile === requestedFile;
}

export function assertPowerPrompterSessionCanOpen(activeFile: string | null, requestedFile: string, dirty: boolean): void {
  if (dirty && activeFile !== requestedFile) {
    throw new PowerPrompterSessionConflictError('Save the current Power Prompter document before opening another file.');
  }
}

export function assertPowerPrompterCardEditorRevision(
  activeFile: string | null,
  requestedFile: string,
  hasDocument: boolean,
  currentRevision: number,
  expectedRevision: unknown,
): boolean {
  const active = shouldReusePowerPrompterSession(activeFile, requestedFile, hasDocument);
  if (active || expectedRevision !== null) {
    if (!active) throw new PowerPrompterSessionConflictError();
    assertPowerPrompterSessionRevision(currentRevision, expectedRevision);
  }
  return active;
}

export function assertPowerPrompterCardStorageRevision(currentRevision: string, expectedRevision: unknown): void {
  if (typeof expectedRevision !== 'string' || expectedRevision !== currentRevision) {
    throw new PowerPrompterSessionConflictError();
  }
}
