import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { DanbooruRelatedOptions, DanbooruRelatedResult } from './DanbooruRelatedQuery';

type PendingQuery = {
  id: string;
  encoded: string;
  resolve: (result: DanbooruRelatedResult) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

export class DanbooruRelatedWorkerService {
  private child: ChildProcess | null = null;
  private stopping: Promise<void> | null = null;
  private active: PendingQuery | null = null;
  private queue: PendingQuery[] = [];
  private sequence = 0;
  private disposed = false;

  constructor(private readonly options: {
    sourceRoot: string;
    databasePath: string;
    workerScriptPath?: string;
    requestTimeoutMs?: number;
    maxQueued?: number;
  }) {}

  query(options: DanbooruRelatedOptions, signal?: AbortSignal): Promise<DanbooruRelatedResult> {
    if (this.disposed) return Promise.reject(new Error('Corpus query service is closed.'));
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (this.queue.length >= (this.options.maxQueued ?? 8)) {
      return Promise.reject(Object.assign(new Error('Corpus suggestions are busy. Please retry shortly.'), { status: 429 }));
    }
    const id = String(++this.sequence);
    const encoded = `${JSON.stringify({ id, options })}\n`;
    if (Buffer.byteLength(encoded) > 128 * 1024) return Promise.reject(new Error('The corpus tag request is too large.'));
    return new Promise((resolve, reject) => {
      const aborted = () => this.cancel(request, new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => this.cancel(request, Object.assign(new Error('Corpus suggestions timed out. Try a narrower tag selection.'), { status: 504 })), this.options.requestTimeoutMs ?? 60_000);
      const request: PendingQuery = {
        id, encoded, resolve, reject,
        cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); },
      };
      signal?.addEventListener('abort', aborted, { once: true });
      this.queue.push(request);
      this.pump();
    });
  }

  dispose(): Promise<void> {
    this.disposed = true;
    const error = new Error('Corpus query service is closed.');
    for (const request of this.queue.splice(0)) { request.cleanup(); request.reject(error); }
    if (this.active) { this.active.cleanup(); this.active.reject(error); this.active = null; }
    return this.stopWorker();
  }

  private cancel(request: PendingQuery, error: Error): void {
    if (this.active === request) {
      this.active = null;
      request.cleanup();
      request.reject(error);
      // Synchronous SQLite cannot observe an IPC abort while scanning. Terminate only this read-only worker.
      void this.stopWorker();
    } else {
      const index = this.queue.indexOf(request);
      if (index < 0) return;
      this.queue.splice(index, 1);
      request.cleanup();
      request.reject(error);
    }
  }

  private stopWorker(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    this.child = null;
    if (!child) { this.pump(); return Promise.resolve(); }
    const stopped = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
      try { child.kill('SIGKILL'); } catch { /* close/error events settle the retired child */ }
    });
    this.stopping = stopped;
    void stopped.then(() => { if (this.stopping === stopped) this.stopping = null; this.pump(); });
    return stopped;
  }

  private failed(child: ChildProcess, error: Error): void {
    if (child !== this.child) return;
    if (this.active) { this.active.cleanup(); this.active.reject(error); this.active = null; }
    void this.stopWorker();
  }

  private ensureWorker(): ChildProcess {
    if (this.child) return this.child;
    const child = spawn(process.execPath, [
      this.options.workerScriptPath || join(this.options.sourceRoot, 'backend', 'DanbooruRelatedWorkerProcess.ts'),
      this.options.databasePath,
    ], { cwd: this.options.sourceRoot, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    let buffer = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      if (child !== this.child) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) { this.failed(child, new Error('Corpus worker response exceeded its size limit.')); return; }
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          const request = this.active;
          if (!request || response.id !== request.id) throw new Error('Corpus worker response did not match the active query.');
          this.active = null;
          request.cleanup();
          if (response.ok === true && Array.isArray(response.result?.suggestions)) request.resolve(response.result);
          else request.reject(new Error(String(response.error || 'Corpus query failed.')));
          this.pump();
        } catch (error) { this.failed(child, error instanceof Error ? error : new Error('Invalid corpus worker response.')); return; }
      }
    });
    child.stderr!.on('data', () => { /* Drain diagnostics without leaking request contents into app logs. */ });
    child.on('error', error => this.failed(child, error));
    child.stdin!.on('error', error => this.failed(child, error));
    child.on('exit', (code, signal) => this.failed(child, new Error(`Corpus query worker exited (${signal || code}). Retry the query.`)));
    return child;
  }

  private pump(): void {
    if (this.disposed || this.stopping || this.active || !this.queue.length) return;
    const request = this.queue.shift()!;
    this.active = request;
    try {
      const child = this.ensureWorker();
      child.stdin!.write(request.encoded, error => { if (error) this.failed(child, error); });
    } catch (error) {
      this.active = null;
      request.cleanup();
      request.reject(error);
      this.pump();
    }
  }
}
