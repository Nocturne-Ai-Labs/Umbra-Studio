/** Keep document opens, saves, and live edits in request order across file I/O. */
export function createPowerPrompterSessionGate() {
  let tail: Promise<void> = Promise.resolve();
  return function run<T>(action: () => T | Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function assertPowerPrompterSessionFile(activeFile: string | null, requestedFile: string): void {
  if (activeFile !== requestedFile) {
    throw new Error('The Power Prompter document changed. Reopen the file before saving.');
  }
}
