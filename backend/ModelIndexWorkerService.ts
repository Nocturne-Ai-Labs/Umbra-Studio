import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';

type ModelRootDescriptor = {
  key: 'user' | 'comfyui' | 'aitoolkit';
  label: string;
  path: string;
  fullPath: string;
};

type ModelIndexWorkerRequest =
  | {
      id: string;
      type: 'roots';
      payload: {
        roots: ModelRootDescriptor[];
      };
    }
  | {
      id: string;
      type: 'tree';
      payload: {
        path: string;
        fullPath: string;
        includeMetadata?: boolean;
      };
    }
  | {
      id: string;
      type: 'list';
      payload: {
        path: string;
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'summary';
      payload: {
        path: string;
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'invalidate';
      payload: {
        fullPaths: string[];
      };
    };

type ModelIndexWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const WORKER_REQUEST_TIMEOUT_MS = 60_000;

export class ModelIndexWorkerService {
  private child: ChildProcess | null = null;
  private buffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly workerScriptPath: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: { sourceRoot: string; runtimeRoot: string }) {
    this.cwd = options.sourceRoot;
    this.workerScriptPath = join(options.sourceRoot, 'backend', 'ModelIndexWorkerProcess.ts');
    this.env = {
      ...process.env,
      UMBRA_ROOT: options.runtimeRoot,
    };
  }

  async getRoots(roots: ModelRootDescriptor[]) {
    return this.sendRequest({ type: 'roots', payload: { roots } });
  }

  async tree(payload: Extract<ModelIndexWorkerRequest, { type: 'tree' }>['payload']) {
    return this.sendRequest({ type: 'tree', payload });
  }

  async list(payload: Extract<ModelIndexWorkerRequest, { type: 'list' }>['payload']) {
    return this.sendRequest({ type: 'list', payload });
  }

  async summary(payload: Extract<ModelIndexWorkerRequest, { type: 'summary' }>['payload']) {
    return this.sendRequest({ type: 'summary', payload });
  }

  async invalidatePaths(fullPaths: string[]) {
    if (!Array.isArray(fullPaths) || fullPaths.length <= 0) return { success: true };
    return this.sendRequest({
      type: 'invalidate',
      payload: { fullPaths },
    });
  }

  dispose() {
    this.disposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.failPending(new Error('Model index worker disposed'));
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        // best effort
      }
    }
    this.child = null;
  }

  private failPending(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private ensureWorker() {
    if (this.disposed) {
      throw new Error('Model index worker service has been disposed');
    }
    if (this.child && this.child.exitCode === null && this.child.stdin && !this.child.stdin.destroyed) {
      return this.child;
    }

    const bunExecutable = process.execPath;
    const child = spawn(bunExecutable, [this.workerScriptPath], {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.buffer = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.buffer += String(chunk);
      while (true) {
        const newlineIndex = this.buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (!line) continue;

        try {
          const response = JSON.parse(line) as ModelIndexWorkerResponse;
          const pending = this.pending.get(response.id);
          if (!pending) continue;

          this.pending.delete(response.id);
          clearTimeout(pending.timeout);
          if (response.ok) {
            pending.resolve(response.result);
          } else {
            const error = new Error(response.error || 'Model index worker error');
            if (response.stack) {
              (error as Error & { stack?: string }).stack = response.stack;
            }
            pending.reject(error);
          }
        } catch (error) {
          console.error('[ModelIndexWorkerService] Failed to parse worker response:', error, line);
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = String(chunk).trim();
      if (!text) return;
      console.error(`[ModelIndexWorker] ${text}`);
    });

    child.on('exit', (code, signal) => {
      const exitMessage = `Model index worker exited (code=${code}, signal=${signal})`;
      if (this.disposed) {
        this.failPending(new Error(exitMessage));
        return;
      }

      this.child = null;
      this.failPending(new Error(exitMessage));

      if (!this.restartTimer) {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          try {
            this.ensureWorker();
          } catch (error) {
            console.error('[ModelIndexWorkerService] Failed to restart worker:', error);
          }
        }, 300);
      }
    });

    return child;
  }

  private sendRequest<TRequestType extends ModelIndexWorkerRequest['type']>(
    request: Omit<Extract<ModelIndexWorkerRequest, { type: TRequestType }>, 'id'>,
  ) {
    const child = this.ensureWorker();
    const id = `model-index-${this.nextRequestId++}`;
    const payload = { ...request, id } as ModelIndexWorkerRequest;
    const encoded = `${JSON.stringify(payload)}\n`;

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Model index worker request timed out: ${request.type}`));
      }, WORKER_REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });

      if (!child.stdin || child.stdin.destroyed) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(new Error('Model index worker stdin is unavailable'));
        return;
      }

      child.stdin.write(encoded, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }
}

export type { ModelRootDescriptor };
