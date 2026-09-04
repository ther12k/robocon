import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { SimulationCore } from "../src/core/SimulationCore";
import { MatchController } from "../src/core/match";
import { AutonomyManager } from "../src/core/autonomy";
import { SimulatorAdapter } from "../src/app/SimulatorAdapter";
import { UiStore } from "../src/app/UiStore";
import { AppController } from "../src/app/AppController";
import {
  canManualDrive,
  canStartMatch,
  canRecordPractice,
  canGrabToggle,
  canResetSelectedRobot,
  canPlayReplay,
} from "../src/app/capabilities";
import { testArena, testCompetition, testProfile, diffSpec } from "./simulationCore.test";

describe("UI Capabilities Matrix & AppController (RUI-005)", () => {
  let core: SimulationCore;
  let match: MatchController;
  let autonomy: AutonomyManager;
  let adapter: SimulatorAdapter;
  let store: UiStore;
  let controller: AppController;

  beforeAll(async () => {
    await RAPIER.init();
  });

  beforeEach(() => {
    core = new SimulationCore(testArena, testCompetition, testProfile);
    match = new MatchController(core, testCompetition);
    autonomy = new AutonomyManager(core, () => ({
      post: () => {},
      terminate: () => {},
      onMessage: () => {},
    }));
    core.addRobot(0, diffSpec);

    adapter = new SimulatorAdapter({ core, match, autonomy });
    store = new UiStore(adapter.buildSnapshot());
    controller = new AppController({ core, match, autonomy, adapter, store });
  });

  it("permits manual drive in idle practice with manual ownership", () => {
    const snap = store.snapshot;
    const admission = canManualDrive(snap, 0);
    expect(admission.allowed).toBe(true);

    const result = controller.submitManualAxes(0, { fwd: 1, strafe: 0, turn: 0 });
    expect(result.ok).toBe(true);
  });

  it("rejects manual drive when match is in countdown", () => {
    match.startMatch(); // transitions to setup/countdown
    const snapCountdown = adapter.buildSnapshot();
    const admCountdown = canManualDrive(snapCountdown, 0);
    expect(admCountdown.allowed).toBe(false);
    expect(admCountdown.code).toBe("MATCH_COUNTDOWN");
  });

  it("rejects grab toggle when robot has no gripper module", () => {
    core.addRobot(1, {
      ...diffSpec,
      name: "NoGripBot",
      modules: [],
    });
    adapter.setActiveSlot(1);
    const snap = adapter.buildSnapshot();
    const adm = canGrabToggle(snap, 1);
    expect(adm.allowed).toBe(false);
    expect(adm.code).toBe("MODULE_NOT_INSTALLED");
  });

  it("enforces practice recording and match lifecycle transitions", () => {
    const snapIdle = store.snapshot;
    expect(canRecordPractice(snapIdle).allowed).toBe(true);
    expect(canStartMatch(snapIdle).allowed).toBe(true);

    controller.startRecording("practice");
    const snapRec = store.snapshot;
    expect(snapRec.replay.state).toBe("recording");
    expect(canRecordPractice(snapRec).allowed).toBe(false);

    const exportRes = controller.stopAndExport();
    expect(exportRes.ok).toBe(true);
    expect(typeof exportRes.data).toBe("string");
  });

  it("resets selected robot without disturbing global match or other slots", () => {
    expect(canResetSelectedRobot(store.snapshot, 0).allowed).toBe(true);
    const res = controller.resetSelectedRobot(0);
    expect(res.ok).toBe(true);
  });

  it("rejects play replay when no replay is loaded", () => {
    const snap = store.snapshot;
    const adm = canPlayReplay(snap);
    expect(adm.allowed).toBe(false);
    expect(adm.code).toBe("NO_REPLAY_LOADED");
  });
});
