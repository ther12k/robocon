import { describe, it, expect, beforeAll } from "vitest";
import { PhysicsWorld } from "../src/sim/physics/PhysicsWorld";
import { createRobotBody } from "../src/sim/robot/RobotBody";
import { applyDrive } from "../src/sim/robot/DriveController";
import type { ArenaConfig, DriveCommand, RobotSpec } from "../src/sim/types";

const arena: ArenaConfig = {
  meta: { name: "test", rulebookVersion: "0", tolerancePct: 5 },
  dimensions: { width: 16, length: 16 },
  zones: [],
  staticProps: [
    {
      id: "ramp",
      type: "ramp",
      pose: { x: 0, y: 0.075, z: -3, rotX: -0.14 },
      size: { w: 1.6, h: 0.06, d: 3 },
    },
  ],
  objectSpawns: [],
  targets: [],
  surfaces: { defaultFriction: 0.7 },
};

const spec: RobotSpec = {
  name: "T1",
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
};

const script: Array<[number, DriveCommand]> = [
  [90, { fwd: 1, strafe: 0, turn: 0 }],
  [30, { fwd: 0, strafe: 0, turn: -0.6 }],
  [45, { fwd: -0.5, strafe: 0, turn: 0 }],
  [60, { fwd: 0, strafe: 0, turn: 0 }],
];

function runSim(): { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number } {
  const phys = new PhysicsWorld();
  phys.buildStaticFromArena(arena);
  const { body } = createRobotBody(phys.world, spec, 0, -7, 6.5, Math.PI);
  for (const [steps, cmd] of script) {
    for (let i = 0; i < steps; i++) {
      applyDrive(body, spec, cmd, phys.fixedDt);
      phys.advance(phys.fixedDt);
    }
  }
  const p = body.translation();
  const r = body.rotation();
  return { x: p.x, y: p.y, z: p.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
}

beforeAll(async () => {
  await PhysicsWorld.init();
});

describe("determinism", () => {
  it("produces bit-identical trajectories for identical input scripts", () => {
    const a = runSim();
    const b = runSim();
    expect(b).toEqual(a);
  });

  it("robot ends up displaced from spawn after scripted drive", () => {
    const end = runSim();
    const displacement = Math.hypot(end.x + 7, end.z - 6.5);
    expect(displacement).toBeGreaterThan(0.5);
  });
});
