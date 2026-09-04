import { describe, it, expect, beforeEach } from "vitest";
import { UiStore } from "../src/app/UiStore";
import type { UiSnapshot } from "../src/app/types";

const mockSnapshot: UiSnapshot = {
  sessionId: 1,
  boot: "ready",
  activeSlot: 0,
  robots: [],
  telemetry: { status: "unavailable", reason: "No robot selected" },
  match: {
    phase: "idle",
    timeRemainingSec: 180,
    scoreRed: 0,
    scoreBlue: 0,
    retriesRed: 3,
    retriesBlue: 3,
    maxRetries: 3,
    winnerTeam: null,
    recentEvents: [],
  },
  replay: {
    state: "idle",
    recordingType: null,
    loadedFileName: null,
    durationSec: 0,
    totalTicks: 0,
    currentTick: 0,
    progress: 0,
    compatible: true,
    shareable: false,
    shareUrl: null,
  },
  arena: {
    name: "Test Arena",
    provenance: "inferred",
    note: "Test note",
  },
  camera: {
    view: "perspective",
    following: null,
    measuring: false,
  },
  activePanel: "none",
  throttlePercent: 50,
  precisionMode: false,
  speedHistory: [],
};

describe("UiStore (RUI-004)", () => {
  let store: UiStore;

  beforeEach(() => {
    store = new UiStore(mockSnapshot);
  });

  it("provides initial snapshot and keeps it frozen/immutable", () => {
    const snap = store.snapshot;
    expect(snap.sessionId).toBe(1);
    expect(snap.activeSlot).toBe(0);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("subscribes listener, immediately fires with current snapshot, and returns unsubscribe fn", () => {
    const received: UiSnapshot[] = [];
    const unsubscribe = store.subscribe((s) => received.push(s));

    expect(received.length).toBe(1);
    expect(received[0].sessionId).toBe(1);

    store.set({ activeSlot: 1 });
    expect(received.length).toBe(2);
    expect(received[1].activeSlot).toBe(1);

    unsubscribe();
    store.set({ activeSlot: 2 });
    expect(received.length).toBe(2); // no more updates
  });

  it("disposes cleanly and stops all future updates", () => {
    const received: UiSnapshot[] = [];
    store.subscribe((s) => received.push(s));
    expect(received.length).toBe(1);

    store.dispose();
    store.set({ activeSlot: 1 });
    expect(received.length).toBe(1);
  });
});
