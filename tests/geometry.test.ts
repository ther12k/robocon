import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { ColliderDesc } from "@dimforge/rapier3d-compat";
import { shapeToColliderDesc, poseToQuaternion } from "../src/sim/geometry";
import { normalizeCommand } from "../src/sim/robot/DriveController";
import {
  robotGroupBit,
  objectIdleGroups,
  objectHeldByGroups,
  ALL_ROBOT_BITS,
  MAX_ROBOTS,
} from "../src/sim/physics/collisionGroups";

interface BallShape {
  shape: { type: number; radius: number };
}
interface CylShape {
  shape: { type: number; halfHeight: number; radius: number };
}
interface BoxShape {
  shape: { type: number; halfExtents: { x: number; y: number; z: number } };
}

describe("canonical geometry layer (R0-04)", () => {
  it("sphere maps to a ball collider with matching radius", () => {
    const desc = shapeToColliderDesc("sphere", { w: 0.2, h: 0.2, d: 0.2 }) as ColliderDesc & BallShape;
    expect(desc.shape.type).toBe(0);
    expect(desc.shape.radius).toBeCloseTo(0.1, 10);
  });

  it("cylinder collider matches visual dimensions", () => {
    const desc = shapeToColliderDesc("cylinder", { w: 0.16, h: 0.12, d: 0.16 }) as ColliderDesc &
      CylShape;
    expect(desc.shape.halfHeight).toBeCloseTo(0.06, 10);
    expect(desc.shape.radius).toBeCloseTo(0.08, 10);
  });

  it("box collider uses half-extents", () => {
    const desc = shapeToColliderDesc("box", { w: 0.3, h: 0.2, d: 0.1 }) as ColliderDesc & BoxShape;
    expect(desc.shape.type).toBe(1);
    expect(desc.shape.halfExtents.x).toBeCloseTo(0.15, 10);
    expect(desc.shape.halfExtents.y).toBeCloseTo(0.1, 10);
    expect(desc.shape.halfExtents.z).toBeCloseTo(0.05, 10);
  });

  it("pose rotation includes rotX so ramp visuals match physics colliders", () => {
    const q = poseToQuaternion({ rotX: -0.14, rotY: Math.PI / 2, rotZ: 0.02 });
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    expect(e.x).toBeCloseTo(-0.14, 6);
    expect(e.y).toBeCloseTo(Math.PI / 2, 6);
    expect(e.z).toBeCloseTo(0.02, 6);
  });
});

describe("input normalization (diagonal speed)", () => {
  it("caps combined fwd+strafe magnitude at maxSpeed", () => {
    const n = normalizeCommand({ fwd: 1, strafe: 1, turn: 0 });
    expect(Math.hypot(n.fwd, n.strafe)).toBeCloseTo(1, 9);
  });

  it("leaves sub-unit commands untouched", () => {
    const n = normalizeCommand({ fwd: 0.5, strafe: 0.5, turn: 0.2 });
    expect(n.fwd).toBe(0.5);
    expect(n.strafe).toBe(0.5);
    expect(n.turn).toBe(0.2);
  });
});

describe("collision groups (holder-only exclusion)", () => {
  it("held object filter excludes only the holder's bit", () => {
    const idle = objectIdleGroups();
    const heldBy0 = objectHeldByGroups(0);
    expect(idle.filter & robotGroupBit(0)).not.toBe(0);
    expect(heldBy0.filter & robotGroupBit(0)).toBe(0);
    expect(heldBy0.filter & robotGroupBit(1)).not.toBe(0);
  });

  it("all robot bits stay within membership space", () => {
    let mask = 0;
    for (let i = 0; i < MAX_ROBOTS; i++) mask |= robotGroupBit(i);
    expect(mask).toBe(ALL_ROBOT_BITS);
  });
});
