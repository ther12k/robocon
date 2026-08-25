import type { GripperModuleSpec, ValidationContext, RobotSpec, Team } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  spec?: RobotSpec;
}

const DRIVES = new Set(["differential", "omni", "mecanum"]);
const SUPPORTED_SCHEMA_VERSION = 1;
const MAX_PLAUSIBLE_M = 3;

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function requirePositiveNumber(
  container: Record<string, unknown>,
  key: string,
  path: string,
  fallback: number | null,
  issues: ValidationIssue[],
): number | null {
  const v = container[key];
  if (v === undefined) return fallback;
  if (!num(v)) {
    issues.push({ level: "error", field: path, message: `${path} must be a finite number` });
    return null;
  }
  if (v <= 0) {
    issues.push({ level: "error", field: path, message: `${path} must be > 0 (got ${v})` });
    return null;
  }
  return v;
}

function clampToCap(
  field: string,
  value: number | null,
  cap: number,
  unit: string,
  issues: ValidationIssue[],
): number | null {
  if (value === null) return null;
  if (value > cap) {
    issues.push({ level: "warning", field, message: `clamped to sim cap ${cap} ${unit}` });
    return cap;
  }
  return value;
}

export function validateSpec(raw: unknown, ctx: ValidationContext): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { issues: [{ level: "error", field: "$", message: "Spec must be a JSON object" }] };
  }
  const o = raw as Record<string, unknown>;

  if (o.schemaVersion !== undefined && o.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    issues.push({
      level: "error",
      field: "schemaVersion",
      message: `unsupported schemaVersion ${String(o.schemaVersion)}; expected ${SUPPORTED_SCHEMA_VERSION} — refusing to apply a spec written for another schema`,
    });
  }

  if (typeof o.name !== "string" || o.name.trim().length === 0) {
    issues.push({ level: "error", field: "name", message: "name is required and must be a non-empty string" });
  }

  const role = typeof o.role === "string" ? o.role : "";
  const roleKnown = role !== "" && Object.hasOwn(ctx.roles, role);
  if (!roleKnown) {
    issues.push({
      level: "error",
      field: "role",
      message: `role must be one of: ${Object.keys(ctx.roles).join(", ")}`,
    });
  }

  const team = o.team;
  if (team !== "red" && team !== "blue") {
    issues.push({ level: "error", field: "team", message: 'team must be "red" or "blue"' });
  }

  const c = (o.chassis ?? {}) as Record<string, unknown>;
  const drive = c.drive;
  if (typeof drive !== "string" || !DRIVES.has(drive)) {
    issues.push({ level: "error", field: "chassis.drive", message: `drive must be one of: ${[...DRIVES].join(", ")}` });
  }

  const fp = (c.footprint ?? {}) as Record<string, unknown>;
  let fw = requirePositiveNumber(fp, "w", "chassis.footprint.w", null, issues);
  let fl = requirePositiveNumber(fp, "l", "chassis.footprint.l", null, issues);
  fw = fw !== null && fw <= MAX_PLAUSIBLE_M ? fw : (fw !== null ? reject(fw, "chassis.footprint.w", issues) : null);
  fl = fl !== null && fl <= MAX_PLAUSIBLE_M ? fl : (fl !== null ? reject(fl, "chassis.footprint.l", issues) : null);

  const height = requirePositiveNumber(c, "height", "chassis.height", 0.3, issues);
  if (height !== null && height > MAX_PLAUSIBLE_M) {
    issues.push({ level: "error", field: "chassis.height", message: `height implausibly large (> ${MAX_PLAUSIBLE_M} m)` });
  } else if (height !== null && roleKnown) {
    const limH = ctx.roles[role]!.maxFootprintMm.h;
    if (height * 1000 > limH) {
      issues.push({ level: "error", field: "chassis.height", message: `${height} m exceeds ${role} limit ${limH / 1000} m` });
    }
  }

  const massKgRaw = c.massKg;
  let massKg: number | null;
  if (massKgRaw === undefined) {
    massKg = 20;
  } else if (!num(massKgRaw)) {
    issues.push({ level: "error", field: "chassis.massKg", message: "massKg must be a finite number" });
    massKg = null;
  } else if (massKgRaw <= 0) {
    issues.push({ level: "error", field: "chassis.massKg", message: `massKg must be > 0 (got ${massKgRaw})` });
    massKg = null;
  } else {
    massKg = massKgRaw;
    if (massKgRaw > ctx.teamWeightBudgetKg) {
      issues.push({
        level: "warning",
        field: "chassis.massKg",
        message: `${massKgRaw} kg exceeds team budget ${ctx.teamWeightBudgetKg} kg (shared with partner robot)`,
      });
    }
  }

  const maxSpeedMps = clampToCap("chassis.maxSpeedMps", requirePositiveNumber(c, "maxSpeedMps", "chassis.maxSpeedMps", 2, issues), ctx.limits.maxSpeedMps, "m/s", issues);
  const maxAccelMps2 = clampToCap("chassis.maxAccelMps2", requirePositiveNumber(c, "maxAccelMps2", "chassis.maxAccelMps2", 4, issues), ctx.limits.maxAccelMps2, "m/s²", issues);
  const maxTurnRps = clampToCap("chassis.maxTurnRps", requirePositiveNumber(c, "maxTurnRps", "chassis.maxTurnRps", 1.5, issues), ctx.limits.maxTurnRps, "rev/s", issues);

  if (fw !== null && fl !== null && roleKnown) {
    const lim = ctx.roles[role]!.maxFootprintMm;
    if (fw * 1000 > lim.w) {
      issues.push({ level: "error", field: "chassis.footprint.w", message: `${fw} m exceeds ${role} limit ${lim.w / 1000} m` });
    }
    if (fl * 1000 > lim.l) {
      issues.push({ level: "error", field: "chassis.footprint.l", message: `${fl} m exceeds ${role} limit ${lim.l / 1000} m` });
    }
  }

  const modulesRaw = Array.isArray(o.modules) ? o.modules : [];
  const modules: GripperModuleSpec[] = [];
  modulesRaw.forEach((m, i) => {
    const mod = (m ?? {}) as Record<string, unknown>;
    if (mod.type === "gripper") {
      const mount = (mod.mount ?? {}) as Record<string, unknown>;
      if (!num(mount.x) || !num(mount.y) || !num(mount.z)) {
        issues.push({
          level: "error",
          field: `modules[${i}].mount`,
          message: "gripper mount requires numeric x/y/z (meters, robot-local)",
        });
        return;
      }
      const gripRangeM = mod.gripRangeM === undefined
        ? 0.18
        : (() => {
            if (!num(mod.gripRangeM) || mod.gripRangeM <= 0) {
              issues.push({ level: "error", field: `modules[${i}].gripRangeM`, message: "gripRangeM must be a positive number" });
              return null;
            }
            return mod.gripRangeM;
          })();
      if (gripRangeM === null) return;
      modules.push({ type: "gripper", mount: { x: mount.x, y: mount.y, z: mount.z }, gripRangeM });
    } else {
      issues.push({
        level: "warning",
        field: `modules[${i}].type`,
        message: `unknown module type "${String(mod.type)}" ignored`,
      });
    }
  });

  if (issues.some((i) => i.level === "error")) return { issues };
  if (fw === null || fl === null || height === null || Number.isNaN(height)) return { issues };

  return {
    issues,
    spec: {
      ...(o.schemaVersion !== undefined ? { schemaVersion: o.schemaVersion as number } : {}),
      name: String(o.name),
      role,
      team: team as Team,
      chassis: {
        drive: drive as RobotSpec["chassis"]["drive"],
        footprint: { w: fw, l: fl },
        height,
        massKg: massKg ?? undefined,
        ...(maxSpeedMps !== null ? { maxSpeedMps } : {}),
        ...(maxAccelMps2 !== null ? { maxAccelMps2 } : {}),
        ...(maxTurnRps !== null ? { maxTurnRps } : {}),
      },
      ...(modules.length > 0 ? { modules } : {}),
    },
  };
}

function reject(value: number, field: string, issues: ValidationIssue[]): null {
  issues.push({ level: "error", field, message: `${field} implausibly large (> ${MAX_PLAUSIBLE_M} m): got ${value}` });
  return null;
}

export function validateTeamMass(specs: Array<RobotSpec | undefined>, budgetKg: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byTeam = new Map<Team, number>();
  for (const s of specs) {
    if (!s) continue;
    byTeam.set(s.team, (byTeam.get(s.team) ?? 0) + (s.chassis.massKg ?? 20));
  }
  for (const [team, total] of byTeam) {
    if (total > budgetKg) {
      issues.push({
        level: "error",
        field: `team.${team}.mass`,
        message: `${team} team total ${total.toFixed(1)} kg exceeds budget ${budgetKg} kg`,
      });
    }
  }
  return issues;
}
