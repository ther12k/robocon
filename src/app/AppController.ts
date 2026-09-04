import type { SimulationCore } from "../core/SimulationCore";
import type { MatchController } from "../core/match";
import type { AutonomyManager } from "../core/autonomy";
import type { CameraRig } from "../sim/CameraRig";
import type { SimulatorAdapter } from "./SimulatorAdapter";
import type { UiStore } from "./UiStore";
import type { ActivePanel, CommandResult, SlotId } from "./types";
import { parseReplayFile } from "../core/replayFile";
import { buildReplayShareUrl } from "../core/replayShare";
import {
  canCopyReplayShareLink,
  canGrabToggle,
  canManualDrive,
  canPlayReplay,
  canRecordMatch,
  canRecordPractice,
  canResetSelectedRobot,
  canRunScript,
  canSelectRobot,
  canStartMatch,
  canStopAndExportReplay,
} from "./capabilities";

export interface AppControllerOptions {
  core: SimulationCore;
  match: MatchController;
  autonomy: AutonomyManager;
  adapter: SimulatorAdapter;
  store: UiStore;
  cameraRig?: CameraRig;
}

export class AppController {
  readonly core: SimulationCore;
  readonly match: MatchController;
  readonly autonomy: AutonomyManager;
  readonly adapter: SimulatorAdapter;
  readonly store: UiStore;
  private cameraRig?: CameraRig;

  constructor(opts: AppControllerOptions) {
    this.core = opts.core;
    this.match = opts.match;
    this.autonomy = opts.autonomy;
    this.adapter = opts.adapter;
    this.store = opts.store;
    this.cameraRig = opts.cameraRig;
  }

  setCameraRig(cameraRig: CameraRig): void {
    this.cameraRig = cameraRig;
    this.adapter.setCameraRig(cameraRig);
  }

  private refreshSnapshot(): void {
    this.store.set(this.adapter.buildSnapshot());
  }

