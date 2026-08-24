import RAPIER from "@dimforge/rapier3d-compat";
import type { SimulationCore } from "./SimulationCore";
import { yawFromQuaternion } from "../sim/orientation";

export interface Odometry {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  yawRate: number;
}

export interface ObjectDetection {
  objectId: string;
  typeId: string;
  distance: number;
  bearingRad: number;
}

export interface SensorFrame {
  tick: number;
  matchTimeSec: number;
  odometry: Odometry;
  imu: { angularVelocityY: number };
  lidar: Array<{ angleRad: number; distanceM: number }>;
  scan: ObjectDetection[];
  held: boolean;
  heldId: string | null;
  match: { phase: string; timeRemainingSec: number; scores: { red: number; blue: number } };
}

export interface SensorOptions {
  lidarRays?: number;
  lidarFovRad?: number;
  lidarRangeM?: number;
  scanRangeM?: number;
  scanFovRad?: number;
}

const DEFAULTS: Required<SensorOptions> = {
  lidarRays: 9,
  lidarFovRad: Math.PI,
  lidarRangeM: 4,
  scanRangeM: 3.5,
  scanFovRad: (Math.PI * 2) / 3,
};

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function buildSenseFrame(
  core: SimulationCore,
  slot: number,
  opts: SensorOptions = {},
): SensorFrame | null {
  const cfg = { ...DEFAULTS, ...opts };
  const body = core.getBody(slot);
  if (!body) return null;

  const p = body.translation();
  const v = body.linvel();
  const w = body.angvel().y;
  const yaw = yawFromQuaternion(body.rotation());

  const lidar: SensorFrame["lidar"] = [];
  const rays = Math.max(1, cfg.lidarRays);
  for (let i = 0; i < rays; i++) {
    const t = rays === 1 ? 0 : i / (rays - 1) - 0.5;
    const angle = t * cfg.lidarFovRad;
    const dirX = Math.sin(yaw + angle);
    const dirZ = Math.cos(yaw + angle);
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: dirX, y: 0, z: dirZ });
    const hit = core.physics.world.castRay(ray, cfg.lidarRangeM, true, undefined, undefined, undefined, body);
    const dist = hit === null ? cfg.lidarRangeM : Math.min(hit.timeOfImpact, cfg.lidarRangeM);
    lidar.push({ angleRad: Number(angle.toFixed(4)), distanceM: Number(dist.toFixed(4)) });
  }

  const scan: ObjectDetection[] = [];
  for (const candidate of core.worldObjectCandidates()) {
    const entityId = core.objectEntityId(candidate.id);
    if (!entityId) continue;
    const t = core.physics.getEntityTransform(entityId);
    if (!t) continue;
    const dx = t.position.x - p.x;
    const dz = t.position.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > cfg.scanRangeM || dist < 1e-6) continue;
    const bearing = wrapAngle(Math.atan2(dx, dz) - yaw);
    if (Math.abs(bearing) > cfg.scanFovRad / 2) continue;
    scan.push({
      objectId: candidate.id,
      typeId: candidate.id.split("#")[0] ?? "obj",
      distance: Number(dist.toFixed(4)),
      bearingRad: Number(bearing.toFixed(4)),
    });
  }
  scan.sort((a, b) => a.distance - b.distance);

  const grip = core.gripStatus(slot);
  const matchInfo = core.matchInfo();

  return {
    tick: core.tickCount(),
    matchTimeSec: matchInfo.timeRemainingSec,
    odometry: {
      x: Number(p.x.toFixed(4)),
      z: Number(p.z.toFixed(4)),
      yaw: Number(yaw.toFixed(4)),
      speed: Number(Math.hypot(v.x, v.z).toFixed(4)),
      yawRate: Number(w.toFixed(4)),
    },
    imu: { angularVelocityY: Number(w.toFixed(4)) },
    lidar,
    scan,
    held: grip.holding,
    heldId: grip.heldId,
    match: {
      phase: matchInfo.phase,
      timeRemainingSec: Number(matchInfo.timeRemainingSec.toFixed(2)),
      scores: matchInfo.scores,
    },
  };
}
