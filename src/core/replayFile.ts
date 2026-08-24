import type { RecordedCommand } from "./CommandBus";

export const REPLAY_SCHEMA_VERSION = 1;

export interface ReplayCheckpoint {
  tick: number;
  hash: string;
}

export interface ReplayFile {
  schemaVersion: 1;
  engineVersion: string;
  physicsVersion: string;
  fixedDt: number;
  configHashes: Record<string, string>;
  initialStateHash: string;
  checkpointIntervalTicks: number;
  checkpoints: ReplayCheckpoint[];
  totalTicks: number;
  finalStateHash: string;
  commands: RecordedCommand[];
}

export interface ReplayRuntimeInfo {
  engineVersion: string;
  physicsVersion: string;
  fixedDt: number;
  configHashes: Record<string, string>;
  initialStateHash: string;
}

export interface ReplayCompatibilityIssue {
  field: string;
  message: string;
}

export function checkReplayCompatibility(
  file: ReplayFile,
  runtime: ReplayRuntimeInfo,
): ReplayCompatibilityIssue[] {
  const issues: ReplayCompatibilityIssue[] = [];
  if (file.schemaVersion > REPLAY_SCHEMA_VERSION) {
    issues.push({
      field: "schemaVersion",
      message: `replay schemaVersion ${file.schemaVersion} is newer than supported ${REPLAY_SCHEMA_VERSION}`,
    });
    return issues;
  }
  if (file.engineVersion !== runtime.engineVersion) {
    issues.push({
      field: "engineVersion",
      message: `replay was recorded on engine ${file.engineVersion}, running ${runtime.engineVersion}`,
    });
  }
  if (file.physicsVersion !== runtime.physicsVersion) {
    issues.push({
      field: "physicsVersion",
      message: `replay was recorded on Rapier ${file.physicsVersion}, running ${runtime.physicsVersion}`,
    });
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
