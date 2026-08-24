import type { HostFactory, ScriptHost, WorkerIn, WorkerOut } from "./autonomy";

const WRAPPER_SOURCE = String.raw`
let userTick = null;
let slot = 0;
function send(msg) { self.postMessage(msg); }
self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    slot = msg.slot ?? 0;
    try {
      const api = {
        setAxes(fwd, strafe, turn) { send({ type: "axes", slot, payload: { fwd, strafe, turn } }); },
        grabToggle() { send({ type: "grabToggle", slot }); },
        release() { send({ type: "release", slot }); },
        log(message) { send({ type: "log", message: String(message) }); },
      };
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
    send({ type: "heartbeat", tick: msg.sense ? msg.sense.tick : -1 });
    if (!userTick || !msg.sense) return;
    try {
      userTick(msg.sense, api);
    } catch (err) {
      send({ type: "error", message: "onTick: " + err.message });
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
