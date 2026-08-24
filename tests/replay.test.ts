import { describe, it, expect, beforeAll } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import { diffSpec, testArena, testCompetition, testProfile } from "./simulationCore.test";
import type { DriveCommand } from "../src/sim/types";

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

beforeAll(async () => {
  await RAPIER.init();
});

function runRecorded() {
  const core = new SimulationCore(testArena, testCompetition, testProfile);
  core.addRobot(0, diffSpec);
  core.bus.startRecording();
  const initialHash = core.stateHash();
  for (const step of script) {
    if (step.axes) core.setAxesFromInput(0, step.axes);
    if (step.grabToggle) core.enqueueGrabToggle(0);
    core.advance(core.physics.fixedDt);
  }
  const commands = core.bus.stopRecording();
  return {
    finalHash: core.stateHash(),
    initialHash,
    commands: JSON.parse(JSON.stringify(commands)) as typeof commands,
  };
}

function replay(commands: ReturnType<SimulationCore["bus"]["recordedCommands"]>, totalTicks: number) {
  const core = new SimulationCore(testArena, testCompetition, testProfile);
  core.addRobot(0, diffSpec);
  const byTick = new Map<number, typeof commands>();
  for (const c of commands) {
    const list = byTick.get(c.tick) ?? [];
    list.push(c);
    byTick.set(c.tick, list);
  }
  for (let tick = 0; tick < totalTicks; tick++) {
    core.bus.setTick(tick);
    for (const c of byTick.get(tick) ?? []) {
      core.injectCommand(c.action);
    }
    core.advance(core.physics.fixedDt);
  }
  return core.stateHash();
}

describe("replay round-trip (R1-05)", () => {
  it("recorded command stream reproduces the identical state hash", async () => {
    await RAPIER.init();
    const first = runRecorded();
    const second = runRecorded();

    expect(second.finalHash).toBe(first.finalHash);
    expect(second.commands).toEqual(first.commands);

    const replayedHash = replay(first.commands, script.length);
    expect(replayedHash).toBe(first.finalHash);
  });
});
