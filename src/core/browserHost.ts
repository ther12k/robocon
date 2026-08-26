import type { HostFactory, ScriptHost, WorkerIn, WorkerOut } from "./autonomy";

const WRAPPER_SOURCE = String.raw`
let userTick = null;
function send(msg) { self.postMessage(msg); }
self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      userTick = new Function(msg.code + "\n;return typeof onTick === \"function\" ? onTick : null;")();
      if (typeof userTick !== "function") {
        send({ type: "error", message: "script must define function onTick(sense, api)" });
        return;
      }
      send({ type: "ready" });
    } catch (err) {
      send({ type: "error", message: "compile: " + err.message });
    }
    return;
  }
  if (msg.type === "tick") {
    if (!userTick || !msg.sense) return;
    // Per-tick API closure — every message carries the originating tick id so
    // the host can reject stale commands from previous ticks.
    const api = {
      setAxes(fwd, strafe, turn) { send({ type: "axes", id: msg.id, payload: { fwd, strafe, turn } }); },
      grabToggle() { send({ type: "grabToggle", id: msg.id }); },
      release() { send({ type: "release", id: msg.id }); },
      log(message) { send({ type: "log", id: msg.id, message: String(message) }); },
    };
    try {
      const result = userTick(msg.sense, api);
      // Synchronous contract — a returned Promise means the callback deferred
      // its work, which would make autonomy nondeterministic.
      if (result && typeof result.then === "function") {
        send({ type: "error", id: msg.id, message: "onTick must be synchronous" });
        return;
      }
      send({ type: "done", id: msg.id });
    } catch (err) {
      // error is the terminal response for this tick — the host kills the
      // worker immediately, so no trailing done is sent.
      send({ type: "error", id: msg.id, message: "onTick: " + err.message });
    }
  }
};
`;

export interface BrowserHost extends ScriptHost {
  worker: Worker;
}

export function createBrowserHostFactory(): HostFactory | null {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL?.createObjectURL !== "function") {
    return null;
  }
  const blobUrl = URL.createObjectURL(new Blob([WRAPPER_SOURCE], { type: "text/javascript" }));
  return (code: string): ScriptHost => {
    const worker = new Worker(blobUrl);
    let handler: ((msg: WorkerOut) => void) | null = null;
    worker.onmessage = (e: MessageEvent<WorkerOut>) => handler?.(e.data);
    const host: BrowserHost = {
      worker,
      post(msg: WorkerIn): void {
        worker.postMessage(msg);
      },
      terminate(): void {
        worker.terminate();
      },
      onMessage(cb: (msg: WorkerOut) => void): void {
        handler = cb;
      },
    };
    void code;
    return host;
  };
}
