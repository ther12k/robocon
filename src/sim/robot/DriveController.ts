import type { DriveCommand, RobotSpec } from "../types";
import { yawFromQuaternion, forwardVectorFromYaw } from "../orientation";

export interface DriveBody {
  rotation(): { x: number; y: number; z: number; w: number };
  linvel(): { x: number; y: number; z: number };
  angvel(): { x: number; y: number; z: number };
  setLinvel(v: { x: number; y: number; z: number }, wake: boolean): void;
  setAngvel(v: { x: number; y: number; z: number }, wake: boolean): void;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function sane(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export function normalizeCommand(raw: DriveCommand): DriveCommand {
  const cmd = { fwd: sane(raw.fwd), strafe: sane(raw.strafe), turn: clamp(sane(raw.turn), -1, 1) };
  const mag = Math.hypot(cmd.fwd, cmd.strafe);
  if (mag > 1) {
    return { fwd: cmd.fwd / mag, strafe: cmd.strafe / mag, turn: cmd.turn };
  }
  return cmd;
}

const ANGULAR_ACCEL_FACTOR = 2;

export function applyDrive(body: DriveBody, spec: RobotSpec, rawCmd: DriveCommand, dt: number): void {
  const chassis = spec.chassis;
  const maxSpeed = chassis.maxSpeedMps ?? 2;
  const maxAccel = chassis.maxAccelMps2 ?? 4;
  const maxTurnRps = chassis.maxTurnRps ?? 1.5;

  const cmd = normalizeCommand(rawCmd);
  const yaw = yawFromQuaternion(body.rotation());
  const fwd = forwardVectorFromYaw(yaw);
  const rightX = fwd.z;
  const rightZ = -fwd.x;

  const vel = body.linvel();
  let targetVx = 0;
  let targetVz = 0;

  if (chassis.drive === "differential") {
    targetVx = fwd.x * cmd.fwd * maxSpeed;
    targetVz = fwd.z * cmd.fwd * maxSpeed;
  } else {
    targetVx = fwd.x * cmd.fwd * maxSpeed + rightX * cmd.strafe * maxSpeed;
    targetVz = fwd.z * cmd.fwd * maxSpeed + rightZ * cmd.strafe * maxSpeed;
  }

  const dvx = clamp(targetVx - vel.x, -maxAccel * dt, maxAccel * dt);
  const dvz = clamp(targetVz - vel.z, -maxAccel * dt, maxAccel * dt);

  const curW = body.angvel().y;
  const targetW = cmd.turn * maxTurnRps * Math.PI * 2;
  const dw = clamp(targetW - curW, -(maxAccel * ANGULAR_ACCEL_FACTOR) * dt, (maxAccel * ANGULAR_ACCEL_FACTOR) * dt);

  body.setLinvel({ x: vel.x + dvx, y: vel.y, z: vel.z + dvz }, true);
  body.setAngvel({ x: 0, y: curW + dw, z: 0 }, true);
}
