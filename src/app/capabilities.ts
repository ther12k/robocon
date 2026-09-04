import type { UiSnapshot, SlotId } from "./types";

export type AdmissionCode =
  | "OK"
  | "BOOT_NOT_READY"
  | "NO_ACTIVE_SLOT"
  | "SLOT_NOT_FOUND"
  | "REPLAY_PLAYBACK_ACTIVE"
  | "RECORDING_ACTIVE"
  | "MATCH_IN_PROGRESS"
  | "MATCH_COUNTDOWN"
  | "MATCH_ENDED"
  | "MODULE_NOT_INSTALLED"
  | "AUTONOMY_RUNNING"
  | "NO_REPLAY_LOADED"
  | "REPLAY_INCOMPATIBLE"
  | "ALREADY_RECORDING"
  | "NOT_RECORDING"
  | "PANEL_BLOCKING";

export interface Admission {
  allowed: boolean;
  code: AdmissionCode;
  reason: string;
}

const ALLOWED_ADMISSION: Admission = {
  allowed: true,
  code: "OK",
  reason: "Action admitted",
};

export function canSelectRobot(snap: UiSnapshot, slot: SlotId): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  const exists = snap.robots.some((r) => r.slot === slot);
  if (!exists) {
    return { allowed: false, code: "SLOT_NOT_FOUND", reason: `Robot slot ${slot} does not exist` };
  }
  return ALLOWED_ADMISSION;
}

export function canManualDrive(snap: UiSnapshot, slot: SlotId | null = snap.activeSlot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot drive manually during replay playback" };
  }
  if (slot === null) {
    return { allowed: false, code: "NO_ACTIVE_SLOT", reason: "No robot selected" };
  }
  const robot = snap.robots.find((r) => r.slot === slot);
  if (!robot) {
    return { allowed: false, code: "SLOT_NOT_FOUND", reason: `Robot slot ${slot} not found` };
  }
  if (snap.match.phase === "countdown" || snap.match.phase === "setup") {
    return { allowed: false, code: "MATCH_COUNTDOWN", reason: "Inputs locked during match countdown/setup" };
  }
  if (snap.match.phase === "ended") {
    return { allowed: false, code: "MATCH_ENDED", reason: "Inputs locked after match end" };
  }
  if (robot.autonomyState === "running" || robot.autonomyState === "booting") {
    return { allowed: false, code: "AUTONOMY_RUNNING", reason: "Autonomy script owns this robot slot" };
  }
  return ALLOWED_ADMISSION;
}

export function canGrabToggle(snap: UiSnapshot, slot: SlotId | null = snap.activeSlot): Admission {
  const driveAdmission = canManualDrive(snap, slot);
  if (!driveAdmission.allowed) return driveAdmission;

  const robot = snap.robots.find((r) => r.slot === slot);
  if (!robot?.hasGripper) {
    return { allowed: false, code: "MODULE_NOT_INSTALLED", reason: "Gripper module not installed on this robot" };
  }
  return ALLOWED_ADMISSION;
}

export function canResetSelectedRobot(snap: UiSnapshot, slot: SlotId | null = snap.activeSlot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing" || snap.replay.state === "recording") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot reset robot during active replay or recording" };
  }
  if (snap.match.phase !== "idle") {
    return { allowed: false, code: "MATCH_IN_PROGRESS", reason: "Selected-robot reset is only allowed in idle practice" };
  }
  if (slot === null) {
    return { allowed: false, code: "NO_ACTIVE_SLOT", reason: "No robot selected" };
  }
  const robot = snap.robots.find((r) => r.slot === slot);
  if (robot && (robot.autonomyState === "running" || robot.autonomyState === "booting")) {
    return { allowed: false, code: "AUTONOMY_RUNNING", reason: "Stop autonomy script before resetting robot" };
  }
  return ALLOWED_ADMISSION;
}

