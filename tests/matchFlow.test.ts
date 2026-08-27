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

  it("retry respawns only the offending team and preserves the timeline", async () => {
    await RAPIER.init();
    const twoTeamRuleset: CompetitionRuleset = {
      ...ruleset,
      absoluteWin: undefined,
      violations: [{ id: "oob", type: "outOfBounds", marginM: 0.25, effect: "retry" }],
    };
    const core = new SimulationCore(arena, twoTeamRuleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    core.addRobot(1, { ...diffSpec, name: "Blue-1", team: "blue" } satisfies RobotSpec);
    const match = new MatchController(core, twoTeamRuleset);
    match.startMatch();
    tickUntil(match, 2.2);
    expect(match.phase).toBe("playing");

    const blueBefore = core.getBody(1)!.translation();
    const objBefore = core.worldObjectCandidates()[0].body.translation();
    const scoreBefore = { ...match.score };
    const retriesBefore = match.retriesFor("red");

    core.beginReplayCapture(10);

    core.getBody(0)!.setTranslation({ x: 9.5, y: 0.2, z: 0 }, true);
    for (let i = 0; i < 8; i++) match.advance(core.physics.fixedDt);

    expect(match.retriesFor("red")).toBe(retriesBefore - 1);
    expect(match.score).toEqual(scoreBefore);
    expect(match.phase).toBe("playing");

    const blueAfter = core.getBody(1)!.translation();
    expect(Math.hypot(blueAfter.x - blueBefore.x, blueAfter.z - blueBefore.z)).toBeLessThan(0.02);
    const objAfter = core.worldObjectCandidates()[0].body.translation();
    expect(Math.hypot(objAfter.x - objBefore.x, objAfter.z - objBefore.z)).toBeLessThan(0.02);

    const redAfter = core.getBody(0)!.translation();
    expect(redAfter.x).toBeCloseTo(-7, 1);

    const file = core.endReplayCapture();
    let lastTick = -1;
    for (const c of file.commands) {
      expect(c.tick).toBeGreaterThanOrEqual(lastTick);
      lastTick = c.tick;
      expect(c.tick).toBeLessThan(file.totalTicks);
    }
    void lastTick;
  });

  it("enforces target accepts, locks scored objects, and never double-scores", async () => {
    await RAPIER.init();
    const targetArena: ArenaConfig = {
      ...arena,
      targets: [{
        id: "t", accepts: ["objA"], triggerId: "goalRed", check: "snapPose",
        pose: { x: -7, y: 0.075, z: -2 }, size: { w: 0.5, d: 0.5 }, scoreEvent: "goalRedScore",
      }],
      objectSpawns: [
        ...arena.objectSpawns,
        {
          objectId: "objB#1", typeId: "objB", pose: { x: -7, y: 0.225, z: 6.02 },
          initialState: "idle", massKg: 0.8,
          render: { shape: "box", size: { w: 0.15, h: 0.15, d: 0.15 }, color: "#00f" },
        },
      ],
    };
    const scoringRuleset: CompetitionRuleset = {
      ...ruleset,
      absoluteWin: undefined,
      violations: [],
      match: { setupSec: 1, countdownSec: 1, playSec: 30, retriesPerTeam: 1 },
    };
    const core = new SimulationCore(targetArena, scoringRuleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    const match = new MatchController(core, scoringRuleset);
    match.startMatch();
    tickUntil(match, 2.2);
    expect(match.phase).toBe("playing");

    // wrong type is rejected by the target's accepts list
    core.worldObjectCandidates().find((o) => o.id === "objB#1")!.body
      .setTranslation({ x: -7, y: 0.075, z: -2 }, true);
    for (let i = 0; i < 5; i++) match.advance(core.physics.fixedDt);
    expect(match.score.red).toBe(0);

    // correct type scores and becomes locked at the snap pose
    core.worldObjectCandidates().find((o) => o.id === "objA#1")!.body
      .setTranslation({ x: -7, y: 0.075, z: -2 }, true);
    for (let i = 0; i < 5; i++) match.advance(core.physics.fixedDt);
    expect(match.score.red).toBe(10);
    expect(core.objectState("objA#1")).toBe("scored");

    // a scored (fixed) object cannot be pushed out or re-scored
    const objA = core.worldObjectCandidates().find((o) => o.id === "objA#1")!;
    objA.body.applyImpulse({ x: 50, y: 0, z: 50 }, true);
    for (let i = 0; i < 20; i++) match.advance(core.physics.fixedDt);
    const p = core.physics.getEntityTransform(core.objectEntityId("objA#1")!)!.position;
    expect(p.x).toBeCloseTo(-7, 1);
    expect(p.z).toBeCloseTo(-2, 1);
    expect(match.score.red).toBe(10);

    // moving it back into the goal still cannot score again
    objA.body.setTranslation({ x: -6.9, y: 0.075, z: -2.1 }, true);
    for (let i = 0; i < 10; i++) match.advance(core.physics.fixedDt);
    expect(match.score.red).toBe(10);
  });

  it("timeout with unequal scores crowns the leader instead of drawing", async () => {
    await RAPIER.init();
    const scoringRuleset: CompetitionRuleset = {
      ...ruleset,
      match: { setupSec: 0.05, countdownSec: 0.05, playSec: 0.3, retriesPerTeam: 1 },
      scoring: [{ id: "goalRedScore", type: "objectInTrigger", triggerId: "goalRed", team: "red", points: 10 }],
      absoluteWin: undefined,
      violations: [],
    };
    const core = new SimulationCore(arena, scoringRuleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    const match = new MatchController(core, scoringRuleset);
    match.startMatch();

    // place the object inside the red goal while still gated, then play out
    core.worldObjectCandidates()[0].body.setTranslation({ x: -7, y: 0.075, z: -2 }, true);
    tickUntil(match, 3);
    expect(match.phase).toBe("ended");
    expect(match.winner).toBe("red");
    expect(match.score.red).toBeGreaterThan(0);
  });

  it("neutralizes actuators and freezes robot velocities after final whistle", async () => {
    await RAPIER.init();
    const shortRuleset: CompetitionRuleset = {
      ...ruleset,
      match: { setupSec: 0.05, countdownSec: 0.05, playSec: 0.5, retriesPerTeam: 1 },
      scoring: [],
      absoluteWin: undefined,
      violations: [],
    };
    const core = new SimulationCore(arena, shortRuleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    const match = new MatchController(core, shortRuleset);
    match.startMatch();
    tickUntil(match, 0.12);
    expect(match.phase).toBe("playing");

    // drive aggressively during play
    for (let i = 0; i < 20; i++) {
      core.setAxesFromInput(0, { fwd: 1, strafe: 0.5, turn: 1 });
      match.advance(core.physics.fixedDt);
    }
    const movingVel = core.getBody(0)!.linvel();
    expect(Math.hypot(movingVel.x, movingVel.z)).toBeGreaterThan(0.2);

    // play until ended (final whistle)
    tickUntil(match, 1.0);
    expect(match.phase).toBe("ended");
    expect(core.inputGateEnabled).toBe(true);

    const linvelAfter = core.getBody(0)!.linvel();
    const angvelAfter = core.getBody(0)!.angvel();
    expect(linvelAfter.x).toBeCloseTo(0, 4);
    expect(linvelAfter.y).toBeCloseTo(0, 4);
    expect(linvelAfter.z).toBeCloseTo(0, 4);
    expect(angvelAfter.x).toBeCloseTo(0, 4);
    expect(angvelAfter.y).toBeCloseTo(0, 4);
    expect(angvelAfter.z).toBeCloseTo(0, 4);

    const pEnded = core.getBody(0)!.translation();
    // continuing to advance ticks post-whistle must never move the robot
    for (let i = 0; i < 60; i++) {
      match.advance(core.physics.fixedDt);
    }
    const pPost = core.getBody(0)!.translation();
    expect(Math.hypot(pPost.x - pEnded.x, pPost.z - pEnded.z)).toBeLessThan(1e-4);
  });
});
