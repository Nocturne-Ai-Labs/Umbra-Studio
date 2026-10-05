// WebSocket events are hints to recheck the authoritative queue, never proof
// that a prompt completed. The revision preserves hints arriving during fetch.
export class ComfyPromptActivity {
  revision = 0;
  private listeners = new Set<() => void>();

  notify() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  wait(revision: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.revision !== revision) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal!.reason); };
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(finish);
        signal?.removeEventListener('abort', abort);
      };
      // A missing socket/event still detects completion within a short bound.
      const timer = setTimeout(finish, 250);
      this.listeners.add(finish);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
