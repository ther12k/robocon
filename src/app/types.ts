export type SlotId = number;

export type Availability<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: string };

export interface RobotTelemetry {
  slot: SlotId;
  name: string;
  role: string;
  team: string;
  driveType: string;
  posX: number;
  posZ: number;
  posY: number;
  headingDeg: number;
  speed: number;
  yawRate: number;
  gripper: "empty" | "holding" | "not_installed";
  heldObjectId: string | null;
}

export interface RobotCardModel {
  slot: SlotId;
  name: string;
  role: string;
  team: "red" | "blue" | string;
  driveType: string;
  isDriving: boolean;
  autonomyState: string;
  hasGripper: boolean;
  isHolding: boolean;
}

export interface MatchScoreEntry {
  tick: number;
  timeSec: number;
  kind: string;
  team?: string;
  points?: number;
  message: string;
}

export interface MatchView {
  phase: "idle" | "setup" | "countdown" | "playing" | "ended";
  timeRemainingSec: number;
  scoreRed: number;
  scoreBlue: number;
  retriesRed: number;
  retriesBlue: number;
  maxRetries: number;
  winnerTeam: string | null;
  recentEvents: readonly MatchScoreEntry[];
}

export interface ReplayVerificationInfo {
  verified: boolean;
  desyncTick: number | null;
  error: string | null;
}

export interface ReplayView {
  state: "idle" | "recording" | "loaded" | "playing" | "ended" | "error";
  recordingType: "practice" | "match" | null;
  loadedFileName: string | null;
  durationSec: number;
  totalTicks: number;
  currentTick: number;
  progress: number; // 0..1
  compatible: boolean;
  compatibilityDetails?: string;
  shareable: boolean;
  shareUrl: string | null;
  lastVerification?: ReplayVerificationInfo;
}

export interface ArenaView {
  name: string;
  provenance: "official" | "draft" | "inferred" | "unknown";
  note: string;
}

export interface CameraView {
  view: "top" | "perspective";
  following: SlotId | null;
  measuring: boolean;
}

export type ActivePanel =
  | "none"
  | "builder"
  | "script"
  | "replay-detail"
  | "preferences"
  | "inspector";

export interface UiSnapshot {
  sessionId: number;
  boot: "loading" | "ready" | "failed";
  activeSlot: SlotId | null;
  robots: readonly RobotCardModel[];
  telemetry: Availability<RobotTelemetry>;
  match: MatchView;
  replay: ReplayView;
  arena: ArenaView;
  camera: CameraView;
  activePanel: ActivePanel;
  throttlePercent: number;
  precisionMode: boolean;
  speedHistory: readonly number[];
}

export type CommandResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface UiPreferencesV1 {
  version: 1;
  manualThrottlePercent: number; // clamp integer 0..100
  precision: boolean;
  hintsVisible: boolean;
  preferredView: "top" | "perspective";
  reduceUiMotion: boolean;
  localDisplayName?: string; // max 40 characters
}

export const DEFAULT_UI_PREFERENCES: UiPreferencesV1 = {
  version: 1,
  manualThrottlePercent: 50,
  precision: false,
  hintsVisible: true,
  preferredView: "perspective",
  reduceUiMotion: false,
  localDisplayName: "Local Operator",
};
