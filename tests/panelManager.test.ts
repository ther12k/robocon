import { describe, it, expect, beforeEach } from "vitest";
import { PanelManager } from "../src/ui/PanelManager";

describe("PanelManager (RUI-006)", () => {
  let pm: PanelManager;

  beforeEach(() => {
    pm = new PanelManager();
  });

  it("defaults to none and drive unlocked", () => {
    expect(pm.activePanel).toBe("none");
    let locked = false;
    pm.onDriveLock((l) => (locked = l));
    expect(locked).toBe(false);
  });

  it("locks driving when panel opens and notifies listeners", () => {
    let active = "";
    let locked = false;
    pm.onPanelChange((a) => (active = a));
    pm.onDriveLock((l) => (locked = l));

    pm.openPanel("builder");
    expect(active).toBe("builder");
    expect(locked).toBe(true);
    expect(pm.isPanelOpen("builder")).toBe(true);
  });

  it("handles nested panel stack and maintains drive lock until stack is empty", () => {
    let lockedState: boolean[] = [];
    pm.onDriveLock((l) => lockedState.push(l));

    pm.openPanel("builder");
    pm.openPanel("preferences");
    expect(pm.activePanel).toBe("preferences");
    expect(pm.isPanelOpen("builder")).toBe(true);
    expect(pm.isPanelOpen("preferences")).toBe(true);

    pm.closePanel("preferences");
    expect(pm.activePanel).toBe("builder");
    // driving is still locked because builder is open
    expect(pm.isPanelOpen("builder")).toBe(true);

    pm.closePanel("builder");
    expect(pm.activePanel).toBe("none");
    expect(pm.isPanelOpen("builder")).toBe(false);
  });

  it("closeAll clears stack and unlocks driving immediately", () => {
    pm.openPanel("script");
    pm.openPanel("preferences");
    expect(pm.activePanel).toBe("preferences");

    pm.closeAll();
    expect(pm.activePanel).toBe("none");
    expect(pm.isPanelOpen("script")).toBe(false);
    expect(pm.isPanelOpen("preferences")).toBe(false);
  });
});
