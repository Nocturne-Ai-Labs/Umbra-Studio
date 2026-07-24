import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';

type FsWorkerRequest =
  | {
      id: string;
      type: 'warmup';
      payload: {};
    }
  | {
      id: string;
      type: 'invalidate';
      payload: {
        paths: string[];
      };
    }
 | {
      id: string;
      type: 'list';
    payload: {
      fullPath: string;
      targetPath: string;
      filter: string | null;
      isTrashPath: boolean;
      isTrashRoot: boolean;
      recursive?: boolean;
      trashMetadataPath?: string;
    };
  }
  | {
      id: string;
      type: 'list-progressive';
      payload: {
        fullPath: string;
        targetPath: string;
        limit: number;
        cursor: number;
        force?: boolean;
      };
    }
  | {
      id: string;
      type: 'tree';
      payload: {
        fullPath: string;
        targetPath: string;
        maxDepth: number;
      };
    }
  | {
      id: string;
      type: 'folder-summary';
      payload: {
        fullPath: string;
        targetPath: string;
        force?: boolean;
      };
    }
  | {
      id: string;
      type: 'stat-files';
      payload: {
        items: Array<{
          path: string;
          fullPath: string;
          folderPath: string;
          name: string;
          type: 'image' | 'gif' | 'video';
        }>;
      };
    }
  | {
      id: string;
      type: 'move';
      payload: {
        items: Array<{
          sourcePath: string;
          sourceFullPath: string;
          targetFullPath?: string;
        }>;
        destination: string;
        destinationFullPath: string;
        transferMode: 'default' | 'cloud';
      };
    }
  | {
      id: string;
      type: 'copy';
      payload: {
        items: Array<{
          sourcePath: string;
          sourceFullPath: string;
          targetFullPath?: string;
        }>;
        destination: string;
        destinationFullPath: string;
      };
    }
  | {
      id: string;
      type: 'mkdir';
      payload: {
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'rename';
      payload: {
        oldFullPath: string;
        newFullPath: string;
      };
    }
  | {
      id: string;
      type: 'write';
      payload: {
        fullPath: string;
        content: string;
        encoding: 'utf8' | 'base64';
      };
    }
  | {
      id: string;
      type: 'read';
      payload: {
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'delete';
      payload: {
        items: Array<{
          path: string;
          fullPath: string;
        }>;
        force?: boolean;
      };
    }
  | {
      id: string;
      type: 'system-trash';
      payload: {
        fullPath: string;
      };
    };

type FsWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string }
  | { id: string; event: 'progress'; progress: unknown };

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  onProgress?: (progress: any) => void;
  startedAt: number;
  ensureMs: number;
  spawned: boolean;
  writeStartedAt: number;
  writeCompletedAt: number | null;
};

const WORKER_REQUEST_TIMEOUT_MS = 60_000;

export class FsWorkerService {
  private child: ChildProcess | null = null;
  private buffer = '';
  private nextRequestId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly workerScriptPath: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastEnsureSpawned = false;

  constructor(options: {
    sourceRoot: string;
    runtimeRoot: string;
    cacheDir?: string;
    thumbnailCacheDir?: string;
  }) {
    this.cwd = options.sourceRoot;
    this.workerScriptPath = join(options.sourceRoot, 'backend', 'FsWorkerProcess.ts');
    this.env = {
      ...process.env,
      UMBRA_ROOT: options.runtimeRoot,
      ...(options.cacheDir ? { UMBRA_CACHE_DIR: options.cacheDir } : {}),
      ...(options.thumbnailCacheDir ? { UMBRA_THUMBNAIL_CACHE_DIR: options.thumbnailCacheDir } : {}),
    };
  }

  async list(payload: Extract<FsWorkerRequest, { type: 'list' }>['payload']) {
    return this.sendRequest({ type: 'list', payload });
  }

  async warmup() {
    await this.sendRequest({ type: 'warmup', payload: {} }).catch(() => undefined);
  }

  async invalidatePaths(payload: Extract<FsWorkerRequest, { type: 'invalidate' }>['payload']) {
    return this.sendRequest({ type: 'invalidate', payload }).catch(() => undefined);
  }

  async listProgressive(payload: Extract<FsWorkerRequest, { type: 'list-progressive' }>['payload']) {
    return this.sendRequest({ type: 'list-progressive', payload });
  }

  async tree(payload: Extract<FsWorkerRequest, { type: 'tree' }>['payload']) {
    return this.sendRequest({ type: 'tree', payload });
  }

  async folderSummary(payload: Extract<FsWorkerRequest, { type: 'folder-summary' }>['payload']) {
    return this.sendRequest({ type: 'folder-summary', payload });
  }

  async statFiles(payload: Extract<FsWorkerRequest, { type: 'stat-files' }>['payload']) {
    return this.sendRequest({ type: 'stat-files', payload });
  }

