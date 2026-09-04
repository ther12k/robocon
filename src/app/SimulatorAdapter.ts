import { SimulationCore } from "../core/SimulationCore";
import { MatchController } from "../core/match";
import { AutonomyManager } from "../core/autonomy";
import { CameraRig } from "../sim/CameraRig";
import { yawFromQuaternion } from "../sim/orientation";
import type { ReplayFile } from "../core/replayFile";
import type {
  ActivePanel,
  ArenaView,
  Availability,
  CameraView,
  MatchView,
  ReplayView,
  RobotCardModel,
  RobotTelemetry,
  SlotId,
  UiSnapshot,
} from "./types";

export interface SimulatorAdapterOptions {
  core: SimulationCore;
  match: MatchController;
  autonomy: AutonomyManager;
  cameraRig?: CameraRig;
}

export class SimulatorAdapter {
  readonly core: SimulationCore;
  readonly match: MatchController;
  readonly autonomy: AutonomyManager;
  private cameraRig?: CameraRig;

  private activeSlot: SlotId | null = null;
  private activePanel: ActivePanel = "none";
  private throttlePercent = 50;
  private precisionMode = false;
  private isMeasuring = false;

  private speedHistory: number[] = [];
  private lastSpeedSampleTime = 0;
  private speedSampleSlot: SlotId | null = null;

  private loadedReplayFile: ReplayFile | null = null;
  private loadedReplayFileName: string | null = null;
  private replayRecordingKind: "practice" | "match" | null = null;
  private replayShareUrl: string | null = null;

  constructor(opts: SimulatorAdapterOptions) {
    this.core = opts.core;
    this.match = opts.match;
    this.autonomy = opts.autonomy;
    this.cameraRig = opts.cameraRig;

    const slots = this.core.activeSlots();
    if (slots.length > 0) {
      this.activeSlot = slots[0];
    }
  }

  setCameraRig(cameraRig: CameraRig): void {
    this.cameraRig = cameraRig;
  }

  setActiveSlot(slot: SlotId | null): void {
    if (this.activeSlot !== slot) {
      this.activeSlot = slot;
      this.speedHistory = [];
      this.speedSampleSlot = slot;
    }
  }

  getActiveSlot(): SlotId | null {
    return this.activeSlot;
  }

  setActivePanel(panel: ActivePanel): void {
    this.activePanel = panel;
  }

  setThrottle(percent: number): void {
    this.throttlePercent = Math.max(0, Math.min(100, Math.round(percent)));
  }

  setPrecisionMode(enabled: boolean): void {
    this.precisionMode = enabled;
  }

  setMeasuring(measuring: boolean): void {
    this.isMeasuring = measuring;
  }

  setLoadedReplay(file: ReplayFile | null, fileName: string | null = null): void {
    this.loadedReplayFile = file;
    this.loadedReplayFileName = fileName;
  }

  getLoadedReplay(): ReplayFile | null {
    return this.loadedReplayFile;
  }

  setRecordingKind(kind: "practice" | "match" | null): void {
    this.replayRecordingKind = kind;
  }

  setReplayShareUrl(url: string | null): void {
    this.replayShareUrl = url;
  }

  sampleSpeed(timestampMs: number): void {
    if (timestampMs - this.lastSpeedSampleTime < 100) {
      return; // Cap at 10 Hz
    }
    this.lastSpeedSampleTime = timestampMs;

    if (this.activeSlot === null || this.speedSampleSlot !== this.activeSlot) {
      this.speedHistory = [];
      this.speedSampleSlot = this.activeSlot;
      if (this.activeSlot === null) return;
    }

    const body = this.core.getBody(this.activeSlot);
    if (!body) {
      this.speedHistory.push(0);
    } else {
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.z);
      this.speedHistory.push(Math.round(speed * 100) / 100);
    }

