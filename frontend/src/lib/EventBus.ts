/**
 * EventBus — Simple typed pub/sub for vanilla JS <-> React communication
 * Used by editor components to communicate without tight coupling.
 */

export type EventCallback<T = any> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        cb(data);
      }
    }
  }

  once<T = any>(event: string, callback: EventCallback<T>): void {
    const wrapper: EventCallback<T> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  removeAll(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** Shared editor event bus instance */
export const editorBus = new EventBus();
