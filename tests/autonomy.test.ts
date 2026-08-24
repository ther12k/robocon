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
  private slot = 0;
  respondToTicks = true;
  apiLog: string[] = [];
  private api: unknown;

  constructor(code: string) {
    const self = this;
    this.api = {
      setAxes(fwd: number, strafe: number, turn: number) {
        self.handler?.({ type: "axes", slot: self.slot, payload: { fwd, strafe, turn } });
      },
      grabToggle() {
        self.handler?.({ type: "grabToggle", slot: self.slot });
      },
      release() {
        self.handler?.({ type: "release", slot: self.slot });
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

  post(msg: WorkerIn): void {
    if (!this.respondToTicks && msg.type === "tick") return;
    if (msg.type === "init") {
      this.slot = msg.slot ?? 0;
      this.handler?.({ type: "ready" });
      return;
    }
    if (msg.type === "tick" && msg.sense) {
      this.handler?.({ type: "heartbeat", tick: msg.sense!.tick });
      try {
        this.userTick?.(msg.sense, this.api);
      } catch (err) {
        this.handler?.({ type: "error", message: String(err) });
      }
    }
  }

  terminate(): void {
    this.userTick = null;
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
  function makeManager(core: SimulationCore): AutonomyManager {
    vi.useFakeTimers();
    const factory: HostFactory = (code) => new FakeHost(code);
    return new AutonomyManager(core, factory);
  }

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
    const manager = makeManager(core);

    let terminated = false;
    const factory: HostFactory = (code) => {
      const inner = new FakeHost(code);
      const wrapped: ScriptHost = {
        post: (m) => inner.post(m),
        terminate: () => {
          terminated = true;
          inner.terminate();
        },
        onMessage: inner.onMessage.bind(inner),
      };
      return wrapped;
    };
    const manager2 = new AutonomyManager(core, factory);

    manager2.attach(0, "function onTick(sense, api) { while (true) {} }");
    await vi.advanceTimersByTimeAsync(50);
    expect(manager2.status(0).status).toBe("running");

    // simulate the host freezing: stop responding by swapping in a silent shell
    manager2.attach(0, "function onTick(sense, api) { while (true) {} }");
    await vi.advanceTimersByTimeAsync(1000);

    // after stall limit the manager must have terminated the host
    expect(manager2.status(0).status).toBe("killed");
    void terminated;
    void manager;

    vi.useRealTimers();
    manager.dispose();
    manager2.dispose();
  });

  it("respects the input gate during setup phase", async () => {
    vi.useRealTimers();
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
