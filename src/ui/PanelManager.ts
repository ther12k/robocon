import type { ActivePanel } from "../app/types";

export interface PanelToken {
  panel: ActivePanel;
  invoker?: HTMLElement | null;
}

export class PanelManager {
  private panelStack: PanelToken[] = [];
  private onPanelChangeListeners: Array<(active: ActivePanel) => void> = [];
  private driveLockListeners: Array<(locked: boolean) => void> = [];

  get activePanel(): ActivePanel {
    if (this.panelStack.length === 0) return "none";
    return this.panelStack[this.panelStack.length - 1].panel;
  }

  isPanelOpen(panel: ActivePanel): boolean {
    return this.panelStack.some((t) => t.panel === panel);
  }

  openPanel(panel: ActivePanel, invoker?: HTMLElement | null): void {
    if (panel === "none") {
      this.closeAll();
      return;
    }

    // If already at top, noop
    if (this.activePanel === panel) {
      return;
    }

    // Push token to stack
    const activeEl = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    this.panelStack.push({ panel, invoker: invoker ?? activeEl });

    // Lock driving when any dialog/panel opens
    this.notifyDriveLock(true);
    this.notifyPanelChange();
  }

  closePanel(panel?: ActivePanel): void {
    if (this.panelStack.length === 0) return;

    let removed: PanelToken | undefined;
    if (panel) {
      const idx = this.panelStack.findIndex((t) => t.panel === panel);
      if (idx !== -1) {
        removed = this.panelStack.splice(idx, 1)[0];
      }
    } else {
      removed = this.panelStack.pop();
    }

    // Restore invoker focus if closing top-level dialog
    if (removed?.invoker && typeof removed.invoker.focus === "function") {
      try {
        removed.invoker.focus();
      } catch {
        // element may no longer be in DOM
      }
    }

    if (this.panelStack.length === 0) {
      this.notifyDriveLock(false);
    }
    this.notifyPanelChange();
  }

  closeAll(): void {
    const invoker = this.panelStack[0]?.invoker;
    this.panelStack = [];
    if (invoker && typeof invoker.focus === "function") {
      try {
        invoker.focus();
      } catch {
        // noop
      }
    }
    this.notifyDriveLock(false);
    this.notifyPanelChange();
  }

  onPanelChange(listener: (active: ActivePanel) => void): () => void {
    this.onPanelChangeListeners.push(listener);
    listener(this.activePanel);
    return () => {
      this.onPanelChangeListeners = this.onPanelChangeListeners.filter((l) => l !== listener);
    };
  }

  onDriveLock(listener: (locked: boolean) => void): () => void {
    this.driveLockListeners.push(listener);
    listener(this.panelStack.length > 0);
    return () => {
      this.driveLockListeners = this.driveLockListeners.filter((l) => l !== listener);
    };
  }

  private notifyPanelChange(): void {
    const active = this.activePanel;
    for (const l of this.onPanelChangeListeners) {
      l(active);
    }
  }

  private notifyDriveLock(locked: boolean): void {
    for (const l of this.driveLockListeners) {
      l(locked);
    }
  }
}
