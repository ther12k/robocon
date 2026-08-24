import RAPIER from "@dimforge/rapier3d-compat";
import type { RobotSpec } from "../types";
import { quatFromEulerYXZ } from "../orientation";
import { robotGroups, collisionGroup } from "../physics/collisionGroups";

export interface RobotPhysics {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export function createRobotBody(
  world: RAPIER.World,
  spec: RobotSpec,
  robotIndex: number,
  x: number,
  z: number,
  yaw: number,
): RobotPhysics {
  const h = spec.chassis.height ?? 0.3;
  const quat = quatFromEulerYXZ(0, yaw, 0);
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, h / 2 + 0.02, z)
    .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
    .setLinearDamping(0.1)
    .setAngularDamping(0.2);
  const body = world.createRigidBody(desc);
  const g = robotGroups(robotIndex);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    spec.chassis.footprint.w / 2,
    h / 2,
    spec.chassis.footprint.l / 2,
  )
    .setFriction(0.02)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
    .setCollisionGroups(collisionGroup(g.membership, g.filter));
  const volume = spec.chassis.footprint.w * h * spec.chassis.footprint.l;
  const collider = world.createCollider(colliderDesc, body);
  collider.setDensity((spec.chassis.massKg ?? 20) / Math.max(volume, 1e-6));
  return { body, collider };
}
