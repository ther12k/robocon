import type { DriveCommand } from "../sim/types";
import type { SimulationCore } from "./SimulationCore";
import { buildSenseFrame, type SensorFrame, type SensorOptions } from "./sensors";

export interface WorkerIn {
  type: "init" | "tick";
  code?: string;
  slot?: number;
  /** Monotonic id matching the outstanding tick this frame belongs to. */
  id?: number;
  sense?: SensorFrame;
}

export type WorkerOut =
  | { type: "ready" }
  | { type: "axes"; id: number; payload: DriveCommand }
  | { type: "grabToggle"; id: number }
  | { type: "release"; id: number }
  | { type: "log"; id: number; message: string }
  | { type: "error"; id: number; message: string }
  | { type: "done"; id: number };

export interface ScriptHost {
  post(msg: WorkerIn): void;
  terminate(): void;
  onMessage(handler: (msg: WorkerOut) => void): void;
}

export type HostFactory = (code: string) => ScriptHost;

export type AutonomyStatus = "detached" | "booting" | "running" | "killed" | "error";

export interface AutonomyState {
  status: AutonomyStatus;
  detail: string;
}

const STALL_LIMIT_MS = 750;
const WATCHDOG_INTERVAL_MS = 120;
const MAX_COMMANDS_PER_TICK = 24;

function clampAxis(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function isFiniteAxes(payload: unknown): payload is DriveCommand {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length !== 3 || !keys.every((k) => k === "fwd" || k === "strafe" || k === "turn")) {
    return false;
  }
  return (
    typeof p.fwd === "number" && Number.isFinite(p.fwd) &&
    typeof p.strafe === "number" && Number.isFinite(p.strafe) &&
    typeof p.turn === "number" && Number.isFinite(p.turn)
  );
}

export class AutonomyManager {
  private core: SimulationCore;
  private factory: HostFactory;
  private hosts = new Map<number, ScriptHost>();
  private states = new Map<number, AutonomyState>();
  private msgCount = new Map<number, number>();
  private awaitingTick = new Map<number, boolean>();
  private tickSeq = 0;
  private lastSentTickId = new Map<number, number>();
  /** Watchdog deadlines: boot phase after attach, or an outstanding tick. */
  private deadlines = new Map<number, { kind: "boot" | "tick"; id?: number; expires: number }>();
  private watchdogPaused = false;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private sensorOpts: SensorOptions;
  private lastSessionId = 0;

  constructor(core: SimulationCore, factory: HostFactory, sensorOpts: SensorOptions = {}) {
    this.core = core;
    this.factory = factory;
    this.sensorOpts = sensorOpts;
    this.lastSessionId = this.core.currentSessionId;
    this.core.addPostStepListener(() => this.pump());
    if (typeof setInterval !== "undefined") {
      this.watchdogTimer = setInterval(() => this.checkStalls(), WATCHDOG_INTERVAL_MS);
    }
  }

  status(slot: number): AutonomyState {
    return this.states.get(slot) ?? { status: "detached", detail: "" };
  }

  attach(slot: number, code: string): void {
    this.detach(slot);
    const state: AutonomyState = { status: "booting", detail: "compiling" };
    this.states.set(slot, state);
    this.deadlines.set(slot, { kind: "boot", expires: Date.now() + STALL_LIMIT_MS });
    let host: ScriptHost;
    try {
      host = this.factory(code);
    } catch (err) {
      this.states.set(slot, { status: "error", detail: String(err) });
      return;
    }
    this.hosts.set(slot, host);
    this.msgCount.set(slot, 0);
    host.onMessage((msg) => this.handleMessage(slot, msg));
    host.post({ type: "init", code, slot });
  }

  detach(slot: number): void {
    const host = this.hosts.get(slot);
    if (host) {
      host.terminate();
      this.hosts.delete(slot);
    }
    if (this.states.get(slot)?.status !== "error") {
      this.states.set(slot, { status: "detached", detail: "" });
    }
    this.msgCount.delete(slot);
    this.awaitingTick.delete(slot);
    this.deadlines.delete(slot);
  }