    if (this.speedHistory.length > 120) {
      this.speedHistory.shift();
    }
  }

  buildSnapshot(): UiSnapshot {
    const slots = this.core.activeSlots();
    const sessionId = this.core.currentSessionId;

    // Robots list
    const robots: RobotCardModel[] = slots.map((slot) => {
      const spec = this.core.getSpec(slot);
      const gripper = this.core.getGripper(slot);
      const autonomyState = this.autonomy.status(slot);
      const body = this.core.getBody(slot);
      let isDriving = false;
      if (body) {
        const vel = body.linvel();
        isDriving = Math.hypot(vel.x, vel.z) > 0.02 || Math.abs(body.angvel().y) > 0.05;
      }

      return {
        slot,
        name: spec?.name ?? `Robot ${slot}`,
        role: spec?.role ?? "Runner",
        team: spec?.team ?? (slot % 2 === 0 ? "blue" : "red"),
        driveType: spec?.chassis.drive ?? "differential",
        isDriving,
        autonomyState: autonomyState.status,
        hasGripper: gripper !== null,
        isHolding: gripper ? gripper.isHolding : false,
      };
    });

    // Telemetry projection
    let telemetry: Availability<RobotTelemetry>;
    if (this.activeSlot === null || !this.core.hasSlot(this.activeSlot)) {
      telemetry = {
        status: "unavailable",
        reason: "No robot selected",
      };
    } else {
      const slot = this.activeSlot;
      const spec = this.core.getSpec(slot);
      const body = this.core.getBody(slot);
      const gripper = this.core.getGripper(slot);

      if (!body || !spec) {
        telemetry = {
          status: "unavailable",
          reason: "Robot body not initialized",
        };
      } else {
        const p = body.translation();
        const r = body.rotation();
        const v = body.linvel();
        const angvel = body.angvel();
        const yawRad = yawFromQuaternion(r);
        const headingDeg = Math.round(((yawRad * 180) / Math.PI) * 10) / 10;
        const speed = Math.round(Math.hypot(v.x, v.z) * 100) / 100;
        const yawRate = Math.round(angvel.y * 100) / 100;

        let gripperStatus: "empty" | "holding" | "not_installed" = "not_installed";
        let heldObjectId: string | null = null;
        if (gripper) {
          gripperStatus = gripper.isHolding ? "holding" : "empty";
          heldObjectId = gripper.heldId;
        }

        telemetry = {
          status: "available",
          value: {
            slot,
            name: spec.name,
            role: spec.role ?? "Runner",
            team: spec.team,
            driveType: spec.chassis.drive ?? "differential",
            posX: Math.round(p.x * 100) / 100,
            posZ: Math.round(p.z * 100) / 100,
            posY: Math.round(p.y * 100) / 100,
            headingDeg,
            speed,
            yawRate,
            gripper: gripperStatus,
            heldObjectId,
          },
        };
      }
    }

    // Match projection
    const matchScores = this.match.score;
    const recentEvents = this.match.entries.slice(-100).map((e) => ({
      tick: e.tick,
      timeSec: Math.round(e.timeSec * 10) / 10,
      kind: e.kind,
      team: e.team,
      points: e.points,
      message: e.message,
    }));

    const matchView: MatchView = {
      phase: this.match.phase,
      timeRemainingSec: Math.max(0, Math.ceil(this.match.timeRemainingSec)),
      scoreRed: matchScores.red,
      scoreBlue: matchScores.blue,
      retriesRed: this.match.maxRetriesPerTeam, // baseline fallback
      retriesBlue: this.match.maxRetriesPerTeam,
      maxRetries: this.match.maxRetriesPerTeam,
      winnerTeam: this.match.winner,
      recentEvents,
    };

    // Replay projection
    const isPlaying = this.core.isReplayPlaybackActive();
    const isRecording = this.core.bus.isRecording();
    const wasCompleted = this.core.wasReplayPlaybackCompleted();
    const replayError = this.core.replayPlaybackError;

    let replayState: ReplayView["state"] = "idle";
    if (replayError) replayState = "error";
    else if (isPlaying) replayState = "playing";
    else if (isRecording) replayState = "recording";
    else if (wasCompleted) replayState = "ended";
    else if (this.loadedReplayFile) replayState = "loaded";

    const currentTick = this.core.tickCount();
    const totalTicks = this.loadedReplayFile?.totalTicks ?? (isRecording ? currentTick : 0);
    const progress = totalTicks > 0 ? Math.min(1, Math.max(0, currentTick / totalTicks)) : 0;
    const durationSec = totalTicks * this.core.physics.fixedDt;

    const replayView: ReplayView = {
      state: replayState,
      recordingType: this.replayRecordingKind,
      loadedFileName: this.loadedReplayFileName,
      durationSec: Math.round(durationSec * 10) / 10,
      totalTicks,
      currentTick,
      progress: Math.round(progress * 1000) / 1000,
      compatible: this.loadedReplayFile ? this.core.validateReplay(this.loadedReplayFile).length === 0 : true,
      shareable: Boolean(this.loadedReplayFile || wasCompleted),
      shareUrl: this.replayShareUrl,
      lastVerification: {
        verified: wasCompleted && !replayError && this.core.replayDesync === null,
        desyncTick: this.core.replayDesync,
        error: replayError,
      },
    };

    // Arena projection
    const arenaView: ArenaView = {
      name: this.core.arena.meta?.name ?? "Arena",
      provenance: "inferred",
      note: "Field geometry and dimensions are inferred from competition rules.",
    };

    // Camera projection
    const cameraView: CameraView = {
      view: this.cameraRig?.isTopView() ? "top" : "perspective",
      following: this.cameraRig?.isFollowing() ? this.activeSlot : null,
      measuring: this.isMeasuring,
    };

    return {
      sessionId,
      boot: "ready",
      activeSlot: this.activeSlot,
      robots,
      telemetry,
      match: matchView,
      replay: replayView,
      arena: arenaView,
      camera: cameraView,
      activePanel: this.activePanel,
      throttlePercent: this.throttlePercent,
      precisionMode: this.precisionMode,
      speedHistory: [...this.speedHistory],
    };
  }
}
