const CANCEL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCELED_ID_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_JOBS = 128;
const MAX_CANCELED_IDS = 4096;

interface ActiveJob {
  controller: AbortController;
  disconnect: () => void;
}

/** A bounded cancel capability is bound to the submitting session. */
export class UmbraUiMediaToolCancellation {
  private readonly active = new Map<string, ActiveJob>();
  private readonly canceled = new Map<string, number>();

  static validId(value: string): boolean {
    return CANCEL_ID_PATTERN.test(value);
  }

  private key(owner: string, id: string): string {
    return `${owner}\0${id.toLowerCase()}`;
  }

  private prune(): void {
    const cutoff = Date.now() - CANCELED_ID_TTL_MS;
    for (const [key, time] of this.canceled) {
      if (time < cutoff) this.canceled.delete(key);
    }
    while (this.canceled.size > MAX_CANCELED_IDS) {
      const oldest = this.canceled.keys().next().value;
      if (!oldest) break;
      this.canceled.delete(oldest);
    }
  }

  register(id: string, owner: string, requestSignal: AbortSignal): { signal: AbortSignal; release: () => void } {
    if (!UmbraUiMediaToolCancellation.validId(id)) throw new Error('Invalid media cancel ID.');
    this.prune();
    const key = this.key(owner, id);
    if (this.active.has(key)) throw new Error('This media request is already running.');
    if (this.active.size >= MAX_ACTIVE_JOBS) throw new Error('Too many media requests are running.');
    const controller = new AbortController();
    const disconnect = () => controller.abort(requestSignal.reason);
    requestSignal.addEventListener('abort', disconnect, { once: true });
    if (requestSignal.aborted || this.canceled.has(key)) {
      controller.abort(new DOMException('Media processing canceled.', 'AbortError'));
    }
    const entry = { controller, disconnect };
    this.active.set(key, entry);
    return {
      signal: controller.signal,
      release: () => {
        requestSignal.removeEventListener('abort', disconnect);
        if (this.active.get(key) === entry) this.active.delete(key);
      },
    };
  }

  cancel(id: string, owner: string): void {
    if (!UmbraUiMediaToolCancellation.validId(id)) throw new Error('Invalid media cancel ID.');
    this.prune();
    const key = this.key(owner, id);
    this.canceled.set(key, Date.now());
    this.prune();
    this.active.get(key)?.controller.abort(new DOMException('Media processing canceled.', 'AbortError'));
  }
}
