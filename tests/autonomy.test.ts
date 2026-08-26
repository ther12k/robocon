import { describe, it, expect, beforeAll, vi } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import { SimulationCore } from "../src/core/SimulationCore";
import { MatchController } from "../src/core/match";
import { AutonomyManager, type HostFactory, type ScriptHost, type WorkerIn, type WorkerOut } from "../src/core/autonomy";
import { buildSenseFrame } from "../src/core/sensors";
import { diffSpec } from "./simulationCore.test";
import type {
  ArenaConfig,
  CompetitionRuleset,
  RobotSpec,
  SimulationProfile,
} from "../src/sim/types";

const arena: ArenaConfig = {
  meta: {
    name: "autonomy-test",
    rulebookVersion: "0",
    tolerancePct: 5,
    schemaVersion: 1,
    source: { authority: "provisional", status: "inferred" },
  },
  dimensions: { width: 16, length: 16 },
  zones: [
    { id: "startRed", team: "red", shape: "rect", x: -7, z: 6.5, w: 2, l: 3 },
    { id: "startBlue", team: "blue", shape: "rect", x: 7, z: -6.5, w: 2, l: 3 },
  ],
  staticProps: [],
  objectSpawns: [
    {
      objectId: "objA#1",
      typeId: "objA",
      pose: { x: -7, y: 0.075, z: 6.02 },
      initialState: "idle",
      massKg: 0.8,
      render: { shape: "box", size: { w: 0.15, h: 0.15, d: 0.15 }, color: "#fff" },
    },
  ],
  targets: [],
  triggers: [{ id: "goalRed", shape: "rect", x: -7, z: -2, w: 1.4, l: 1, yMax: 1 }],
  surfaces: { defaultFriction: 0.7 },
};

const ruleset: CompetitionRuleset = {
  robots: testCompetitionRobots(),
  teamWeightBudgetKg: 50,
  match: { setupSec: 1, countdownSec: 1, playSec: 120, retriesPerTeam: 3 },
  scoring: [{ id: "goalRedScore", type: "objectInTrigger", triggerId: "goalRed", team: "red", points: 10 }],
  absoluteWin: { type: "scoreThreshold", points: 10 },
  violations: [{ id: "oob", type: "outOfBounds", marginM: 0.25, effect: "retry" }],
};

function testCompetitionRobots(): CompetitionRuleset["robots"] {
  return {
    R1: { maxFootprintMm: { w: 1000, l: 1000, h: 1000 }, extendedMm: { w: 1000, l: 1800, h: 1300 } },
  };
}

const profile: SimulationProfile = { maxSpeedMps: 3, maxAccelMps2: 8, maxTurnRps: 2, solverHz: 60 };

const sampleCode = readFileSync(
  new URL("../public/scripts/sample-gather.js", import.meta.url),
  "utf8",
);

beforeAll(async () => {
  await RAPIER.init();
});

function setupWithMatch() {
  const core = new SimulationCore(arena, ruleset, profile);
  core.addRobot(0, diffSpec satisfies RobotSpec);
  const match = new MatchController(core, ruleset);
  return { core, match };
}

/** In-process ScriptHost that executes the user tick synchronously per frame. */
class FakeHost implements ScriptHost {
  private handler: ((msg: WorkerOut) => void) | null = null;
  private userTick: ((sense: unknown, api: unknown) => void) | null = null;
  respondToTicks = true;
  apiLog: string[] = [];
  private api: unknown;

  constructor(code: string) {
    const self = this;
    this.api = {
      setAxes(fwd: number, strafe: number, turn: number) {
        self.handler?.({ type: "axes", payload: { fwd, strafe, turn } });
      },
      grabToggle() {
        self.handler?.({ type: "grabToggle" });
      },
      release() {
        self.handler?.({ type: "release" });
      },
      log(message: string) {
        self.apiLog.push(String(message));
        self.handler?.({ type: "log", message: String(message) });
      },
    };
    const compiled = new Function(`${code}\n;return typeof onTick === "function" ? onTick : null;`)();
    if (typeof compiled !== "function") throw new Error("no onTick defined");
    this.userTick = compiled as (sense: unknown, api: unknown) => void;
  }

  /** Id of the most recent tick posted by the manager. */
  lastTickId: number | null = null;

