import { describe, expect, it, beforeAll } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import type { DriveCommand } from "../src/sim/types";
import {
  REPLAY_SCHEMA_VERSION,
  checkReplayCompatibility,
  firstDivergentCheckpoint,
  type ReplayFile,
} from "../src/core/replayFile";
import { diffSpec, testArena, testCompetition, testProfile } from "./simulationCore.test";
import { MatchController } from "../src/core/match";

interface ScriptedStep {
  axes?: DriveCommand;
  grabToggle?: boolean;
}

const script: ScriptedStep[] = [
  ...Array.from({ length: 40 }, () => ({ axes: { fwd: 1, strafe: 0, turn: 0 } as DriveCommand })),
  { grabToggle: true },
  ...Array.from({ length: 50 }, () => ({ axes: { fwd: 1, strafe: 0, turn: 0.3 } as DriveCommand })),
  { grabToggle: true },
  ...Array.from({ length: 30 }, () => ({ axes: { fwd: -0.6, strafe: 0, turn: -0.4 } as DriveCommand })),
];

const CHECKPOINT_EVERY = 15;

function newCore(): SimulationCore {
  const core = new SimulationCore(testArena, testCompetition, testProfile);
  core.addRobot(0, diffSpec);
  return core;
}

function recordToFile(tamper?: (commands: ReplayFile["commands"]) => void): ReplayFile {
  const core = newCore();
  core.beginReplayCapture(CHECKPOINT_EVERY);
  for (const step of script) {
    if (step.axes) core.setAxesFromInput(0, step.axes);
    if (step.grabToggle) core.enqueueGrabToggle(0);
    core.advance(core.physics.fixedDt);
  }
  const file = core.endReplayCapture();
  if (tamper) tamper(file.commands);
  return file;
}

function replayCommands(core: SimulationCore, commands: ReplayFile["commands"], totalTicks: number): void {
  const byTick = new Map<number, ReplayFile["commands"]>();
  for (const c of commands) {
    const list = byTick.get(c.tick) ?? [];
    list.push(c);
    byTick.set(c.tick, list);
  }
  for (let tick = 0; tick < totalTicks; tick++) {
    core.bus.setTick(tick);
    for (const c of byTick.get(tick) ?? []) core.injectCommand(c.action);
    core.advance(core.physics.fixedDt);
  }
}

function replayFile(file: ReplayFile): ReplayFile {
  const core = newCore();
  const issues = checkReplayCompatibility(file, core.replayRuntimeInfo());
  expect(issues).toEqual([]);
  core.beginReplayCapture(file.checkpointIntervalTicks);
  replayCommands(core, file.commands, file.totalTicks);
  return core.endReplayCapture();
}

beforeAll(async () => {
  await RAPIER.init();
});

