import { describe, it, expect } from "vitest";
import { CommandBus } from "../src/core/CommandBus";
import { checkSchemaVersion } from "../src/core/schemas";

describe("CommandBus (R1-02)", () => {
  it("delivers queued actions in order with tick stamps", () => {
    const bus = new CommandBus();
    const seen: Array<{ tick: number; kind: string }> = [];
    bus.setHandler((action, tick) => {
      seen.push({ tick, kind: action.kind });
    });

    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } });
    bus.setTick(5);
    bus.enqueue({ kind: "grabToggle", slot: 0 });

    expect(seen).toHaveLength(0);
    bus.drain();
    expect(seen).toEqual([
      { tick: 0, kind: "axes" },
      { tick: 5, kind: "grabToggle" },
    ]);
  });

  it("dedupes consecutive identical axes against last delivered state", () => {
    const bus = new CommandBus();
    const seen: number[] = [];
    bus.setHandler((action) => {
      if (action.kind !== "axes") return;
      seen.push(action.payload.fwd);
    });
    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } }, { dedupeKey: "axes" });
    bus.drain();
    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } }, { dedupeKey: "axes" });
    bus.drain();
    expect(seen).toEqual([1]);
    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: -1, strafe: 0, turn: 0 } }, { dedupeKey: "axes" });
    bus.drain();
    expect(seen).toEqual([1, -1]);
  });

  it("does not poison dedupe when the handler rejects an action", () => {
    const bus = new CommandBus();
    const seen: number[] = [];
    bus.setHandler((action) => {
      if (action.kind !== "axes") return false;
      if (seen.length > 0) return false;
      seen.push(action.payload.fwd);
      return true;
    });
    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } }, { dedupeKey: "axes" });
    bus.drain();
    bus.enqueue({ kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } }, { dedupeKey: "axes" });
    bus.drain();
    expect(seen).toHaveLength(1);
  });

  it("records history only while recording is active", () => {
    const bus = new CommandBus();
    bus.setHandler(() => {});
    bus.enqueue({ kind: "grabToggle", slot: 1 });
    bus.drain();
    expect(bus.recordedCommands()).toHaveLength(0);

    bus.startRecording();
    bus.enqueue({ kind: "grabToggle", slot: 1 });
    bus.drain();
    expect(bus.recordedCommands()).toHaveLength(1);

    const history = bus.stopRecording();
    expect(history).toHaveLength(1);
    expect(bus.isRecording()).toBe(false);
  });
});

describe("schema version gate (R1-04)", () => {
  it("accepts missing or equal versions, rejects future versions", () => {
    expect(checkSchemaVersion("arena", {}).ok).toBe(true);
    expect(checkSchemaVersion("arena", { schemaVersion: 1 }).ok).toBe(true);
    expect(checkSchemaVersion("robot", { schemaVersion: 2 }).ok).toBe(false);
  });
});
