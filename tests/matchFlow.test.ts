import { describe, it, expect, beforeAll } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import { MatchController } from "../src/core/match";
import { diffSpec, testCompetition } from "./simulationCore.test";
import type {
  ArenaConfig,
  CompetitionRuleset,
  RobotSpec,
  SimulationProfile,
} from "../src/sim/types";

const arena: ArenaConfig = {
  meta: {
    name: "match-test",
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
      pose: { x: -7, y: 0.075, z: 6.02 },
      initialState: "idle",
      massKg: 0.8,
      render: { shape: "box", size: { w: 0.15, h: 0.15, d: 0.15 }, color: "#fff" },
    },
  ],
  targets: [],
  triggers: [{ id: "goalRed", shape: "rect", x: -7, z: -2, w: 1.4, l: 1, yMax: 1 }],
  surfaces: { defaultFriction: 0.7 },
};

const ruleset: CompetitionRuleset = {
  ...testCompetition,
  match: { setupSec: 1, countdownSec: 1, playSec: 30, retriesPerTeam: 1 },
  scoring: [{ id: "goalRedScore", type: "objectInTrigger", triggerId: "goalRed", team: "red", points: 10 }],
  absoluteWin: { type: "scoreThreshold", points: 10 },
  violations: [{ id: "oob", type: "outOfBounds", marginM: 0.25, effect: "retry" }],
};

const profile: SimulationProfile = { maxSpeedMps: 3, maxAccelMps2: 8, maxTurnRps: 2, solverHz: 60 };

function tickUntil(match: MatchController, seconds: number): void {
  const ticks = Math.round(seconds / match["core"].physics.fixedDt);
  for (let i = 0; i < ticks; i++) match.advance(match["core"].physics.fixedDt);
}

beforeAll(async () => {
  await RAPIER.init();
});

function setup(overrides?: Partial<CompetitionRuleset>): { core: SimulationCore; match: MatchController } {
  const core = new SimulationCore(arena, { ...ruleset, ...overrides }, profile);
  core.addRobot(0, diffSpec satisfies RobotSpec);
  const match = new MatchController(core, { ...ruleset, ...overrides });
  return { core, match };
}

describe("MatchController phases (M3)", () => {
  it("walks setup -> countdown -> playing -> ended with gated inputs early", async () => {
    await RAPIER.init();
    const { core, match } = setup({ scoring: [], absoluteWin: undefined });
    expect(match.phase).toBe("idle");

    match.startMatch();
    expect(match.phase).toBe("setup");
    expect(core.inputGateEnabled).toBe(true);

    const body = core.getBody(0)!;
    const zBefore = body.translation().z;
    core.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 0 });
    for (let i = 0; i < 30; i++) match.advance(core.physics.fixedDt);
    expect(body.translation().z).toBeCloseTo(zBefore, 3);

    tickUntil(match, 1.05);
    expect(match.phase).toBe("countdown");
    tickUntil(match, 1.05);
    expect(match.phase).toBe("playing");
    expect(core.inputGateEnabled).toBe(false);

    const zPlayingStart = body.translation().z;
    core.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 0 });
    for (let i = 0; i < 60; i++) match.advance(core.physics.fixedDt);
    expect(Math.abs(body.translation().z - zPlayingStart)).toBeGreaterThan(0.3);

    tickUntil(match, 31);
    expect(match.phase).toBe("ended");
    expect(match.winner).toBeNull();
  });

  it("awards points once when a released object rests inside the scoring trigger and wins at threshold", async () => {
    await RAPIER.init();
    const { core, match } = setup();
    match.startMatch();
    tickUntil(match, 2.2);
    expect(match.phase).toBe("playing");

    const objEntity = core.objectEntityId("objA#1")!;
    const objBody = core.physics.getEntity(objEntity)!.body;

    objBody.setTranslation({ x: -7, y: 0.075, z: -2 }, true);

    for (let i = 0; i < 10; i++) match.advance(core.physics.fixedDt);

    expect(match.score.red).toBe(10);
    expect(match.entries.some((e) => e.kind === "score" && e.team === "red")).toBe(true);
    expect(match.phase).toBe("ended");
    expect(match.winner).toBe("red");
    expect(core.inputGateEnabled).toBe(true);
  });

  it("does not score while the object is still held by the gripper", async () => {
    await RAPIER.init();
    const { core, match } = setup();
    match.startMatch();
    tickUntil(match, 2.2);

    core.placeObjectNearGripper(0);
    core.enqueueGrabToggle(0);
    for (let i = 0; i < 5; i++) match.advance(core.physics.fixedDt);
    expect(core.gripStatus(0).holding).toBe(true);

    const objEntity = core.objectEntityId("objA#1")!;
    const mount = core
      .physics.getEntity("robot-0")!
      .body.translation();
    void mount;
    const objBody = core.physics.getEntity(objEntity)!.body;
    objBody.setTranslation({ x: -7, y: 0.075, z: -2 }, true);
    for (let i = 0; i < 10; i++) match.advance(core.physics.fixedDt);

    expect(match.score.red).toBe(0);
  });

  it("out-of-bounds during play triggers retry reset and consumes an attempt", async () => {
    await RAPIER.init();
    const { core, match } = setup({
      ...ruleset,
      absoluteWin: undefined,
      violations: [{ id: "oob", type: "outOfBounds", marginM: 0.25, effect: "retry" }],
    });
    match.startMatch();
    tickUntil(match, 2.2);
    expect(match.phase).toBe("playing");

    core.getBody(0)!.setTranslation({ x: 9.5, y: 0.2, z: 0 }, true);
    for (let i = 0; i < 5; i++) match.advance(core.physics.fixedDt);

    const p = core.getBody(0)!.translation();
    expect(p.x).toBeCloseTo(-7, 1);
    expect(match.retriesFor("red")).toBe(0);
    expect(match.entries.filter((e) => e.ruleId.startsWith("oob"))).toHaveLength(2);

    core.getBody(0)!.setTranslation({ x: 9.5, y: 0.2, z: 0 }, true);
    for (let i = 0; i < 5; i++) match.advance(core.physics.fixedDt);
    expect(match.winner).toBe("blue");
    expect(match.phase).toBe("ended");
  });
});
