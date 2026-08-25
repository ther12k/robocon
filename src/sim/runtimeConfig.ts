/**
 * Minimal runtime validation for configuration assets loaded over the network.
 * The goal is to fail boot with a clear message when a shipped config is
 * structurally incomplete — TypeScript casts alone let broken JSON through.
 */

function isFinitePositive(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function checkExtent(obj: unknown, path: string, errors: string[]): void {
  if (typeof obj !== "object" || obj === null) {
    errors.push(`${path} must be an object`);
    return;
  }
  const o = obj as Record<string, unknown>;
  for (const k of ["w", "l", "h"] as const) {
    if (!isFinitePositive(o[k])) errors.push(`${path}.${k} must be a finite number > 0`);
  }
}

export function validateCompetitionRulesetRuntime(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["competition ruleset must be an object"];
  const r = data as Record<string, unknown>;

  // Role constraints are REQUIRED — the robot builder cannot run without them.
  if (typeof r.robots !== "object" || r.robots === null || Array.isArray(r.robots)) {
    errors.push("robots must be an object of role → constraints");
  } else {
    const roles = r.robots as Record<string, unknown>;
    const roleIds = Object.keys(roles);
    if (roleIds.length === 0) errors.push("robots must define at least one role");
    for (const role of roleIds) {
      const rc = roles[role] as Record<string, unknown>;
      checkExtent(rc?.maxFootprintMm, `robots.${role}.maxFootprintMm`, errors);
      checkExtent(rc?.extendedMm, `robots.${role}.extendedMm`, errors);
    }
  }

  if (typeof r.match !== "object" || r.match === null) {
    errors.push("match must be an object");
  } else {
    const m = r.match as Record<string, unknown>;
    for (const k of ["setupSec", "playSec", "retriesPerTeam"] as const) {
      if (!isFinitePositive(m[k])) errors.push(`match.${k} must be a finite number > 0`);
    }
    if (m.countdownSec !== undefined && !isFinitePositive(m.countdownSec)) {
      errors.push("match.countdownSec must be a finite number > 0 when present");
    }
  }

  if (!isFinitePositive(r.teamWeightBudgetKg)) {
    errors.push("teamWeightBudgetKg must be a finite number > 0");
  }

  if (!Array.isArray(r.scoring)) {
    errors.push("scoring must be an array");
  } else {
    for (const [i, s] of (r.scoring as unknown[]).entries()) {
      if (typeof s !== "object" || s === null) {
        errors.push(`scoring[${i}] must be an object`);
        continue;
      }
      const e = s as Record<string, unknown>;
      for (const k of ["id", "triggerId", "team"] as const) {
        if (typeof e[k] !== "string" || (e[k] as string).length === 0) {
          errors.push(`scoring[${i}].${k} must be a non-empty string`);
        }
      }
      if (e.type !== "objectInTrigger") errors.push(`scoring[${i}].type unsupported`);
      if (!isFinitePositive(e.points)) errors.push(`scoring[${i}].points must be > 0`);
    }
  }

  if (r.violations !== undefined) {
    if (!Array.isArray(r.violations)) {
      errors.push("violations must be an array");
    } else {
      for (const [i, v] of (r.violations as unknown[]).entries()) {
        if (typeof v !== "object" || v === null) {
          errors.push(`violations[${i}] must be an object`);
          continue;
        }
        const e = v as Record<string, unknown>;
        if (e.type !== "outOfBounds") errors.push(`violations[${i}].type unsupported`);
        if (!isFinitePositive(e.marginM)) errors.push(`violations[${i}].marginM must be > 0`);
        if (e.effect !== "retry" && e.effect !== "disqualify") {
          errors.push(`violations[${i}].effect must be "retry" or "disqualify"`);
        }
      }
    }
  }

  if (r.absoluteWin !== undefined) {
    if (
      typeof r.absoluteWin !== "object" || r.absoluteWin === null ||
      (r.absoluteWin as Record<string, unknown>).type !== "scoreThreshold" ||
      !isFinitePositive((r.absoluteWin as Record<string, unknown>).points)
    ) {
      errors.push("absoluteWin must be {type:\"scoreThreshold\", points>0}");
    }
  }

  return errors;
}

export function validateSimulationProfileRuntime(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["simulation profile must be an object"];
  const p = data as Record<string, unknown>;
  for (const k of ["maxSpeedMps", "maxAccelMps2", "maxTurnRps"] as const) {
    if (!isFinitePositive(p[k])) errors.push(`${k} must be a finite number > 0`);
  }
  if (p.solverHz !== undefined && !isFinitePositive(p.solverHz)) {
    errors.push("solverHz must be a finite number > 0 when present");
  }
  return errors;
}

const ALLOWED_INITIAL_STATES = new Set(["idle"]);

export function validateArenaRuntime(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["arena must be an object"];
  const a = data as Record<string, unknown>;

  if (typeof a.dimensions !== "object" || a.dimensions === null) {
    errors.push("dimensions must be an object");
  } else {
    const d = a.dimensions as Record<string, unknown>;
    for (const k of ["width", "length"] as const) {
      if (!isFinitePositive(d[k])) errors.push(`dimensions.${k} must be a finite number > 0`);
    }
  }

  if (!Array.isArray(a.zones) || !(a.zones as unknown[]).some(
    (z) => (z as { id?: string })?.id === "startRed",
  ) || !(a.zones as unknown[]).some((z) => (z as { id?: string })?.id === "startBlue")) {
    errors.push("zones must include startRed and startBlue start zones");
  }

  if (!Array.isArray(a.objectSpawns)) {
    errors.push("objectSpawns must be an array");
  } else {
    for (const [i, s] of (a.objectSpawns as unknown[]).entries()) {
      if (typeof s !== "object" || s === null) {
        errors.push(`objectSpawns[${i}] must be an object`);
        continue;
      }
      const o = s as Record<string, unknown>;
      if (typeof o.objectId !== "string" || o.objectId.length === 0) {
        errors.push(`objectSpawns[${i}].objectId required`);
      }
      if (typeof o.typeId !== "string" || o.typeId.length === 0) {
        errors.push(`objectSpawns[${i}].typeId required`);
      }
      // Unsupported initial states are rejected explicitly instead of being
      // silently coerced to idle.
      if (!ALLOWED_INITIAL_STATES.has(String(o.initialState))) {
        errors.push(
          `objectSpawns[${i}].initialState "${String(o.initialState)}" is not supported yet (only "idle")`,
        );
      }
    }
  }

  if (!Array.isArray(a.staticProps)) errors.push("staticProps must be an array");
  if (typeof a.surfaces !== "object" || a.surfaces === null ||
    !isFinitePositive((a.surfaces as Record<string, unknown>).defaultFriction)) {
    errors.push("surfaces.defaultFriction must be a finite number > 0");
  }
  return errors;
}
