import type { RecordedCommand } from "./CommandBus";

export const REPLAY_SCHEMA_VERSION = 2;

export interface ReplayCheckpoint {
  tick: number;
  hash: string;
}

export interface ReplayFile {
  schemaVersion: 1 | 2;
  engineVersion: string;
  physicsVersion: string;
  buildId: string;
  wasmHash: string;
  fixedDt: number;
  configHashes: Record<string, string>;
  initialStateHash: string;
  checkpointIntervalTicks: number;
  checkpoints: ReplayCheckpoint[];
  totalTicks: number;
  finalStateHash: string;
  commands: RecordedCommand[];
  /** True when the recording session began with a match start. */
  matchStarted?: boolean;
}

export interface ReplayRuntimeInfo {
  engineVersion: string;
  physicsVersion: string;
  buildId: string;
  wasmHash: string;
  fixedDt: number;
  configHashes: Record<string, string>;
  initialStateHash: string;
}

export interface ReplayCompatibilityIssue {
  field: string;
  message: string;
}

export type ParseResult =
  | { ok: true; file: ReplayFile }
  | { ok: false; errors: string[] };

const MAX_TOTAL_TICKS = 10_000_000;
const MAX_COMMANDS = 200_000;
const MAX_CHECKPOINTS = 200_000;
const MAX_LABEL_LEN = 64;

function isHexHash(v: unknown, len = 8): boolean {
  return typeof v === "string" && v.length === len && /^[0-9a-f]+$/.test(v);
}