  async move(
    payload: Extract<FsWorkerRequest, { type: 'move' }>['payload'],
    options?: { onProgress?: (progress: any) => void },
  ) {
    return this.sendRequest({ type: 'move', payload }, options);
  }

  async copy(
    payload: Extract<FsWorkerRequest, { type: 'copy' }>['payload'],
    options?: { onProgress?: (progress: any) => void },
  ) {
    return this.sendRequest({ type: 'copy', payload }, options);
  }

  async mkdir(payload: Extract<FsWorkerRequest, { type: 'mkdir' }>['payload']) {
    return this.sendRequest({ type: 'mkdir', payload });
  }

  async rename(payload: Extract<FsWorkerRequest, { type: 'rename' }>['payload']) {
    return this.sendRequest({ type: 'rename', payload });
  }

  async write(payload: Extract<FsWorkerRequest, { type: 'write' }>['payload']) {
    return this.sendRequest({ type: 'write', payload });
  }

  async read(payload: Extract<FsWorkerRequest, { type: 'read' }>['payload']) {
    return this.sendRequest({ type: 'read', payload });
  }

  async delete(payload: Extract<FsWorkerRequest, { type: 'delete' }>['payload']) {
    return this.sendRequest({ type: 'delete', payload });
  }

  async systemTrash(payload: Extract<FsWorkerRequest, { type: 'system-trash' }>['payload']) {
    return this.sendRequest({ type: 'system-trash', payload });
  }

  dispose() {
    this.disposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.failPending(new Error('Filesystem worker disposed'));
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
      throw new Error('Filesystem worker service has been disposed');
    }
    if (this.child && this.child.exitCode === null && this.child.stdin && !this.child.stdin.destroyed) {
      this.lastEnsureSpawned = false;
      return this.child;
    }

    const bunExecutable = process.execPath;
    const child = spawn(bunExecutable, [this.workerScriptPath], {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.lastEnsureSpawned = true;
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
          const response = JSON.parse(line) as FsWorkerResponse;
          const pending = this.pending.get(response.id);
          if (!pending) continue;
          if ('event' in response) {
            pending.onProgress?.(response.progress);
            continue;
          }
          this.pending.delete(response.id);
          clearTimeout(pending.timeout);
          if (response.ok) {
            const result = response.result;
            if (result && typeof result === 'object' && !Array.isArray(result)) {
              (result as Record<string, unknown>).__serviceDebug = {
                elapsedMs: Date.now() - pending.startedAt,
                ensureMs: pending.ensureMs,
                writeMs: pending.writeCompletedAt === null ? null : Math.max(0, pending.writeCompletedAt - pending.writeStartedAt),
                responseWaitMs: pending.writeCompletedAt === null ? null : Math.max(0, Date.now() - pending.writeCompletedAt),
                spawned: pending.spawned,
              };
            }
            pending.resolve(result);
          } else {
            const error = new Error(response.error || 'Filesystem worker error');
            if (response.stack) {
              (error as any).stack = response.stack;
            }
            pending.reject(error);
          }
        } catch (error) {
          console.warn('[FsWorkerService] Failed to parse worker response:', error);
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = String(chunk).trim();
      if (text) {
        console.warn(`[FsWorker] ${text}`);
      }
    });

    child.on('exit', (code, signal) => {
      const workerExitedError = new Error(`Filesystem worker exited (code=${String(code)} signal=${String(signal)})`);
      this.failPending(workerExitedError);
      this.child = null;
      this.buffer = '';
      if (!this.disposed) {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          try {
            this.ensureWorker();
          } catch (error) {
            console.warn('[FsWorkerService] Failed to restart worker:', error);
          }
        }, 150);
      }
    });

    child.on('error', (error) => {
      console.error('[FsWorkerService] Worker process error:', error);
    });

    return child;
  }

  private sendRequest<T extends FsWorkerRequest['type']>(
    request: Omit<Extract<FsWorkerRequest, { type: T }>, 'id'>,
    options?: { onProgress?: (progress: any) => void },
  ): Promise<any> {
    const ensureStartedAt = Date.now();
    const child = this.ensureWorker();
    const ensureMs = Date.now() - ensureStartedAt;
    const spawned = this.lastEnsureSpawned;
    const id = `fsw_${Date.now()}_${this.nextRequestId++}`;
    const payload = JSON.stringify({ ...request, id }) + '\n';

    return new Promise((resolve, reject) => {
      const writeStartedAt = Date.now();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Filesystem worker request timed out (${request.type})`));
      }, WORKER_REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve,
        reject,
        timeout,
        onProgress: options?.onProgress,
        startedAt: ensureStartedAt,
        ensureMs,
        spawned,
        writeStartedAt,
        writeCompletedAt: null,
      });

      child.stdin?.write(payload, (error) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        pending.writeCompletedAt = Date.now();
        if (!error) return;
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(error);
      });
    });
  }
}
