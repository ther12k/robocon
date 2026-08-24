import { describe, expect, it, beforeAll } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import type { DriveCommand } from "../src/sim/types";
import type { ReplayFile } from "../src/core/replayFile";
import { diffSpec, testArena, testCompetition, testProfile } from "./simulationCore.test";

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICKS = 150;

interface FuzzStep {
  axes?: DriveCommand;
  grabSlots: number[];
}

function randomStep(rng: Rng): FuzzStep {
  if (rng() < 0.12) return { grabSlots: [0, 1].filter(() => rng() < 0.5) };
  const q = (v: number) => Math.round(v * 2) / 2;
  return {
    axes: {
      fwd: q(rng() * 2 - 1),
      strafe: q(rng() * 2 - 1),
      turn: q(rng() * 2 - 1),
    },
    grabSlots: [],
  };
}

function newTwoRobotCore(): SimulationCore {
  const core = new SimulationCore(testArena, testCompetition, testProfile);
  core.addRobot(0, diffSpec);
  core.addRobot(1, diffSpec);
  return core;
}

function recordRandomSession(
  seed: number,
  checkpointInterval: number,
  onto?: SimulationCore,
): ReplayFile {
  const rng = mulberry32(seed);
  const core = onto ?? newTwoRobotCore();
  core.beginReplayCapture(checkpointInterval);
  for (let t = 0; t < TICKS; t++) {
    const step = randomStep(rng);
    for (const slot of [0, 1]) {
      if (step.axes) core.setAxesFromInput(slot, step.axes);
      if (step.grabSlots.includes(slot)) core.enqueueGrabToggle(slot);
    }
    const stepsThisFrame = 0.5 + Math.floor(rng() * 3);
    core.advance(core.physics.fixedDt * stepsThisFrame);
  }
  return core.endReplayCapture();
}

function drivePlayback(
  core: SimulationCore,
  file: ReplayFile,
  frameSteps: (i: number) => number,
): void {
  let i = 0;
  let elapsed = 0;
  while (core.isReplayPlaybackActive() && elapsed < file.totalTicks * 4 + 10) {
    const mult = frameSteps(i++);
    core.advance(file.fixedDt * mult);
    elapsed += mult;
  }
}

beforeAll(async () => {
  await RAPIER.init();
});

describe("determinism fuzz (seeded)", () => {
  it("replays identically across seeds, checkpoint intervals, and frame pacing", async () => {
    await RAPIER.init();
    for (let seed = 1; seed <= 12; seed++) {
      const interval = seed % 3 === 0 ? 7 : seed % 3 === 1 ? 60 : 25;
      const file = recordRandomSession(seed, interval);

      expect(file.commands.length, `seed ${seed} recorded too little`).toBeGreaterThan(TICKS / 10);
      expect(file.finalStateHash).not.toBe(file.initialStateHash);

      const dirtyTarget = newTwoRobotCore();
      for (let i = 0; i < 30; i++) {
        dirtyTarget.setAxesFromInput(0, { fwd: 1, strafe: 0, turn: 1 });
        if (i === 10) {
          const obj = dirtyTarget.worldObjectCandidates()[0];
          obj.body.setTranslation({ x: 4, y: 1.5, z: -4 }, true);
        }
        dirtyTarget.advance(dirtyTarget.physics.fixedDt);
      }
      expect(dirtyTarget.stateHash()).not.toBe(file.initialStateHash);
      expect(dirtyTarget.startReplayPlayback(file)).toEqual([]);
      drivePlayback(dirtyTarget, file, (i) => 0.5 + ((i * 7919) % 5));
      expect(dirtyTarget.isReplayPlaybackActive(), `seed ${seed} never completed`).toBe(false);
      expect(dirtyTarget.wasReplayPlaybackCompleted(), `seed ${seed} incomplete`).toBe(true);
      expect(dirtyTarget.replayDesync, `seed ${seed} desync @${dirtyTarget.replayDesync}`).toBeNull();
      expect(dirtyTarget.stateHash(), `seed ${seed} pacing drift`).toBe(file.finalStateHash);

      const freshTarget = newTwoRobotCore();
      expect(freshTarget.startReplayPlayback(file)).toEqual([]);
      drivePlayback(freshTarget, file, () => 1);
      expect(freshTarget.wasReplayPlaybackCompleted()).toBe(true);
      expect(freshTarget.stateHash(), `seed ${seed} fresh-core drift`).toBe(file.finalStateHash);

      const rerecorded = recordRandomSession(seed, interval);
      expect(rerecorded.commands, `seed ${seed} stream drift`).toEqual(file.commands);
      expect(rerecorded.finalStateHash).toBe(file.finalStateHash);
    }
  });

  it("survives five record/playback cycles on one core without drift or leaks", async () => {
    await RAPIER.init();
    const core = newTwoRobotCore();
    for (let cycle = 0; cycle < 5; cycle++) {
      core.resetForReplay();
      const file = recordRandomSession(100 + cycle, 20 + cycle * 5, core);

      expect(core.startReplayPlayback(file), `cycle ${cycle} rejected`).toEqual([]);
      drivePlayback(core, file, (i) => 0.5 + ((i * 104729) % 4));
      expect(core.isReplayPlaybackActive(), `cycle ${cycle} never completed`).toBe(false);
      expect(core.wasReplayPlaybackCompleted(), `cycle ${cycle} incomplete`).toBe(true);
      expect(core.replayDesync, `cycle ${cycle} desync @${core.replayDesync}`).toBeNull();
      expect(core.stateHash(), `cycle ${cycle} drift`).toBe(file.finalStateHash);

      const pristine = newTwoRobotCore();
      expect(pristine.startReplayPlayback(file)).toEqual([]);
      drivePlayback(pristine, file, () => 1);
      expect(pristine.stateHash(), `cycle ${cycle} cross-core drift`).toBe(file.finalStateHash);
    }
  });
});
