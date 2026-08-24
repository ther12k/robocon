import type { DriveCommand } from "../sim/types";
import type { SimulationCore } from "./SimulationCore";
import { buildSenseFrame, type SensorFrame, type SensorOptions } from "./sensors";

export interface WorkerIn {
  type: "init" | "tick";
  code?: string;
  slot?: number;
  sense?: SensorFrame;
}

export type WorkerOut =
  | { type: "ready" }
  | { type: "heartbeat"; tick: number }
  | { type: "axes"; slot: number; payload: DriveCommand }
  | { type: "grabToggle"; slot: number }
  | { type: "release"; slot: number }
  | { type: "log"; message: string }
  | { type: "error"; message: string };

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
const MAX_MESSAGES_PER_TICK = 24;

export class AutonomyManager {
  private core: SimulationCore;
  private factory: HostFactory;
  private hosts = new Map<number, ScriptHost>();
  private states = new Map<number, AutonomyState>();
  private lastSeen = new Map<number, number>();
  private msgCount = new Map<number, number>();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private sensorOpts: SensorOptions;

  constructor(core: SimulationCore, factory: HostFactory, sensorOpts: SensorOptions = {}) {
    this.core = core;
    this.factory = factory;
    this.sensorOpts = sensorOpts;
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
    let host: ScriptHost;
    try {
      host = this.factory(code);
    } catch (err) {
      this.states.set(slot, { status: "error", detail: String(err) });
      return;
    }
    this.hosts.set(slot, host);
    this.lastSeen.set(slot, Date.now());
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
    this.lastSeen.delete(slot);
    this.msgCount.delete(slot);
  }

  dispose(): void {
    for (const slot of [...this.hosts.keys()]) this.detach(slot);
    if (this.watchdogTimer !== null) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private handleMessage(slot: number, msg: WorkerOut): void {
    this.lastSeen.set(slot, Date.now());
    const count = (this.msgCount.get(slot) ?? 0) + 1;
    this.msgCount.set(slot, count);
    if (count > MAX_MESSAGES_PER_TICK) {
      this.kill(slot, "command spam limit exceeded");
      return;
    }
    switch (msg.type) {
      case "ready":
        if (this.states.get(slot)?.status === "booting") {
          this.states.set(slot, { status: "running", detail: "" });
        }
        break;
      case "heartbeat":
        break;
      case "axes":
        this.core.setAxesFromInput(msg.slot, msg.payload);
        break;
      case "grabToggle":
        this.core.enqueueGrabToggle(msg.slot);
        break;
      case "release":
        this.core.injectCommand({ kind: "release", slot: msg.slot });
        break;
      case "log":
        this.states.set(slot, { status: this.states.get(slot)?.status ?? "running", detail: msg.message.slice(0, 200) });
        break;
      case "error":
        this.kill(slot, msg.message.slice(0, 300));
        break;
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
    this.lastSeen.delete(slot);
    this.msgCount.delete(slot);
  }

  private checkStalls(): void {
    const now = Date.now();
    for (const [slot] of this.hosts) {
      const seen = this.lastSeen.get(slot) ?? 0;
      if (now - seen > STALL_LIMIT_MS) {
        this.kill(slot, `no response for ${STALL_LIMIT_MS}ms — terminated by watchdog`);
      }
    }
  }

  private pump(): void {
    this.msgCount.clear();
    for (const [slot, host] of this.hosts) {
      const frame = buildSenseFrame(this.core, slot, this.sensorOpts);
      if (!frame) continue;
      host.post({ type: "tick", sense: frame, slot });
    }
  }
}
