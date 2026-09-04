import type { UiSnapshot } from "./types";

export type Listener = (snapshot: UiSnapshot) => void;

export class UiStore {
  private currentSnapshot: UiSnapshot;
  private listeners = new Set<Listener>();
  private isDisposed = false;

  constructor(initialSnapshot: UiSnapshot) {
    this.currentSnapshot = Object.freeze({ ...initialSnapshot });
  }

  get snapshot(): UiSnapshot {
    return this.currentSnapshot;
  }

  subscribe(listener: Listener): () => void {
    if (this.isDisposed) {
      return () => {};
    }
    this.listeners.add(listener);
    listener(this.currentSnapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  update(updater: (prev: UiSnapshot) => UiSnapshot): void {
    if (this.isDisposed) return;
    const next = Object.freeze({ ...updater(this.currentSnapshot) });
    this.currentSnapshot = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (err) {
        console.error("Error in UiStore listener:", err);
      }
    }
  }

  set(partial: Partial<UiSnapshot>): void {
    this.update((prev) => ({ ...prev, ...partial }));
  }

  dispose(): void {
    this.isDisposed = true;
    this.listeners.clear();
  }
}
