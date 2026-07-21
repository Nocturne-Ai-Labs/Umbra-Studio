import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';

type ModelDownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface ModelDownloadJob {
  jobId: string;
  status: ModelDownloadJobStatus;
  downloadUrl: string;
  fileName: string;
  modelType: string;
  destinationRoot: string;
  destinationFolder: string;
  destinationPath: string;
  bytesTotal: number;
  bytesDownloaded: number;
  progress: number;
  error?: string;
  startedAt: number;
  finishedAt: number;
  cancelledAt: number;
  createdAt: number;
}

type ModelDownloadWorkerRequest =
  | {
      id: string;
      type: 'start';
      payload: {
        jobId: string;
        downloadUrl: string;
        fileName: string;
        modelType: string;
        destinationRoot: string;
        useExactDestination?: boolean;
        civitaiToken?: string;
        snapshot?: unknown;
      };
    }
  | {
      id: string;
      type: 'status';
      payload: {
        jobId: string;
      };
    }
  | {
      id: string;
      type: 'cancel';
      payload: {
        jobId: string;
      };
    };

type ModelDownloadWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const WORKER_REQUEST_TIMEOUT_MS = 60_000;

export class ModelDownloadWorkerService {
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
    this.workerScriptPath = join(options.sourceRoot, 'backend', 'ModelDownloadWorkerProcess.ts');
    this.env = {
      ...process.env,
      UMBRA_ROOT: options.runtimeRoot,
    };
  }

  async startDownload(payload: Extract<ModelDownloadWorkerRequest, { type: 'start' }>['payload']) {
    return this.sendRequest({ type: 'start', payload });
  }

  async getStatus(jobId: string) {
    return this.sendRequest({
      type: 'status',
      payload: { jobId },
    });
  }

  async cancel(jobId: string) {
    return this.sendRequest({
      type: 'cancel',
      payload: { jobId },
    });
  }

  dispose() {
    this.disposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.failPending(new Error('Model download worker disposed'));
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
      throw new Error('Model download worker service has been disposed');
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
          const response = JSON.parse(line) as ModelDownloadWorkerResponse;
          const pending = this.pending.get(response.id);
          if (!pending) continue;

          this.pending.delete(response.id);
          clearTimeout(pending.timeout);
          if (response.ok) {
            pending.resolve(response.result);
          } else {
            const error = new Error(response.error || 'Model download worker error');
            if (response.stack) {
              (error as Error & { stack?: string }).stack = response.stack;
            }
            pending.reject(error);
          }
        } catch (error) {
          console.error('[ModelDownloadWorkerService] Failed to parse worker response:', error, line);
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = String(chunk).trim();
      if (!text) return;
      console.error(`[ModelDownloadWorker] ${text}`);
    });

    child.on('exit', (code, signal) => {
      const exitMessage = `Model download worker exited (code=${code}, signal=${signal})`;
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
            console.error('[ModelDownloadWorkerService] Failed to restart worker:', error);
          }
        }, 300);
      }
    });

    return child;
  }

  private sendRequest<TRequestType extends ModelDownloadWorkerRequest['type']>(
    request: Omit<Extract<ModelDownloadWorkerRequest, { type: TRequestType }>, 'id'>,
  ) {
    const child = this.ensureWorker();
    const id = `model-download-${this.nextRequestId++}`;
    const payload = { ...request, id } as ModelDownloadWorkerRequest;
    const encoded = `${JSON.stringify(payload)}\n`;

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Model download worker request timed out: ${request.type}`));
      }, WORKER_REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });

      if (!child.stdin || child.stdin.destroyed) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(new Error('Model download worker stdin is unavailable'));
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
