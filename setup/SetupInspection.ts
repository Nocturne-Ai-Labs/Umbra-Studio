import { spawn, type ChildProcess } from 'node:child_process';

export type SetupInspectionKind = 'onboarding' | 'dependencies';

/** Keep synchronous Git, Python and file checks out of the Setup listener. */
export function createSetupInspector(options: { entrypoint: string; runtimeRoot: string; sourceRoot: string }) {
  const pending = new Map<SetupInspectionKind, Promise<unknown>>();
  let active: ChildProcess | null = null;
  let tail = Promise.resolve();
  let closed = false;

  const inspect = <T = unknown>(kind: SetupInspectionKind): Promise<T> => {
    if (closed) return Promise.reject(new Error('Setup is closing.'));
    const existing = pending.get(kind);
    if (existing) return existing as Promise<T>;
    const result = tail.then(() => new Promise<unknown>((resolve, reject) => {
      if (closed) { reject(new Error('Setup is closing.')); return; }
      const child = spawn(process.execPath, [options.entrypoint, '--inspect', kind,
        '--root', options.runtimeRoot, '--source', options.sourceRoot], {
        cwd: options.runtimeRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, UMBRA_ROOT: options.runtimeRoot },
      });
      active = child;
      let output = '', bytes = 0;
      let failure: Error | null = null;
      const timer = setTimeout(() => {
        failure = new Error('The installation check timed out. Retry the check.');
        child.kill();
      }, 120_000);
      child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 8 * 1024 * 1024) {
          failure = new Error('The installation check returned too much data.');
          child.kill();
        } else output += chunk;
      });
      // Child errors are returned as structured output; never expose raw process logs.
      child.stderr!.resume();
      child.once('error', error => { failure = error; });
      child.once('close', code => {
        clearTimeout(timer);
        if (active === child) active = null;
        if (failure) { reject(failure); return; }
        try {
          const response = JSON.parse(output);
          if (code !== 0 || response.success !== true) throw new Error(response.error || 'The installation check failed. Retry the check.');
          resolve(response.result);
        } catch (error) { reject(error instanceof SyntaxError ? new Error('The installation check could not be read. Retry the check.') : error); }
      });
    }));
    pending.set(kind, result);
    tail = result.then(() => {}, () => {});
    void result.finally(() => { if (pending.get(kind) === result) pending.delete(kind); }).catch(() => {});
    return result as Promise<T>;
  };
  return { inspect, close() { closed = true; active?.kill(); } };
}