describe("versioned replay files (R1-06)", () => {
  it("round-trips commands, checkpoints, and final hash through a versioned file", async () => {
    await RAPIER.init();
    const original = recordToFile();

    expect(original.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(original.initialStateHash).not.toBe("");
    expect(original.totalTicks).toBe(script.length);
    expect(original.checkpoints.length).toBeGreaterThan(3);
    expect(original.finalStateHash).not.toBe(original.initialStateHash);

    const replayed = replayFile(original);

    expect(replayed.finalStateHash).toBe(original.finalStateHash);
    expect(replayed.checkpoints).toEqual(original.checkpoints);
  });

  it("localizes a mid-script divergence to the first checkpoint after the tampered command", async () => {
    await RAPIER.init();
    const original = recordToFile();

    let tamperTick = -1;
    const tampered = recordToFile((commands) => {
      const target = commands.find((c) => c.action.kind === "axes" && c.tick > script.length / 2);
      expect(target).toBeDefined();
      tamperTick = target!.tick;
      if (target?.action.kind === "axes") {
        target.action.payload = { ...target.action.payload, turn: -target.action.payload.turn - 1.2 };
      }
    });
    expect(tamperTick).toBeGreaterThan(0);

    expect(tampered.initialStateHash).toBe(original.initialStateHash);

    const replayed = replayFile(tampered);

    expect(replayed.finalStateHash).not.toBe(original.finalStateHash);

    const idx = firstDivergentCheckpoint(original.checkpoints, replayed.checkpoints);
    expect(idx).toBeGreaterThanOrEqual(0);
    const divergent = replayed.checkpoints[idx];
    expect(divergent.tick).toBeGreaterThanOrEqual(tamperTick);
    for (let i = 0; i < idx; i++) {
      expect(replayed.checkpoints[i]).toEqual(original.checkpoints[i]);
    }
  });

  it("resetForReplay restores robots and objects so the spawn hash matches a fresh core", async () => {
    await RAPIER.init();
    const fresh = newCore();
    const pristineHash = fresh.stateHash();

    const dirty = newCore();
    dirty.beginReplayCapture(CHECKPOINT_EVERY);
    for (let i = 0; i < 60; i++) {
      dirty.setAxesFromInput(0, { fwd: 1, strafe: 1, turn: 0.5 });
      if (i === 10) {
        const obj = dirty.worldObjectCandidates()[0];
        obj.body.setTranslation({ x: 5, y: 1, z: 5 }, true);
      }
      dirty.advance(dirty.physics.fixedDt);
    }
    dirty.endReplayCapture();
    expect(dirty.stateHash()).not.toBe(pristineHash);

    dirty.resetForReplay();
    expect(dirty.stateHash()).toBe(pristineHash);
  });

  it("playback reproduces the final hash under jittery multi-step frame advances", async () => {
    await RAPIER.init();
    const original = recordToFile();

    const core = newCore();
    expect(core.startReplayPlayback(original)).toEqual([]);
    const pattern = [1, 3, 0.5, 2, 1, 4, 0.5, 0.5, 2, 3];
    let i = 0;
    let elapsed = 0;
    while (core.isReplayPlaybackActive() && elapsed < original.totalTicks * 3) {
      const dt = core.physics.fixedDt * pattern[i++ % pattern.length];
      core.advance(dt);
      elapsed += pattern[(i - 1) % pattern.length];
    }
    expect(core.isReplayPlaybackActive()).toBe(false);
    expect(core.wasReplayPlaybackCompleted()).toBe(true);
    expect(core.stateHash()).toBe(original.finalStateHash);
  });

  it("aborts playback and reports the first checkpoint tick whose hash diverges", async () => {
    await RAPIER.init();
    const original = recordToFile();
    expect(original.checkpoints.length).toBeGreaterThan(2);

    const corrupted = structuredClone(original);
    const victim = corrupted.checkpoints[corrupted.checkpoints.length - 1];
    victim.hash = "00000000";

    const core = newCore();
    expect(core.startReplayPlayback(corrupted)).toEqual([]);
    let guard = 0;
    while (core.isReplayPlaybackActive() && guard++ < corrupted.totalTicks * 3) {
      core.advance(core.physics.fixedDt);
    }
    expect(core.isReplayPlaybackActive()).toBe(false);
    expect(core.wasReplayPlaybackCompleted()).toBe(false);
    expect(core.replayDesync).toBe(victim.tick);
  });

  it("records and replays a full match session including the scoreboard outcome", async () => {
    await RAPIER.init();
    const competition = {
      ...testCompetition,
      match: { setupSec: 0.05, countdownSec: 0.05, playSec: 2, retriesPerTeam: 1 },
    };

    const core = new SimulationCore(testArena, competition, testProfile);
    core.addRobot(0, diffSpec);
    const match = new MatchController(core, competition);
    core.resetForReplay();
    core.beginReplayCapture(30);
    match.startMatch();

    for (let t = 0; t < 8; t++) {
      core.setAxesFromInput(0, { fwd: 1, strafe: 1, turn: 1 });
      core.advance(core.physics.fixedDt);
    }
    expect(match.phase).toBe("playing");

    for (let t = 0; t < 60; t++) {
      core.setAxesFromInput(0, { fwd: -1, strafe: 0, turn: t % 2 });
      if (t === 5) core.enqueueGrabToggle(0);
      core.advance(core.physics.fixedDt);
    }
    const file = core.endReplayCapture({ matchStarted: true });
    expect(file.matchStarted).toBe(true);

    const recordedScore = { ...match.score };
    const recordedWinner = match.winner;
    const recordedEntries = match.entries.map((e) => [e.tick, e.kind, e.team ?? "", e.ruleId]);

    const replayCore = new SimulationCore(testArena, competition, testProfile);
    replayCore.addRobot(0, diffSpec);
    const replayMatch = new MatchController(replayCore, competition);
    replayMatch.startMatch();
    expect(replayCore.startReplayPlayback(file)).toEqual([]);
    let guard = 0;
    while (replayCore.isReplayPlaybackActive() && guard++ < file.totalTicks * 3) {
      replayCore.advance(file.fixedDt);
    }
    expect(replayCore.wasReplayPlaybackCompleted()).toBe(true);
    expect(replayCore.replayDesync).toBeNull();
    expect(replayCore.stateHash()).toBe(file.finalStateHash);
    expect({ ...replayMatch.score }).toEqual(recordedScore);
    expect(replayMatch.winner).toBe(recordedWinner);
    expect(replayMatch.entries.map((e) => [e.tick, e.kind, e.team ?? "", e.ruleId])).toEqual(
      recordedEntries,
    );
  });

  it("captures externally injected commands (autonomy releases) and replays them", async () => {
    await RAPIER.init();
    const core = newCore();
    core.beginReplayCapture(30);

    let grabbed = false;
    let tick = 0;
    for (; tick < 300 && !grabbed; tick++) {
      const body = core.getBody(0)!;
      const p = body.translation();
      const r = body.rotation();
      const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
      const objT = core.worldObjectCandidates()[0].body.translation();
      const dx = objT.x - p.x;
      const dz = objT.z - p.z;
      const desiredYaw = Math.atan2(dx, dz);
      let err = desiredYaw - yaw;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      const turn = Math.max(-1, Math.min(1, err * 2));
      const dist = Math.hypot(dx, dz);
      const fwd = Math.abs(err) < 0.5 ? 1 : 0.15;
      core.setAxesFromInput(0, { fwd, strafe: 0, turn });
      if (dist < 0.9 && tick % 13 === 5) core.enqueueGrabToggle(0);
      core.advance(core.physics.fixedDt);
      grabbed = core.gripStatus(0).holding;
    }
    expect(grabbed, "closed-loop bot failed to grab").toBe(true);

    for (let t = 0; t < 25; t++) {
      core.setAxesFromInput(0, { fwd: -1, strafe: 0, turn: 0 });
      core.advance(core.physics.fixedDt);
    }
    core.injectCommand({ kind: "release", slot: 0 });
    core.advance(core.physics.fixedDt);
    expect(core.gripStatus(0).holding).toBe(false);

    const file = core.endReplayCapture();
    expect(file.commands.some((c) => c.action.kind === "release")).toBe(true);
    expect(file.finalStateHash).not.toBe(file.initialStateHash);

    const target = newCore();
    expect(target.startReplayPlayback(file)).toEqual([]);
    let guard = 0;
    while (target.isReplayPlaybackActive() && guard++ < file.totalTicks * 3) {
      target.advance(file.fixedDt);
    }
    expect(target.wasReplayPlaybackCompleted()).toBe(true);
    expect(target.replayDesync).toBeNull();
    expect(target.stateHash()).toBe(file.finalStateHash);
    expect(target.gripStatus(0).holding).toBe(false);
  });

  it("rejects replays whose config, engine, or initial state no longer match", async () => {
    await RAPIER.init();
    const file = recordToFile();
    const core = newCore();
    const runtime = core.replayRuntimeInfo();

    expect(checkReplayCompatibility(file, runtime)).toEqual([]);

    const arenaChanged = structuredClone(file);
    arenaChanged.configHashes.arena = "00000000";
    expect(
      checkReplayCompatibility(arenaChanged, runtime).some((i) => i.field === "configHashes.arena"),
    ).toBe(true);

    const engineChanged = structuredClone(file);
    engineChanged.engineVersion = "999.0.0";
    expect(
      checkReplayCompatibility(engineChanged, runtime).some((i) => i.field === "engineVersion"),
    ).toBe(true);

    const physicsChanged = structuredClone(file);
    physicsChanged.physicsVersion = "0.0.0-test";
    expect(
      checkReplayCompatibility(physicsChanged, runtime).some((i) => i.field === "physicsVersion"),
    ).toBe(true);

    const dtChanged = structuredClone(file);
    dtChanged.fixedDt = 1 / 120;
    expect(checkReplayCompatibility(dtChanged, runtime).some((i) => i.field === "fixedDt")).toBe(true);

    const stateChanged = structuredClone(file);
    stateChanged.initialStateHash = "deadbeef";
    expect(
      checkReplayCompatibility(stateChanged, runtime).some((i) => i.field === "initialStateHash"),
    ).toBe(true);

    const future = structuredClone(file) as unknown as { schemaVersion: number };
    future.schemaVersion = REPLAY_SCHEMA_VERSION + 1;
    const futureIssues = checkReplayCompatibility(future as unknown as ReplayFile, runtime);
    expect(futureIssues.length).toBe(1);
    expect(futureIssues[0].field).toBe("schemaVersion");
  });
});