  post(msg: WorkerIn): void {
    // Record the id even when frozen — tests may still complete the tick.
    if (msg.type === "tick") this.lastTickId = msg.id ?? this.lastTickId;
    if (!this.respondToTicks && msg.type === "tick") return;
    if (msg.type === "init") {
      this.handler?.({ type: "ready" });
      return;
    }
    if (msg.type === "tick" && msg.sense) {
      this.lastTickId = msg.id ?? 0;
      try {
        this.userTick?.(msg.sense, this.api);
      } catch (err) {
        this.handler?.({ type: "error", message: String(err) });
      } finally {
        this.handler?.({ type: "done", id: msg.id ?? 0 });
      }
    }
  }

  terminate(): void {
    this.userTick = null;
  }

  /** Delivers a raw worker message as-if sent by the script. */
  emit(msg: unknown): void {
    this.handler?.(msg as WorkerOut);
  }

  /** Completes the outstanding tick (done{id}) without executing user code. */
  finishLastTick(): void {
    if (this.lastTickId !== null) this.handler?.({ type: "done", id: this.lastTickId });
  }

  onMessage(handler: (msg: WorkerOut) => void): void {
    this.handler = handler;
  }
}

describe("sensors (Competition API)", () => {
  it("exposes own odometry but no enemy/world truth beyond detection range", async () => {
    await RAPIER.init();
    const { core, match } = setupWithMatch();
    match.startMatch();
    for (let i = 0; i < 130; i++) match.advance(core.physics.fixedDt);
    const frame = buildSenseFrame(core, 0);
    expect(frame).not.toBeNull();
    expect(frame!.odometry.x).toBeCloseTo(-7, 1);
    expect(frame!.scan.length).toBeGreaterThan(0);
    expect(frame!.scan[0].objectId).toBe("objA#1");
    expect(Math.abs(frame!.scan[0].bearingRad)).toBeLessThan(0.4);
    expect(frame!.lidar.every((r) => r.distanceM >= 0)).toBe(true);
  });
});

