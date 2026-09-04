import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import { MatchController } from "../src/core/match";
import { AutonomyManager } from "../src/core/autonomy";
import { SimulatorAdapter } from "../src/app/SimulatorAdapter";
import { testArena, testCompetition, testProfile, diffSpec } from "./simulationCore.test";

describe("SimulatorAdapter & UI Projection (RUI-004)", () => {
  let core: SimulationCore;
  let match: MatchController;
  let autonomy: AutonomyManager;
  let adapter: SimulatorAdapter;

  beforeAll(async () => {
    await RAPIER.init();
  });

  beforeEach(() => {
    core = new SimulationCore(testArena, testCompetition, testProfile);
    match = new MatchController(core, testCompetition);
    autonomy = new AutonomyManager(core, () => ({
      post: () => {},
      terminate: () => {},
      onMessage: () => {},
    }));
    core.addRobot(0, diffSpec);
    adapter = new SimulatorAdapter({ core, match, autonomy });
  });

  it("projects immutable snapshot with valid telemetry and robots list", () => {
    const snap = adapter.buildSnapshot();
    expect(snap.sessionId).toBe(core.currentSessionId);
    expect(snap.activeSlot).toBe(0);
    expect(snap.robots.length).toBe(1);
    expect(snap.robots[0].name).toBe("DiffBot");
    expect(snap.robots[0].team).toBe("red");
    expect(snap.robots[0].hasGripper).toBe(true);

    expect(snap.telemetry.status).toBe("available");
    if (snap.telemetry.status === "available") {
      expect(snap.telemetry.value.name).toBe("DiffBot");
      expect(snap.telemetry.value.team).toBe("red");
      expect(typeof snap.telemetry.value.posX).toBe("number");
      expect(typeof snap.telemetry.value.posZ).toBe("number");
      expect(snap.telemetry.value.speed).toBe(0);
    }
  });

  it("handles unavailable telemetry when invalid slot is active", () => {
    adapter.setActiveSlot(999);
    const snap = adapter.buildSnapshot();
    expect(snap.telemetry.status).toBe("unavailable");
  });

  it("samples speed history without exceeding 120 samples", () => {
    adapter.setActiveSlot(0);
    for (let i = 0; i < 150; i++) {
      adapter.sampleSpeed(i * 120); // 120ms intervals
    }
    const snap = adapter.buildSnapshot();
    expect(snap.speedHistory.length).toBeLessThanOrEqual(120);
  });

  it("resets speed history on slot change to avoid cross-slot pollution", () => {
    adapter.setActiveSlot(0);
    adapter.sampleSpeed(100);
    adapter.sampleSpeed(250);
    expect(adapter.buildSnapshot().speedHistory.length).toBe(2);

    adapter.setActiveSlot(1);
    expect(adapter.buildSnapshot().speedHistory.length).toBe(0);
  });
});
