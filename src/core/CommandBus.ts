import type { DriveCommand } from "../sim/types";

export type CommandAction =
  | { kind: "axes"; slot: number; payload: DriveCommand }
  | { kind: "grabToggle"; slot: number }
  | { kind: "release"; slot: number };

export interface RecordedCommand {
  tick: number;
  action: CommandAction;
}

type Handler = (action: CommandAction, tick: number) => boolean | void;

export class CommandBus {
  private queue: RecordedCommand[] = [];
  private history: RecordedCommand[] | null = null;
  private handler: Handler | null = null;
  private currentTick = 0;

  setHandler(handler: Handler): void {
    this.handler = handler;
  }

  enqueue(action: CommandAction, opts: { dedupeKey?: string; tick?: number } = {}): void {
    if (opts.dedupeKey && this.isDuplicateAxes(action, opts.dedupeKey)) return;
    const entry: RecordedCommand = { tick: opts.tick ?? this.currentTick, action };
    if (this.history) this.history.push(entry);
    this.queue.push(entry);
  }

  private lastDeliveredAxes = new Map<number, DriveCommand>();

  private isDuplicateAxes(action: CommandAction, key: string): boolean {
    void key;
    if (action.kind !== "axes") return false;
    const last = this.lastDeliveredAxes.get(action.slot);
    if (
      last &&
      last.fwd === action.payload.fwd &&
      last.strafe === action.payload.strafe &&
      last.turn === action.payload.turn
    ) {
      return true;
    }
    return false;
  }

  drain(): void {
    const pending = this.queue;
    this.queue = [];
    for (const entry of pending) {
      const applied = this.handler?.(entry.action, entry.tick);
      this.markDelivered(entry.action, applied !== false);
    }
  }

  inject(action: CommandAction): void {
    const applied = this.handler?.(action, this.currentTick);
    this.markDelivered(action, applied !== false);
  }

  private markDelivered(action: CommandAction, applied: boolean): void {
    if (!applied || action.kind !== "axes") return;
    this.lastDeliveredAxes.set(action.slot, { ...action.payload });
  }

  startRecording(): void {
    this.history = [];
  }

  stopRecording(): RecordedCommand[] {
    const h = this.history ?? [];
    this.history = null;
    return h;
  }

  isRecording(): boolean {
    return this.history !== null;
  }

  recordedCommands(): RecordedCommand[] {
    return this.history ? [...this.history] : [];
  }

  setTick(tick: number): void {
    this.currentTick = tick;
  }

  get tick(): number {
    return this.currentTick;
  }
}
