import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Pose2, ShapeKind, ShapeSize } from "./types";

export type { ShapeKind, ShapeSize };

export function shapeToGeometry(kind: ShapeKind, size: ShapeSize): THREE.BufferGeometry {
  switch (kind) {
    case "cylinder":
      return new THREE.CylinderGeometry(size.w / 2, size.w / 2, size.h, 24);
    case "sphere":
      return new THREE.SphereGeometry(size.w / 2, 20, 16);
    default:
      return new THREE.BoxGeometry(size.w, size.h, size.d);
  }
}

export function shapeToColliderDesc(kind: ShapeKind, size: ShapeSize): RAPIER.ColliderDesc {
  switch (kind) {
    case "cylinder":
      return RAPIER.ColliderDesc.cylinder(size.h / 2, size.w / 2);
    case "sphere":
      return RAPIER.ColliderDesc.ball(size.w / 2);
    default:
      return RAPIER.ColliderDesc.cuboid(size.w / 2, size.h / 2, size.d / 2);
  }
}

export function shapeVolume(kind: ShapeKind, size: ShapeSize): number {
  switch (kind) {
    case "cylinder":
      return Math.PI * (size.w / 2) ** 2 * size.h;
    case "sphere":
      return (4 / 3) * Math.PI * (size.w / 2) ** 3;
    default:
      return size.w * size.h * size.d;
  }
}

export function poseToQuaternion(pose: Pick<Pose2, "rotX" | "rotY" | "rotZ">): THREE.Quaternion {
  const e = new THREE.Euler(pose.rotX ?? 0, pose.rotY ?? 0, pose.rotZ ?? 0, "YXZ");
  return new THREE.Quaternion().setFromEuler(e);
}
