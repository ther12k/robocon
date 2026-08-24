import { describe, it, expect, beforeAll } from "vitest";
import { PhysicsWorld } from "../src/sim/physics/PhysicsWorld";
import { createRobotBody } from "../src/sim/robot/RobotBody";
import { applyDrive } from "../src/sim/robot/DriveController";
import { GripperController } from "../src/sim/robot/GripperController";
import { OwnershipRegistry } from "../src/sim/physics/OwnershipRegistry";
import type { ArenaConfig, ObjectSpawnDef, RobotSpec } from "../src/sim/types";

const arena: ArenaConfig = {
  meta: { name: "test", rulebookVersion: "0", tolerancePct: 5 },
  dimensions: { width: 16, length: 16 },
  zones: [],
  staticProps: [],
  objectSpawns: [],
  targets: [],
  surfaces: { defaultFriction: 0.7 },
};

const spec: RobotSpec = {
  name: "GripBot",
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

const spawnDef: ObjectSpawnDef = {
  objectId: "objA#9",
  typeId: "objA",
  pose: { x: -7, y: 0.075, z: 6.02 },
  initialState: "idle",
  massKg: 0.8,
  render: { shape: "box", size: { w: 0.15, h: 0.15, d: 0.15 }, color: "#fff" },
};

beforeAll(async () => {
  await PhysicsWorld.init();
});

function makeSetup() {
  const phys = new PhysicsWorld();
  phys.buildStaticFromArena(arena);
  const ownership = new OwnershipRegistry();
  const red = createRobotBody(phys.world, spec, 0, -7, 6.5, Math.PI);
  const blue = createRobotBody(phys.world, spec, 1, 7, -6.5, 0);
  const obj = phys.addDynamicObject(spawnDef, 0.7);
  phys.registerEntity("robot-0", red.body);
  phys.registerEntity("robot-1", blue.body);
  phys.registerEntity("obj-objA#9", obj.body);
  const gripperRed = new GripperController(
    { type: "gripper", mount: { x: 0, y: 0.12, z: 0.4 }, gripRangeM: 0.25 },
    "robot-0",
    0,
    ownership,
  );
  const candidates = [{ id: spawnDef.objectId, body: obj.body, collider: obj.collider }];
  return {
    phys,
    ownership,
    body: red.body,
    blueBody: blue.body,
    obj,
    gripperRed,
    candidates,
  };
}

describe("gripper ownership (R0-03)", () => {
  it("grabs a nearby object, carries it while driving, releases with momentum", () => {
    const { phys, body, obj, gripperRed, candidates } = makeSetup();

    expect(gripperRed.tryGrab(body, candidates)).toBe("objA#9");
    expect(gripperRed.isHolding).toBe(true);

    for (let i = 0; i < 60; i++) {
      applyDrive(body, spec, { fwd: 1, strafe: 0, turn: 0 }, phys.fixedDt);
      gripperRed.update(body);
      phys.advance(phys.fixedDt);
    }

    const p = obj.body.translation();
    const robotPos = body.translation();
    expect(Math.hypot(p.x - robotPos.x, p.z - robotPos.z)).toBeLessThan(0.8);

    expect(gripperRed.release(body.linvel())).toBe("objA#9");
    expect(obj.body.bodyType()).toBe(0);

    for (let i = 0; i < 30; i++) phys.advance(phys.fixedDt);

    const afterReleaseZ = obj.body.translation().z;
    expect(Math.abs(afterReleaseZ - robotPos.z)).toBeGreaterThan(0.3);
  });

  it("allows re-grabbing after release (ownership fully cleared)", () => {
    const { body, gripperRed, candidates } = makeSetup();

    expect(gripperRed.tryGrab(body, candidates)).toBe("objA#9");
    expect(gripperRed.release()).toBe("objA#9");
    expect(gripperRed.isHolding).toBe(false);

    expect(gripperRed.tryGrab(body, candidates)).toBe("objA#9");
    expect(gripperRed.heldId).toBe("objA#9");
  });

  it("prevents a second gripper from stealing an owned object", () => {
    const { body, blueBody, obj, gripperRed, ownership, candidates } = makeSetup();
    const gripperBlue = new GripperController(
      { type: "gripper", mount: { x: 0, y: 0.12, z: 0.4 }, gripRangeM: 25 },
      "robot-1",
      1,
      ownership,
    );

    expect(gripperRed.tryGrab(body, candidates)).toBe("objA#9");
    expect(gripperBlue.tryGrab(blueBody, candidates)).toBeNull();
    expect(obj.body.bodyType()).toBe(2);

    gripperRed.release();
    expect(gripperBlue.tryGrab(blueBody, candidates)).toBe("objA#9");
  });

  it("unregistering an entity removes its body and sync entry", () => {
    const { phys, obj } = makeSetup();
    const handle = obj.collider.handle;
    expect(phys.getEntity("obj-objA#9")).toBeDefined();
    expect(phys.unregisterEntity("obj-objA#9")).toBe(true);
    expect(phys.getEntity("obj-objA#9")).toBeUndefined();
    expect(phys.world.getCollider(handle)).toBeNull();
    expect(phys.unregisterEntity("obj-objA#9")).toBe(false);
  });

  it("unregistering an entity removes its body and sync entry", () => {
    const { phys, obj } = makeSetup();
    const handle = obj.collider.handle;
    expect(phys.getEntity("obj-objA#9")).toBeDefined();
    expect(phys.unregisterEntity("obj-objA#9")).toBe(true);
    expect(phys.getEntity("obj-objA#9")).toBeUndefined();
    expect(phys.world.getCollider(handle)).toBeNull();
    expect(phys.unregisterEntity("obj-objA#9")).toBe(false);
  });
});