  selectRobot(slot: SlotId): CommandResult {
    const admission = canSelectRobot(this.store.snapshot, slot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    this.adapter.setActiveSlot(slot);
    this.refreshSnapshot();
    return { ok: true };
  }

  submitManualAxes(
    slot: SlotId = this.store.snapshot.activeSlot ?? 0,
    axes: { fwd: number; strafe: number; turn: number },
  ): CommandResult {
    const admission = canManualDrive(this.store.snapshot, slot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }

    const snap = this.store.snapshot;
    let throttleScale = snap.throttlePercent / 100;
    if (snap.precisionMode) {
      throttleScale *= 0.4;
    }

    const clampedFwd = Math.max(-1, Math.min(1, axes.fwd)) * throttleScale;
    const clampedStrafe = Math.max(-1, Math.min(1, axes.strafe)) * throttleScale;
    const clampedTurn = Math.max(-1, Math.min(1, axes.turn)) * throttleScale;

    this.core.setAxesFromInput(slot, {
      fwd: clampedFwd,
      strafe: clampedStrafe,
      turn: clampedTurn,
    });
    return { ok: true };
  }

  stopDriving(slot: SlotId = this.store.snapshot.activeSlot ?? 0): CommandResult {
    this.core.setAxesFromInput(slot, { fwd: 0, strafe: 0, turn: 0 });
    return { ok: true };
  }

  requestGrabOrRelease(slot: SlotId = this.store.snapshot.activeSlot ?? 0): CommandResult {
    const admission = canGrabToggle(this.store.snapshot, slot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    this.core.enqueueGrabToggle(slot);
    return { ok: true };
  }

  resetSelectedRobot(slot: SlotId = this.store.snapshot.activeSlot ?? 0): CommandResult {
    const admission = canResetSelectedRobot(this.store.snapshot, slot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    const ok = this.core.respawnRobot(slot);
    if (!ok) {
      return { ok: false, code: "SLOT_NOT_FOUND", message: `Slot ${slot} not found` };
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  setCameraView(view: "top" | "perspective"): CommandResult {
    if (this.cameraRig) {
      this.cameraRig.setTopView(view === "top");
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  toggleTopView(): CommandResult {
    if (this.cameraRig) {
      this.cameraRig.toggleTopView();
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  setFollow(slot: SlotId | null): CommandResult {
    if (this.cameraRig) {
      this.cameraRig.setFollow(slot !== null ? `robot-${slot}` : null);
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  resetCamera(): CommandResult {
    if (this.cameraRig) {
      this.cameraRig.reset();
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  startMatch(): CommandResult {
    const admission = canStartMatch(this.store.snapshot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    this.match.startMatch();
    this.refreshSnapshot();
    return { ok: true };
  }

  startRecording(kind: "practice" | "match"): CommandResult {
    const admission = kind === "practice"
      ? canRecordPractice(this.store.snapshot)
      : canRecordMatch(this.store.snapshot);

    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }

    if (kind === "match") {
      this.core.beginReplayCapture(60);
      this.match.startMatch();
    } else {
      this.core.respawnRobots();
      this.core.beginReplayCapture(60);
    }
    this.adapter.setRecordingKind(kind);
    this.refreshSnapshot();
    return { ok: true };
  }

  stopAndExport(): { ok: boolean; data?: string; error?: string } {
    const admission = canStopAndExportReplay(this.store.snapshot);
    if (!admission.allowed) {
      return { ok: false, error: admission.reason };
    }

    const wasMatch = this.store.snapshot.replay.recordingType === "match";
    const file = this.core.endReplayCapture({ matchStarted: wasMatch });
    this.adapter.setRecordingKind(null);
    this.adapter.setLoadedReplay(file, "recording.json");
    this.refreshSnapshot();

    const json = JSON.stringify(file, null, 2);
    return { ok: true, data: json };
  }

  loadReplayText(content: string, fileName = "loaded-replay.json"): CommandResult {
    const parsed = parseReplayFile(content);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "INVALID_REPLAY_JSON",
        message: parsed.errors.join("; "),
      };
    }
    const issues = this.core.validateReplay(parsed.file);
    this.adapter.setLoadedReplay(parsed.file, fileName);
    this.refreshSnapshot();

    if (issues.length > 0) {
      return {
        ok: false,
        code: "REPLAY_INCOMPATIBLE",
        message: issues.map((i) => `${i.field}: ${i.message}`).join("; "),
      };
    }
    return { ok: true };
  }

  playReplay(): CommandResult {
    const admission = canPlayReplay(this.store.snapshot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    const replayFile = this.adapter.getLoadedReplay();
    if (!replayFile) {
      return { ok: false, code: "NO_REPLAY_LOADED", message: "No replay file loaded" };
    }
    const issues = this.core.startReplayPlayback(replayFile);
    if (issues.length > 0) {
      return {
        ok: false,
        code: "REPLAY_INCOMPATIBLE",
        message: issues.map((i) => `${i.field}: ${i.message}`).join("; "),
      };
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  stopReplay(): CommandResult {
    if (this.core.isReplayPlaybackActive()) {
      this.core.stopReplayPlayback();
    }
    this.refreshSnapshot();
    return { ok: true };
  }

  async copyReplayLink(originPath = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "http://localhost/"): Promise<CommandResult> {
    const admission = canCopyReplayShareLink(this.store.snapshot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    const replayFile = this.adapter.getLoadedReplay();
    if (!replayFile) {
      return { ok: false, code: "NO_REPLAY_LOADED", message: "No replay file loaded" };
    }
    try {
      const url = await buildReplayShareUrl(replayFile, originPath);
      this.adapter.setReplayShareUrl(url);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      this.refreshSnapshot();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: "SHARE_URL_FAILED",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  runScript(slot: SlotId, code: string): CommandResult {
    const admission = canRunScript(this.store.snapshot, slot);
    if (!admission.allowed) {
      return { ok: false, code: admission.code, message: admission.reason };
    }
    try {
      this.autonomy.attach(slot, code);
      this.refreshSnapshot();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: "SCRIPT_ATTACH_FAILED",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  stopScript(slot: SlotId): CommandResult {
    this.autonomy.detach(slot);
    this.refreshSnapshot();
    return { ok: true };
  }

  setThrottle(percent: number): void {
    this.adapter.setThrottle(percent);
    this.refreshSnapshot();
  }

  setPrecisionMode(enabled: boolean): void {
    this.adapter.setPrecisionMode(enabled);
    this.refreshSnapshot();
  }

  setActivePanel(panel: ActivePanel): void {
    this.adapter.setActivePanel(panel);
    this.refreshSnapshot();
  }
}
