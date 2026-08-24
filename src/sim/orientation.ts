import * as THREE from "three";

export function quatFromEulerYXZ(x: number, y: number, z: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "YXZ"));
}

export function yawFromQuaternion(q: { x: number; y: number; z: number; w: number }): number {
  const sin = 2 * (q.w * q.y + q.x * q.z);
  const cos = 1 - 2 * (q.y * q.y + q.x * q.x);
  return Math.atan2(sin, cos);
}

export function forwardVectorFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}