  dispose(): void {
    for (const slot of [...this.hosts.keys()]) this.detach(slot);
    if (this.watchdogTimer !== null) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private handleMessage(boundSlot: number, msg: unknown): void {
    if (this.core.currentSessionId !== this.lastSessionId) {
      return;
    }
    if (typeof msg !== "object" || msg === null || typeof (msg as { type?: unknown }).type !== "string") {
      this.kill(boundSlot, "protocol violation: malformed message");
      return;
    }
    const m = msg as WorkerOut;
    // Every post-ready message must carry the id of the outstanding tick.
    if (m.type !== "ready") {
      if (m.id !== this.lastSentTickId.get(boundSlot)) {
        this.kill(boundSlot, "protocol violation: stale or unknown tick id");
        return;
      }
      if (this.awaitingTick.get(boundSlot) !== true && m.type !== "log") {
        // log is allowed while idle (script may emit during gaps), but
        // commands and done require an outstanding tick.
        if (m.type !== "error") {
          this.kill(boundSlot, "protocol violation: message without outstanding tick");
          return;
        }
      }
    }
    switch (m.type) {
      case "ready":
        if (this.deadlines.get(boundSlot)?.kind === "boot") this.deadlines.delete(boundSlot);
        if (this.states.get(boundSlot)?.status === "booting") {
          this.states.set(boundSlot, { status: "running", detail: "" });
        }
        break;
      case "done":
        this.awaitingTick.delete(boundSlot);
        this.deadlines.delete(boundSlot);
        break;
      case "axes": {
        const c1 = (this.msgCount.get(boundSlot) ?? 0) + 1;
        this.msgCount.set(boundSlot, c1);
        if (c1 > MAX_COMMANDS_PER_TICK) {
          this.kill(boundSlot, `command spam limit exceeded (${MAX_COMMANDS_PER_TICK} commands per tick)`);
          return;
        }
        const payload = (m as { payload?: unknown }).payload;
        if (!isFiniteAxes(payload)) {
          this.kill(boundSlot, "protocol violation: invalid axes payload");
          return;
        }
        const p = payload as DriveCommand;
        this.core.setAxesFromInput(boundSlot, {
          fwd: clampAxis(p.fwd),
          strafe: clampAxis(p.strafe),
          turn: clampAxis(p.turn),
        });
        break;
      }
      case "grabToggle": {
        const c2 = (this.msgCount.get(boundSlot) ?? 0) + 1;
        this.msgCount.set(boundSlot, c2);
        if (c2 > MAX_COMMANDS_PER_TICK) {
          this.kill(boundSlot, `command spam limit exceeded (${MAX_COMMANDS_PER_TICK} commands per tick)`);
          return;
        }
        this.core.enqueueGrabToggle(boundSlot);
        break;
      }
      case "release": {
        const c3 = (this.msgCount.get(boundSlot) ?? 0) + 1;
        this.msgCount.set(boundSlot, c3);
        if (c3 > MAX_COMMANDS_PER_TICK) {
          this.kill(boundSlot, `command spam limit exceeded (${MAX_COMMANDS_PER_TICK} commands per tick)`);
          return;
        }
        this.core.injectCommand({ kind: "release", slot: boundSlot });
        break;
      }
      case "log":
        this.states.set(boundSlot, {
          status: this.states.get(boundSlot)?.status ?? "running",
          detail: String((m as { message?: unknown }).message ?? "").slice(0, 200),
        });
        break;
      case "error":
        this.kill(boundSlot, String((m as { message?: unknown }).message ?? "").slice(0, 300));
        break;
      default:
        this.kill(boundSlot, `protocol violation: unknown message type`);
    }
  }

  resetTickCounter(): void {
    this.msgCount.clear();
  }

  private kill(slot: number, reason: string): void {
    const host = this.hosts.get(slot);
    host?.terminate();
    this.hosts.delete(slot);
    this.states.set(slot, { status: "killed", detail: reason });
    this.msgCount.delete(slot);
    this.awaitingTick.delete(slot);
    this.lastSentTickId.delete(slot);
    this.deadlines.delete(slot);
  }

  suspendWatchdog(): void {
    this.watchdogPaused = true;
  }

  resumeWatchdog(): void {
    this.watchdogPaused = false;
    const now = Date.now();
    for (const [slot, d] of this.deadlines) {
      this.deadlines.set(slot, { ...d, expires: now + STALL_LIMIT_MS });
    }
  }

  private checkStalls(): void {
    if (this.watchdogPaused) return;
    const now = Date.now();
    for (const [slot, deadline] of this.deadlines) {
      if (!this.hosts.has(slot)) continue;
      if (now > deadline.expires) {
        this.kill(
          slot,
          deadline.kind === "boot"
            ? `script did not become ready within ${STALL_LIMIT_MS}ms — terminated by watchdog`
            : `no done within ${STALL_LIMIT_MS}ms — terminated by watchdog`,
        );
      }
    }
  }

  private pump(): void {
    if (this.core.currentSessionId !== this.lastSessionId) {
      this.lastSessionId = this.core.currentSessionId;
      this.awaitingTick.clear();
      this.lastSentTickId.clear();
      this.deadlines.clear();
      this.msgCount.clear();
    }
    for (const [slot, host] of this.hosts) {
      // One-in-flight backpressure: never queue a new tick while the previous
      // one is still being processed. The latest sensor frame is coalesced —
      // the next pump sends the freshest state once `done` arrives.
      if (this.awaitingTick.get(slot) === true) continue;
      const frame = buildSenseFrame(this.core, slot, this.sensorOpts);
      if (!frame) continue;
      const id = ++this.tickSeq;
      this.lastSentTickId.set(slot, id);
      this.msgCount.delete(slot); // fresh command budget per outstanding tick
      this.awaitingTick.set(slot, true);
      host.post({ type: "tick", sense: frame, slot, id });
      this.deadlines.set(slot, { kind: "tick", id, expires: Date.now() + STALL_LIMIT_MS });
    }
  }
}