export function canStartMatch(snap: UiSnapshot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot start match during replay playback" };
  }
  if (snap.match.phase !== "idle" && snap.match.phase !== "ended") {
    return { allowed: false, code: "MATCH_IN_PROGRESS", reason: "Match already in progress" };
  }
  return ALLOWED_ADMISSION;
}

export function canRecordPractice(snap: UiSnapshot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot record during replay playback" };
  }
  if (snap.replay.state === "recording") {
    return { allowed: false, code: "ALREADY_RECORDING", reason: "Already recording" };
  }
  if (snap.match.phase !== "idle") {
    return { allowed: false, code: "MATCH_IN_PROGRESS", reason: "Practice recording only available in idle practice mode" };
  }
  return ALLOWED_ADMISSION;
}

export function canRecordMatch(snap: UiSnapshot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot record during replay playback" };
  }
  if (snap.replay.state === "recording") {
    return { allowed: false, code: "ALREADY_RECORDING", reason: "Already recording" };
  }
  return ALLOWED_ADMISSION;
}

export function canStopAndExportReplay(snap: UiSnapshot): Admission {
  if (snap.replay.state !== "recording") {
    return { allowed: false, code: "NOT_RECORDING", reason: "No recording in progress" };
  }
  return ALLOWED_ADMISSION;
}

export function canPlayReplay(snap: UiSnapshot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "recording") {
    return { allowed: false, code: "RECORDING_ACTIVE", reason: "Stop recording before playing a replay" };
  }
  if (snap.match.phase !== "idle" && snap.match.phase !== "ended") {
    return { allowed: false, code: "MATCH_IN_PROGRESS", reason: "Cannot start replay while match is active" };
  }
  if (!snap.replay.loadedFileName && snap.replay.state !== "ended" && snap.replay.state !== "loaded") {
    return { allowed: false, code: "NO_REPLAY_LOADED", reason: "No replay file loaded or ready" };
  }
  if (!snap.replay.compatible) {
    return { allowed: false, code: "REPLAY_INCOMPATIBLE", reason: "Loaded replay is incompatible with current arena or build" };
  }
  return ALLOWED_ADMISSION;
}

export function canCopyReplayShareLink(snap: UiSnapshot): Admission {
  if (!snap.replay.shareable) {
    return { allowed: false, code: "NO_REPLAY_LOADED", reason: "No valid shareable replay available" };
  }
  if (snap.replay.state === "recording" || snap.replay.state === "playing") {
    return { allowed: false, code: "RECORDING_ACTIVE", reason: "Wait for replay playback or recording to conclude" };
  }
  return ALLOWED_ADMISSION;
}

export function canRunScript(snap: UiSnapshot, slot: SlotId | null = snap.activeSlot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot run autonomy script during replay playback" };
  }
  if (slot === null) {
    return { allowed: false, code: "NO_ACTIVE_SLOT", reason: "No robot selected" };
  }
  const robot = snap.robots.find((r) => r.slot === slot);
  if (!robot) {
    return { allowed: false, code: "SLOT_NOT_FOUND", reason: `Robot slot ${slot} not found` };
  }
  if (robot.autonomyState === "running" || robot.autonomyState === "booting") {
    return { allowed: false, code: "AUTONOMY_RUNNING", reason: "Autonomy script already running on this slot" };
  }
  return ALLOWED_ADMISSION;
}

export function canApplyRobotSpec(snap: UiSnapshot): Admission {
  if (snap.boot !== "ready") {
    return { allowed: false, code: "BOOT_NOT_READY", reason: "Simulator not ready" };
  }
  if (snap.replay.state === "playing" || snap.replay.state === "recording") {
    return { allowed: false, code: "REPLAY_PLAYBACK_ACTIVE", reason: "Cannot modify robot specifications during replay or recording" };
  }
  if (snap.match.phase !== "idle") {
    return { allowed: false, code: "MATCH_IN_PROGRESS", reason: "Robot specs can only be applied in idle practice mode" };
  }
  return ALLOWED_ADMISSION;
}