function isIntInRange(v: unknown, lo: number, hi: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

function isFiniteIn(v: unknown, lo: number, hi: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
}

function isValidAction(action: unknown, totalTicks: number): string[] {
  const errors: string[] = [];
  if (typeof action !== "object" || action === null) {
    errors.push("command action must be an object");
    return errors;
  }
  const a = action as Record<string, unknown>;
  const keys = Object.keys(a).sort().join(",");
  if (!isIntInRange(a.slot, 0, 7)) errors.push("action.slot must be an integer in [0,7]");
  switch (a.kind) {
    case "axes":
      if (keys !== "kind,payload,slot") errors.push("axes action has unexpected keys");
      if (typeof a.kind !== "string") errors.push("action.kind must be a string");
      {
        const p = a.payload as Record<string, unknown> | undefined;
        if (
          typeof p !== "object" || p === null ||
          Object.keys(p).sort().join(",") !== "fwd,strafe,turn" ||
          !isFiniteIn((p as Record<string, unknown>).fwd, -1, 1) ||
          !isFiniteIn((p as Record<string, unknown>).strafe, -1, 1) ||
          !isFiniteIn((p as Record<string, unknown>).turn, -1, 1)
        ) {
          errors.push("axes payload must be {fwd,strafe,turn} with finite values in [-1,1]");
        }
      }
      break;
    case "grabToggle":
    case "release":
      if (keys !== "kind,slot") errors.push(`${String(a.kind)} action has unexpected keys`);
      break;
    default:
      errors.push(`unknown action kind`);
  }
  void totalTicks;
  return errors;
}

/** Strict runtime validation for untrusted replay data. */
export function parseReplayFile(data: unknown): ParseResult {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: ["replay must be a JSON object"] };
  }
  const f = data as Record<string, unknown>;
  const allowed = [
    "schemaVersion", "engineVersion", "physicsVersion", "buildId", "wasmHash",
    "fixedDt", "configHashes",
    "initialStateHash", "checkpointIntervalTicks", "checkpoints", "totalTicks",
    "finalStateHash", "commands", "matchStarted",
  ];
  const keys = Object.keys(f).sort();
  for (const k of keys) {
    if (!allowed.includes(k)) errors.push(`unknown field: ${k}`);
  }
  for (const k of ["schemaVersion", "engineVersion", "physicsVersion", "buildId", "wasmHash", "fixedDt", "configHashes", "initialStateHash", "checkpointIntervalTicks", "checkpoints", "totalTicks", "finalStateHash", "commands"]) {
    if (!(k in f)) errors.push(`missing field: ${k}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if ((f as { schemaVersion: unknown }).schemaVersion !== REPLAY_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion ${String((f as { schemaVersion: unknown }).schemaVersion)} != supported ${REPLAY_SCHEMA_VERSION}`,
    );
    return { ok: false, errors };
  }
  for (const k of ["engineVersion", "physicsVersion", "buildId"] as const) {
    const v = f[k];
    if (typeof v !== "string" || v.length === 0 || v.length > MAX_LABEL_LEN) {
      errors.push(`${k} must be a non-empty string up to ${MAX_LABEL_LEN} chars`);
    }
  }
  if (!isHexHash(f.wasmHash, 12)) errors.push("wasmHash must be a 12-char hex string");
  if (!isFiniteIn(f.fixedDt, 1e-6, 1)) errors.push("fixedDt must be a finite number in (0,1]");
  if (
    typeof f.configHashes !== "object" || f.configHashes === null ||
    Array.isArray(f.configHashes)
  ) {
    errors.push("configHashes must be an object");
  } else {
    const entries = Object.entries(f.configHashes as Record<string, unknown>);
    if (entries.length > 16) errors.push("configHashes has too many entries");
    for (const [k, v] of entries) {
      if (k.length > 32 || !/^[a-zA-Z]+$/.test(k)) errors.push(`configHashes key invalid: ${k}`);
      if (!isHexHash(v, 8)) errors.push(`configHashes.${k} must be an 8-char lowercase hex hash`);
    }
  }
  if (!isHexHash(f.initialStateHash)) errors.push("initialStateHash must be an 8-char hex string");
  if (!isHexHash(f.finalStateHash)) errors.push("finalStateHash must be an 8-char hex string");
  if (!isIntInRange(f.checkpointIntervalTicks, 1, 60000)) {
    errors.push("checkpointIntervalTicks must be an integer in [1,60000]");
  }
  if (!isIntInRange(f.totalTicks, 1, MAX_TOTAL_TICKS)) {
    errors.push(`totalTicks must be an integer in [1,${MAX_TOTAL_TICKS}]`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const totalTicks = f.totalTicks as number;
  const interval = f.checkpointIntervalTicks as number;

  if (!Array.isArray(f.checkpoints)) {
    errors.push("checkpoints must be an array");
  } else {
    if (f.checkpoints.length > Math.min(MAX_CHECKPOINTS, Math.ceil(totalTicks / interval) + 2)) {
      errors.push("too many checkpoints");
    }
    for (const cp of f.checkpoints as unknown[]) {
      if (typeof cp !== "object" || cp === null) {
        errors.push("checkpoint must be an object");
        continue;
      }
      const c = cp as Record<string, unknown>;
      if (Object.keys(c).sort().join(",") !== "hash,tick") errors.push("checkpoint has unexpected keys");
      if (!isIntInRange(c.tick, 0, totalTicks - 1)) errors.push(`checkpoint tick out of range: ${String(c.tick)}`);
      if (!isHexHash(c.hash)) errors.push("checkpoint hash must be an 8-char hex string");
    }
  }
  if (!Array.isArray(f.commands)) {
    errors.push("commands must be an array");
  } else {
    if (f.commands.length > MAX_COMMANDS) errors.push("too many commands");
    for (let i = 0; i < Math.min(f.commands.length, MAX_COMMANDS); i++) {
      const c = f.commands[i] as unknown;
      if (typeof c !== "object" || c === null) {
        errors.push(`command #${i} must be an object`);
        continue;
      }
      const cmd = c as Record<string, unknown>;
      if (Object.keys(cmd).sort().join(",") !== "action,tick") errors.push(`command #${i} has unexpected keys`);
      if (!isIntInRange(cmd.tick, 0, totalTicks - 1)) {
        errors.push(`command #${i} tick out of range: ${String(cmd.tick)} (totalTicks ${totalTicks})`);
      }
      errors.push(...isValidAction(cmd.action, totalTicks).map((e) => `command #${i}: ${e}`));
    }
  }
  if ("matchStarted" in f && typeof f.matchStarted !== "boolean") {
    errors.push("matchStarted must be a boolean");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, file: data as unknown as ReplayFile };
}

export function checkReplayCompatibility(
  file: ReplayFile,
  runtime: ReplayRuntimeInfo,
): ReplayCompatibilityIssue[] {
  const issues: ReplayCompatibilityIssue[] = [];
  if (file.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    issues.push({
      field: "schemaVersion",
      message: `replay schemaVersion ${file.schemaVersion} != supported ${REPLAY_SCHEMA_VERSION}`,
    });
    return issues;
  }
  for (const k of ["engineVersion", "physicsVersion", "buildId", "wasmHash"] as const) {
    if (file[k] !== runtime[k]) {
      issues.push({
        field: k,
        message: `replay ${k} ${String(file[k])} != runtime ${String(runtime[k])}`,
      });
    }
  }
  if (Math.abs(file.fixedDt - runtime.fixedDt) > 1e-9) {
    issues.push({
      field: "fixedDt",
      message: `replay fixedDt ${file.fixedDt} differs from runtime ${runtime.fixedDt}`,
    });
  }
  const replayKeys = Object.keys(file.configHashes).sort();
  const runtimeKeys = Object.keys(runtime.configHashes).sort();
  if (replayKeys.join(",") !== runtimeKeys.join(",")) {
    issues.push({
      field: "configHashes",
      message: `replay config keys [${replayKeys}] differ from runtime [${runtimeKeys}]`,
    });
  } else {
    for (const key of replayKeys) {
      if (file.configHashes[key] !== runtime.configHashes[key]) {
        issues.push({
          field: `configHashes.${key}`,
          message: `${key} content changed since the replay was recorded`,
        });
      }
    }
  }
  if (file.initialStateHash !== runtime.initialStateHash) {
    issues.push({
      field: "initialStateHash",
      message: "initial state differs — this replay cannot reproduce its match",
    });
  }
  return issues;
}

export function firstDivergentCheckpoint(
  a: ReplayCheckpoint[],
  b: ReplayCheckpoint[],
): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].tick !== b[i].tick || a[i].hash !== b[i].hash) return i;
  }
  return a.length === b.length ? -1 : n;
}
