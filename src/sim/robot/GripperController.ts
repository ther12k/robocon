import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { GripperModuleSpec } from "../types";
import type { OwnershipRegistry } from "../physics/OwnershipRegistry";
import { CG_OBJECT, CG_STATIC, ALL_ROBOT_BITS, collisionGroup, robotGroupBit } from "../physics/collisionGroups";

export interface GrabCandidate {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

const tmpQuat = new THREE.Quaternion();
const tmpOffset = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

interface BodyLike {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  linvel(): { x: number; y: number; z: number };
}

export class GripperController {
  readonly module: GripperModuleSpec;
  private held: GrabCandidate | null = null;

  constructor(
    module: GripperModuleSpec,
    private readonly ownerId: string,
    private readonly ownerRobotIndex: number,
    private readonly ownership: OwnershipRegistry,
  ) {
    this.module = module;
  }

  get isHolding(): boolean {
    return this.held !== null;
  }

  get heldId(): string | null {
    return this.held?.id ?? null;
  }

  mountWorld(robotBody: BodyLike): THREE.Vector3 {
    const p = robotBody.translation();
    const r = robotBody.rotation();
    tmpQuat.set(r.x, r.y, r.z, r.w);
    const m = this.module.mount;
    return tmpPos
      .set(m.x, m.y, m.z)
      .applyQuaternion(tmpQuat)
      .add(tmpOffset.set(p.x, p.y, p.z))
      .clone();
  }

  tryGrab(
    robotBody: BodyLike & {
      setTranslation(v: { x: number; y: number; z: number }, wake: boolean): void;
    },
    candidates: GrabCandidate[],
  ): string | null {
    if (this.held) return null;
    const range = this.module.gripRangeM ?? 0.18;
    if (range <= 0) return null;
    const mount = this.mountWorld(robotBody);
    let best: GrabCandidate | null = null;
    let bestDist = range;
    for (const c of candidates) {
      if (this.ownership.isHeld(c.collider.handle)) continue;
      const p = c.body.translation();
      const d = Math.hypot(p.x - mount.x, p.y - mount.y, p.z - mount.z);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    if (!best) return null;
    if (!this.ownership.acquire(best.collider.handle, this.ownerId)) return null;
    this.held = best;
    best.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    const filter = CG_OBJECT | (ALL_ROBOT_BITS & ~robotGroupBit(this.ownerRobotIndex)) | CG_STATIC;
    best.collider.setCollisionGroups(collisionGroup(CG_OBJECT, filter));
    best.body.setTranslation({ x: mount.x, y: Math.max(mount.y, 0.08), z: mount.z }, true);
    return best.id;
  }

  release(robotVelocity?: { x: number; y: number; z: number }): string | null {
    const held = this.held;
    if (!held) return null;
    this.ownership.release(held.collider.handle, this.ownerId);
    this.held = null;
    held.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    held.collider.setCollisionGroups(
      collisionGroup(CG_OBJECT, CG_OBJECT | ALL_ROBOT_BITS | CG_STATIC),
    );
    if (robotVelocity) held.body.setLinvel(robotVelocity, true);
    return held.id;
  }

  update(robotBody: BodyLike): void {
    if (!this.held) return;
    const mount = this.mountWorld(robotBody);
    this.held.body.setNextKinematicTranslation({
      x: mount.x,
      y: Math.max(mount.y, 0.06),
      z: mount.z,
    });
  }

  releaseIfOwned(entityId: string, robotVelocity?: { x: number; y: number; z: number }): boolean {
    if (this.ownerId !== entityId) return false;
    return this.release(robotVelocity) !== null;
  }
}
