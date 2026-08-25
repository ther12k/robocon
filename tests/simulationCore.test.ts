import { describe, it, expect, beforeAll } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore, ENGINE_VERSION } from "../src/core/SimulationCore";
import type { ArenaConfig, CompetitionRuleset, RobotSpec, SimulationProfile } from "../src/sim/types";

export const testArena: ArenaConfig = {
  meta: {
    name: "core-test",
    rulebookVersion: "0",
    tolerancePct: 5,
    schemaVersion: 1,
    source: { authority: "provisional", status: "inferred" },
  },
  dimensions: { width: 16, length: 16 },
  zones: [
    { id: "startRed", team: "red", shape: "rect", x: -7, z: 6.5, w: 2, l: 3 },
    { id: "startBlue", team: "blue", shape: "rect", x: 7, z: -6.5, w: 2, l: 3 },
  ],
  staticProps: [],
  objectSpawns: [
    {
      objectId: "objA#1",
      typeId: "objA",
      pose: { x: -2, y: 0.075, z: 2 },
      initialState: "idle",
      massKg: 0.8,
      render: { shape: "box", size: { w: 0.15, h: 0.15, d: 0.15 }, color: "#fbbf24" },
    },
  ],
  targets: [],
  triggers: [
    { id: "padCenter", shape: "rect", x: 0, z: 0, w: 1, l: 1, yMax: 1 },
    { id: "leftLane", shape: "rect", x: -7, z: 0, w: 2, l: 1, yMax: 1 },
  ],
  surfaces: { defaultFriction: 0.7 },
};

export const testCompetition: CompetitionRuleset = {
  robots: {
    R1: { maxFootprintMm: { w: 1000, l: 1000, h: 1000 }, extendedMm: { w: 1000, l: 1800, h: 1300 } },
  },
  teamWeightBudgetKg: 50,
};

export const testProfile: SimulationProfile = {
  maxSpeedMps: 3,
  maxAccelMps2: 8,
  maxTurnRps: 2,
  solverHz: 60,
};

export const diffSpec: RobotSpec = {
  name: "DiffBot",
  role: "R1",
  team: "red",
  chassis: {
    drive: "differential",
    footprint: { w: 0.6, l: 0.7 },
    height: 0.32,
    massKg: 22,
    maxSpeedMps: 2,
    maxAccelMps2: 4,
    maxTurnRps: 1.2,
  },
  modules: [{ type: "gripper", mount: { x: 0, y: 0.12, z: 0.4 }, gripRangeM: 0.35 }],
};

function makeCore(): SimulationCore {
  return new SimulationCore(testArena, testCompetition, testProfile);
}

beforeAll(async () => {
  await PhysicsInit();
});

async function PhysicsInit(): Promise<void> {
  await RAPIER.init();
}

describe("SimulationCore (R1-03)", () => {
  it("spawns robots at team start zones with stable entity ids", () => {
    const core = makeCore();
    core.addRobot(0, diffSpec);
    expect(core.hasSlot(0)).toBe(true);
    const t = core.physics.getEntityTransform("robot-0");
    expect(t).not.toBeNull();
    expect(t!.position.x).toBeCloseTo(-7, 3);
    expect(t!.position.z).toBeCloseTo(6.5, 3);
  });

  it("respawn replaces the entity without leaking bodies", () => {
    const core = makeCore();
    core.addRobot(0, diffSpec);
    const handleBefore = (core.physics.getEntity("robot-0")!.body as unknown as { handle: number }).handle;
    core.addRobot(0, diffSpec);
    const handleAfter = (core.physics.getEntity("robot-0")!.body as unknown as { handle: number }).handle;
    expect(handleAfter).not.toBe(handleBefore);
    expect(core.physics.entityIds().filter((id) => id === "robot-0")).toHaveLength(1);
  });

  it("emits trigger enter and exit events when a robot crosses the lane", () => {
    const core = makeCore();
    core.addRobot(0, diffSpec);
    for (let i = 0; i < 300; i++) {
      core.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 0 });
      core.advance(core.physics.fixedDt);
    }
    const events = core.pullEvents();
    expect(events.some((e) => e.type === "triggerEnter" && e.triggerId === "leftLane")).toBe(true);
    expect(events.some((e) => e.type === "triggerExit" && e.triggerId === "leftLane")).toBe(true);
  });
});

describe("snapshot & state hash (R1-03)", () => {
  it("hash is stable across identical runs and differs across divergent runs", async () => {
    await RAPIER.init();
    const run = () => {
      const core = makeCore();
      core.addRobot(0, diffSpec);
      for (let i = 0; i < 90; i++) {
        core.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 0 });
        core.advance(core.physics.fixedDt);
      }
      return core.stateHash();
    };
    const a = run();
    const b = run();
    expect(a).toBe(b);

    const divergentRun = () => {
      const core = makeCore();
      core.addRobot(0, diffSpec);
      for (let i = 0; i < 45; i++) {
        core.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 0 });
        core.advance(core.physics.fixedDt);
      }
      return core.stateHash();
    };
    expect(divergentRun()).not.toBe(a);
  });

  it("snapshot captures entities and hold state with version metadata", () => {
    const core = makeCore();
    core.addRobot(0, diffSpec);
    const snap = core.snapshot();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.engineVersion).toBe(ENGINE_VERSION);
    expect(snap.physicsVersion).toBeTruthy();
    expect(snap.entities.map((e) => e.id)).toContain("robot-0");
    expect(snap.entities.map((e) => e.id)).toContain("obj-objA#1");
    expect(snap.holds).toEqual([]);
  });
});

describe("input gate locks", () => {
  it("keeps the gate blocked while any owner still holds a lock", async () => {
    await RAPIER.init();
    const core = new SimulationCore(testArena, testCompetition, testProfile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    core.setInputLock("match-phase", true);
    core.setInputLock("replay", true);
    expect(core.inputGateEnabled).toBe(true);

    // Stopping a replay must only release the replay's own lock.
    core.setInputLock("replay", false);
    expect(core.inputGateEnabled).toBe(true);

    core.setInputLock("match-phase", false);
    expect(core.inputGateEnabled).toBe(false);
  });
});