describe("AutonomyManager (M4)", () => {

  it("sample bot gathers and scores unaided inside a live match", async () => {
    vi.useRealTimers();
    const { core, match } = setupWithMatch();
    const manager = new AutonomyManager(core, (code) => new FakeHost(code));
    match.startMatch();

    // burn setup + countdown
    for (let i = 0; i < 140; i++) match.advance(core.physics.fixedDt);
    expect(match.phase).toBe("playing");

    manager.attach(0, sampleCode);

    let guard = 0;
    while (match.phase === "playing" && guard < 60 * 60) {
      match.advance(core.physics.fixedDt);
      guard += 1;
    }
    manager.dispose();

    expect(match.score.red).toBeGreaterThanOrEqual(10);
    expect(match.winner).toBe("red");
  });

  it("watchdog terminates an unresponsive (infinite-loop) script cleanly", async () => {
    vi.useFakeTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    // simulate the host freezing mid-tick: pump delivers a tick, the frozen
    // host never answers, and the outstanding-tick watchdog must fire.
    let frozenHost: FakeHost | null = null;
    const freezingFactory: HostFactory = (code) => {
      const inner = new FakeHost(code);
      frozenHost = inner;
      return {
        post: (m) => inner.post(m),
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    };
    const frozenManager = new AutonomyManager(core, freezingFactory);
    frozenManager.attach(0, "function onTick(sense, api) { while (true) {} }");
    await vi.advanceTimersByTimeAsync(50);
    expect(frozenManager.status(0).status).toBe("running");
    frozenHost!.respondToTicks = false; // host goes busy-silent from now on
    core.advance(core.physics.fixedDt); // pump -> outstanding tick
    await vi.advanceTimersByTimeAsync(1000);
    expect(frozenManager.status(0).status).toBe("killed");

    vi.useRealTimers();
    frozenManager.dispose();
  });

  it("ignores forged slot ids: a slot-0 script cannot drive slot 1", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    core.addRobot(1, diffSpec satisfies RobotSpec);
    const host = new FakeHost(sampleCode);
    const manager = new AutonomyManager(core, () => host);
    manager.attach(0, sampleCode);

    // forged message claiming slot 1 — must be bound to the host's own slot 0
    for (let i = 0; i < 15; i++) core.advance(core.physics.fixedDt); // settle bodies
    const p0Before = core.getBody(0)!.translation();
    const p1Before = core.getBody(1)!.translation();
    host.emit({ type: "axes", slot: 1, payload: { fwd: 1, strafe: 0, turn: 0 } });
    for (let i = 0; i < 30; i++) core.advance(core.physics.fixedDt);

    const p0 = core.getBody(0)!.translation();
    const p1 = core.getBody(1)!.translation();
    expect(Math.hypot(p1.x - p1Before.x, p1.z - p1Before.z)).toBeLessThan(0.02);
    expect(Math.hypot(p0.x - p0Before.x, p0.z - p0Before.z)).toBeGreaterThan(0.3);
    manager.dispose();
  });

  it("kills workers that send malformed or out-of-protocol messages", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    // NaN payload
    const bad1 = new FakeHost(sampleCode);
    const m1 = new AutonomyManager(core, () => bad1);
    m1.attach(0, sampleCode);
    bad1.emit({ type: "axes", payload: { fwd: Number.NaN, strafe: 0, turn: 0 } });
    expect(m1.status(0).status).toBe("killed");
    expect(m1.status(0).detail).toContain("protocol violation");
    m1.dispose();

    // unknown message type
    const bad2 = new FakeHost(sampleCode);
    const m2 = new AutonomyManager(core, () => bad2);
    m2.attach(0, sampleCode);
    bad2.emit({ type: "selfDestruct" });
    expect(m2.status(0).status).toBe("killed");
    m2.dispose();

    // wrong payload shape (extra property)
    const bad3 = new FakeHost(sampleCode);
    const m3 = new AutonomyManager(core, () => bad3);
    m3.attach(0, sampleCode);
    bad3.emit({ type: "axes", payload: { fwd: 1, strafe: 0, turn: 0, boost: true } });
    expect(m3.status(0).status).toBe("killed");
    m3.dispose();

    // non-object message
    const bad4 = new FakeHost(sampleCode);
    const m4 = new AutonomyManager(core, () => bad4);
    m4.attach(0, sampleCode);
    bad4.emit("hello");
    expect(m4.status(0).status).toBe("killed");
    m4.dispose();
  });

  it("release command respects the input gate", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);
    core.placeObjectNearGripper(0);
    core.enqueueGrabToggle(0);
    core.advance(core.physics.fixedDt);
    expect(core.gripStatus(0).holding).toBe(true);

    core.inputGateEnabled = true;
    core.injectCommand({ kind: "release", slot: 0 });
    core.advance(core.physics.fixedDt);
    expect(core.gripStatus(0).holding).toBe(true);

    core.inputGateEnabled = false;
    core.injectCommand({ kind: "release", slot: 0 });
    core.advance(core.physics.fixedDt);
    expect(core.gripStatus(0).holding).toBe(false);
  });

  it("keeps at most one outstanding tick and coalesces frames", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    let ticksPosted = 0;
    let host: FakeHost | null = null;
    const manager = new AutonomyManager(core, (code) => {
      const inner = new FakeHost(code);
      host = inner;
      return {
        post: (m) => {
          if (m.type === "tick") ticksPosted += 1;
          inner.post(m);
        },
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    });
    manager.attach(0, sampleCode);
    await Promise.resolve();

    host!.respondToTicks = false; // hold the tick: never send done
    core.advance(core.physics.fixedDt);
    expect(ticksPosted).toBe(1);
    core.advance(core.physics.fixedDt);
    core.advance(core.physics.fixedDt);
    expect(ticksPosted, "backpressure failed — ticks queued without done").toBe(1);

    host!.respondToTicks = true;
    host!.finishLastTick(); // release the outstanding tick
    core.advance(core.physics.fixedDt);
    expect(ticksPosted).toBe(2);
    manager.dispose();
  });

  it("accepts exactly 24 commands per outstanding tick and kills on the 25th", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    let host: FakeHost | null = null;
    const manager = new AutonomyManager(core, (code) => {
      const inner = new FakeHost(code);
      host = inner;
      return {
        post: (m) => inner.post(m),
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    });
    manager.attach(0, 'function onTick(sense, api) {}');
    await Promise.resolve();

    host!.respondToTicks = false; // hold one tick open
    core.advance(core.physics.fixedDt);

    for (let i = 0; i < 24; i++) {
      host!.emit({
        type: "axes",
        payload: { fwd: i * 0.01, strafe: 0, turn: 0 },
      } as unknown);
      if (i < 23) {
        expect(manager.status(0).status, `killed early at command ${i + 1}`).not.toBe("killed");
      }
    }
    expect(manager.status(0).status).toBe("running");
    host!.emit({ type: "axes", payload: { fwd: 0.99, strafe: 0, turn: 0 } } as unknown);
    expect(manager.status(0).status).toBe("killed");
    expect(manager.status(0).detail).toContain("command spam limit exceeded");
    manager.dispose();
  });

  it("accepts 24 commands plus done, counts only commands, and kills on the 25th", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    let host: FakeHost | null = null;
    const manager = new AutonomyManager(core, (code) => {
      const inner = new FakeHost(code);
      host = inner;
      return {
        post: (m) => inner.post(m),
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    });
    manager.attach(0, 'function onTick(sense, api) {}');
    await Promise.resolve();

    // Hold one tick open so commands have an outstanding tick to belong to.
    host!.respondToTicks = false;
    core.advance(core.physics.fixedDt);

    for (let i = 0; i < 24; i++) {
      host!.emit({ type: "log", message: `noise ${i}` } as unknown); // must not consume budget
      host!.emit({
        type: "axes",
        payload: { fwd: i * 0.01, strafe: 0, turn: 0 },
      } as unknown);
      expect(manager.status(0).status, `killed at command ${i + 1}`).not.toBe("killed");
    }

    // mandatory done after the 24th command — must be accepted, not counted
    host!.finishLastTick();
    expect(manager.status(0).status).toBe("running");

    // fresh budget on the next outstanding tick: one command is fine again
    core.advance(core.physics.fixedDt);
    host!.emit({ type: "axes", payload: { fwd: 0.5, strafe: 0, turn: 0 } } as unknown);
    expect(manager.status(0).status).toBe("running");
    manager.dispose();
  });

  it("kills the worker when 25 commands arrive within a single tick window", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    let host: FakeHost | null = null;
    const manager = new AutonomyManager(core, (code) => {
      const inner = new FakeHost(code);
      host = inner;
      return {
        post: (m) => inner.post(m),
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    });
    manager.attach(0, 'function onTick(sense, api) {}');
    await Promise.resolve();

    host!.respondToTicks = false;
    core.advance(core.physics.fixedDt);

    for (let i = 0; i < 24; i++) {
      host!.emit({
        type: "axes",
        payload: { fwd: i * 0.01, strafe: 0, turn: 0 },
      } as unknown);
    }
    expect(manager.status(0).status).toBe("running");

    host!.emit({
      type: "axes",
      payload: { fwd: 0.99, strafe: 0, turn: 0 },
    } as unknown);
    expect(manager.status(0).status).toBe("killed");
    expect(manager.status(0).detail).toContain("command spam limit exceeded");
    manager.dispose();
  });

  it("treats a command arriving after done as a protocol violation", async () => {
    vi.useRealTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    let host: FakeHost | null = null;
    const manager = new AutonomyManager(core, (code) => {
      const inner = new FakeHost(code);
      host = inner;
      return {
        post: (m) => inner.post(m),
        terminate: () => inner.terminate(),
        onMessage: inner.onMessage.bind(inner),
      };
    });
    manager.attach(0, 'function onTick(sense, api) {}');
    await Promise.resolve();

    host!.respondToTicks = false; // hold one tick open
    core.advance(core.physics.fixedDt);

    // one command inside the window is fine…
    host!.emit({ type: "axes", payload: { fwd: 0.5, strafe: 0, turn: 0 } } as unknown);
    expect(manager.status(0).status).toBe("running");

    // …but once done closes the tick, another command violates the protocol
    host!.finishLastTick();
    expect(manager.status(0).status).toBe("running");
    host!.emit({ type: "axes", payload: { fwd: 0.5, strafe: 0, turn: 0 } } as unknown);
    expect(manager.status(0).status).toBe("killed");
    expect(manager.status(0).detail).toContain("without outstanding tick");
    manager.dispose();
  });

  it("does not kill a healthy idle worker after the stall limit with no outstanding tick", async () => {
    vi.useFakeTimers();
    const core = new SimulationCore(arena, ruleset, profile);
    core.addRobot(0, diffSpec satisfies RobotSpec);

    const manager = new AutonomyManager(core, (code) => new FakeHost(code));
    manager.attach(0, sampleCode);
    await vi.advanceTimersByTimeAsync(50);
    expect(manager.status(0).status).toBe("running"); // ready received → boot deadline cleared

    // visible-thread long task well past the stall limit, but no tick was
    // ever sent — there is no deadline, so the watchdog must do nothing.
    await vi.advanceTimersByTimeAsync(2000);
    expect(manager.status(0).status).toBe("running");

    vi.useRealTimers();
    manager.dispose();
  });

  it("respects the input gate during setup phase", async () => {    vi.useRealTimers();
    const { core, match } = setupWithMatch();
    const manager = new AutonomyManager(core, (code) => new FakeHost(code));
    match.startMatch();
    manager.attach(0, sampleCode);

    const body = core.getBody(0)!;
    const zBefore = body.translation().z;
    for (let i = 0; i < 60; i++) match.advance(core.physics.fixedDt);
    expect(match.phase).not.toBe("playing");
    expect(body.translation().z).toBeCloseTo(zBefore, 3);
    manager.dispose();
  });
});
