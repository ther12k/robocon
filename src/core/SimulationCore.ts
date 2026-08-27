import RAPIER from "@dimforge/rapier3d-compat";
import type { ArenaConfig, CompetitionRuleset, DriveCommand, RobotSpec, SimulationProfile, Team } from "../sim/types";
import { quatFromEulerYXZ } from "../sim/orientation";
import { BUILD_ID, WASM_HASH } from "./buildInfo";
import { PhysicsWorld, type TrackedEntity } from "../sim/physics/PhysicsWorld";
import { OwnershipRegistry } from "../sim/physics/OwnershipRegistry";
import { createRobotBody } from "../sim/robot/RobotBody";
import { applyDrive } from "../sim/robot/DriveController";
import { GripperController, type GrabCandidate } from "../sim/robot/GripperController";
import { CommandBus, type CommandAction } from "./CommandBus";
import {
  REPLAY_SCHEMA_VERSION,
  checkReplayCompatibility,
  type ReplayCheckpoint,
  type ReplayCompatibilityIssue,
  type ReplayFile,
  type ReplayRuntimeInfo,
} from "./replayFile";

/** Engine identity includes the git build SHA via BUILD_ID. */
export const ENGINE_VERSION = `0.1.0+${BUILD_ID}`;

export interface SimEvent {
  tick: number;
  type: "triggerEnter" | "triggerExit";
  triggerId: string;
  entityId: string;
}

export interface EntitySnapshot {
  id: string;
  p: [number, number, number];
  q: [number, number, number, number];
}

export interface CoreSnapshot {
  schemaVersion: 1;
  engineVersion: string;
  physicsVersion: string;
  tick: number;
  entities: EntitySnapshot[];
  holds: Array<{ owner: string; objectId: string }>;
}


function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

interface Slot {
  spec: RobotSpec;
  body: RAPIER.RigidBody;
  gripper: GripperController | null;
  axes: DriveCommand;
  spawn: { x: number; z: number; yaw: number };
}

interface TriggerState {
  inside: Set<string>;
}

export interface MatchHashInfo {
  phase: string;
  timeRemainingSec: number;
  scores: { red: number; blue: number };
  retriesLeft: { red: number; blue: number };
  winnerTeam: string | null;
}

export type InputLockName = "manual" | "match-phase" | "replay";

export class SimulationCore {
  physics: PhysicsWorld;
  readonly bus = new CommandBus();
  readonly arena: ArenaConfig;
  readonly competition: CompetitionRuleset;
  readonly profile: SimulationProfile;
  private slots = new Map<number, Slot>();
  private worldObjects: GrabCandidate[] = [];
  private objectEntityIds = new Map<number, string>();
  private objectTypeIds = new Map<string, string>();
  private objectStates = new Map<string, "idle" | "held" | "scored" | "out">();
  private triggers = new Map<string, TriggerState>();
  private pendingEvents: SimEvent[] = [];
  private tick = 0;
  private inputLocks = new Set<InputLockName>();
  /** True when any lock owner (match phase, replay playback, manual) blocks input. */
  get inputGateEnabled(): boolean {
    return this.inputLocks.size > 0;
  }
  set inputGateEnabled(v: boolean) {
    this.setInputLock("manual", v);
  }
  setInputLock(lock: InputLockName, locked: boolean): void {
    if (locked) this.inputLocks.add(lock);
    else this.inputLocks.delete(lock);
  }
  hasInputLock(lock: InputLockName): boolean {
    return this.inputLocks.has(lock);
  }
  private replayCheckpoints: ReplayCheckpoint[] = [];
  private checkpointIntervalTicks = 0;
  private initialStateAtCapture = "";
  private replayCmds: Map<number, CommandAction[]> | null = null;
  private replayVerify: Map<number, string> | null = null;
  private replayTotalTicks = 0;
  private replayCompleted = false;
  private replayDesyncTick: number | null = null;
  private replayExpectedFinal = "";
  private replayError: string | null = null;
  private lastRecordedHash = "";
  private sessionId = 0;
  private rosterSpecs: Array<{ index: number; spec: RobotSpec }> = [];
  private pristineCache: ReplayRuntimeInfo | null = null;

  constructor(arena: ArenaConfig, competition: CompetitionRuleset, profile: SimulationProfile) {
    this.arena = arena;
    this.competition = competition;
    this.profile = profile;
    this.physics = this.buildSession();
    for (const t of arena.triggers ?? []) this.triggers.set(t.id, { inside: new Set() });
    this.bus.setHandler((action) => this.handleAction(action));
  }

  private buildSession(): PhysicsWorld {
    this.sessionId += 1;
    const physics = new PhysicsWorld({ x: 0, y: -9.81, z: 0 });
    if (this.profile.solverHz && this.profile.solverHz !== 60) {
      physics.setSolverHz(this.profile.solverHz);
    }
    this.physics = physics;
    physics.buildStaticFromArena(this.arena);
    this.worldObjects = [];
    this.objectEntityIds = new Map();
    this.objectTypeIds = new Map();
    this.objectStates = new Map();
    for (const spawn of this.arena.objectSpawns) {
      const obj = physics.addDynamicObject(spawn, this.arena.surfaces.defaultFriction);
      const entityId = `obj-${spawn.objectId}`;
      physics.registerEntity(entityId, obj.body);
      this.worldObjects.push({ id: spawn.objectId, body: obj.body, collider: obj.collider });
      this.objectEntityIds.set(obj.collider.handle, entityId);
      this.objectTypeIds.set(spawn.objectId, spawn.typeId);
      this.objectStates.set(spawn.objectId, "idle");
    }
    this._ownership = new OwnershipRegistry();
    for (const [index, slot] of this.slots) {
      const yaw = slot.spawn.yaw;
      const { body } = createRobotBody(physics.world, slot.spec, index, slot.spawn.x, slot.spawn.z, yaw);
      physics.registerEntity(`robot-${index}`, body);
      slot.body = body;
      slot.axes = { fwd: 0, strafe: 0, turn: 0 };
      const gripperModule = slot.spec.modules?.find((m) => m.type === "gripper");
      slot.gripper = gripperModule?.type === "gripper"
        ? new GripperController(gripperModule, `robot-${index}`, index, this.ownershipRef)
        : null;
    }
    return physics;
  }

  private handleAction(action: CommandAction): boolean {
    if (
      this.inputGateEnabled &&
      (action.kind === "axes" || action.kind === "grabToggle" || action.kind === "release")
    ) {
      return false;
    }
    return this.applyAction(action);
  }

  private applyAction(action: CommandAction): boolean {
    switch (action.kind) {
      case "axes": {
        const slot = this.slots.get(action.slot);
        if (!slot) return false;
        slot.axes = action.payload;
        return true;
      }
      case "grabToggle": {
        if (!this.slots.has(action.slot)) return false;
        this.toggleGrip(action.slot);
        return true;
      }
      case "release": {
        this.slots.get(action.slot)?.gripper?.release(this.bodyVel(action.slot));
        return true;
      }
    }
    return true;
  }

  private bodyVel(slot: number): { x: number; y: number; z: number } | undefined {
    return this.slots.get(slot)?.body.linvel();
  }

  addRobot(index: number, spec: RobotSpec): void {
    this.removeRobot(index);
    const zoneId = spec.team === "red" ? "startRed" : "startBlue";
    const zone = this.arena.zones.find((z) => z.id === zoneId);
    const cx = zone?.x ?? 0;
    const cz = zone?.z ?? 0;
    const yaw = spec.team === "red" ? Math.PI : 0;
    const { body } = createRobotBody(this.physics.world, spec, index, cx, cz, yaw);
    const gripperModule = spec.modules?.find((m) => m.type === "gripper");
    const gripper = gripperModule?.type === "gripper"
      ? new GripperController(gripperModule, `robot-${index}`, index, this.ownershipRef)
      : null;
    this.physics.registerEntity(`robot-${index}`, body);
    this.slots.set(index, { spec, body, gripper, axes: { fwd: 0, strafe: 0, turn: 0 }, spawn: { x: cx, z: cz, yaw } });
    this.rosterSpecs = this.rosterSpecs.filter((r) => r.index !== index);
    this.rosterSpecs.push({ index, spec });
    this.pristineCache = null;
  }

  removeRobot(index: number): void {
    const slot = this.slots.get(index);
    if (!slot) return;
    slot.gripper?.release(slot.body.linvel());
    this.physics.unregisterEntity(`robot-${index}`);
    this.slots.delete(index);
    this.rosterSpecs = this.rosterSpecs.filter((r) => r.index !== index);
    this.pristineCache = null;
  }

  hasSlot(index: number): boolean {
    return this.slots.has(index);
  }

  slotCount(): number {
    return this.slots.size;
  }

  get ownershipRef(): OwnershipRegistry {
    if (!this._ownership) this._ownership = new OwnershipRegistry();
    return this._ownership;
  }
  private _ownership?: OwnershipRegistry;

  getBody(slot: number): RAPIER.RigidBody | undefined {
    return this.slots.get(slot)?.body;
  }

  getSpec(slot: number): RobotSpec | undefined {
    return this.slots.get(slot)?.spec;
  }

  activeSlots(): number[] {
    return [...this.slots.keys()].sort((a, b) => a - b);
  }

  setAxesFromInput(slot: number, cmd: DriveCommand): void {
    this.bus.enqueue(
      { kind: "axes", slot, payload: cmd },
      { dedupeKey: "axes", tick: this.tick },
    );
  }

  enqueueGrabToggle(slot: number): void {
    this.bus.enqueue({ kind: "grabToggle", slot }, { tick: this.tick });
  }

  /** Injects an external command (autonomy scripts, tooling) through the gate. */
  injectCommand(action: CommandAction): void {
    this.bus.inject(action);
  }

  worldObjectCandidates(): GrabCandidate[] {
    return this.worldObjects;
  }

  isHeld(entityId: string): boolean {
    for (const o of this.worldObjects) {
      if (this.objectEntityIds.get(o.collider.handle) === entityId) {
        return this.ownershipRef.isHeld(o.collider.handle);
      }
    }
    return false;
  }

  placeObjectNearGripper(slot: number): string | null {
    const s = this.slots.get(slot);
    if (!s?.gripper) return null;
    const candidate = this.worldObjects.find(
      (o) => !this.ownershipRef.isHeld(o.collider.handle),
    );
    if (!candidate) return null;
    const mount = s.gripper.mountWorld(s.body);
    candidate.body.setTranslation(
      { x: mount.x + 0.04, y: Math.max(mount.y - 0.2, 0.09), z: mount.z },
      true,
    );
    return candidate.id;
  }

  private postStepListeners: Array<(dt: number) => void> = [];

  addPostStepListener(fn: (dt: number) => void): void {
    this.postStepListeners.push(fn);
  }

  advance(frameDt: number): void {
    const session = this.sessionId;
    this.physics.advance(
      frameDt,
      () => {
        if (session !== this.sessionId) return false;
        const injected = this.replayCmds?.get(this.tick);
        if (injected) for (const a of injected) this.applyAction(a);
        this.bus.setTick(this.tick);
        this.bus.drain();
        for (const [, slot] of this.slots) {
          applyDrive(slot.body, slot.spec, slot.axes, this.physics.fixedDt);
          slot.gripper?.update(slot.body);
        }
        return true;
      },
      (dt) => {
        if (session !== this.sessionId) return false;
        this.evaluateTriggers();
        for (const fn of this.postStepListeners) fn(dt);
        if (
          this.checkpointIntervalTicks > 0 &&
          this.bus.isRecording() &&
          this.tick % this.checkpointIntervalTicks === 0
        ) {
          this.replayCheckpoints.push({ tick: this.tick, hash: this.quantizedStateHash() });
        }
        if (this.checkpointIntervalTicks > 0 && this.bus.isRecording()) {
          this.lastRecordedHash = this.stateHash();
        }
        this.tick += 1;
        return this.verifyPlaybackBoundary();
      },
    );
  }

  /** Checks desync/final-hash at the just-completed step boundary. */
  private verifyPlaybackBoundary(): boolean {
    if (!this.replayCmds) return true;
    const expected = this.replayVerify?.get(this.tick - 1);
    if (expected !== undefined && this.quantizedStateHash() !== expected) {
      this.replayDesyncTick = this.tick - 1;
      this.replayError = `state diverged from checkpoint at tick ${this.tick - 1}`;
      this.stopReplayPlayback();
      return false;
    }
    if (this.tick >= this.replayTotalTicks) {
      const actual = this.stateHash();
      if (actual !== this.replayExpectedFinal) {
        this.replayError = "final state hash mismatch — replay is not faithful to the recording";
        this.stopReplayPlayback();
        return false;
      }
      this.stopReplayPlayback();
      this.replayCompleted = true;
      return false;
    }
    return true;
  }

  tickCount(): number {
    return this.tick;
  }

  beginReplayCapture(checkpointIntervalTicks = 60): void {
    if (checkpointIntervalTicks <= 0) {
      throw new Error("checkpointIntervalTicks must be > 0");
    }
    this.bus.startRecording();
    this.replayCheckpoints = [];
    this.lastRecordedHash = "";
    this.checkpointIntervalTicks = checkpointIntervalTicks;
    this.initialStateAtCapture = this.stateHash({ includeMatch: false });
  }

  endReplayCapture(opts: { matchStarted?: boolean } = {}): ReplayFile {
    const commands = this.bus.stopRecording();
    const file: ReplayFile = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      buildId: BUILD_ID,
      physicsVersion: RAPIER.version(),
      wasmHash: WASM_HASH,
      fixedDt: this.physics.fixedDt,
      configHashes: this.configHashes(),
      initialStateHash: this.initialStateAtCapture,
      checkpointIntervalTicks: this.checkpointIntervalTicks,
      checkpoints: [...this.replayCheckpoints],
      totalTicks: this.tick,
      finalStateHash: this.lastRecordedHash || this.stateHash(),
      commands,
      ...(opts.matchStarted ? { matchStarted: true } : {}),
    };
    this.checkpointIntervalTicks = 0;
    this.initialStateAtCapture = "";
    this.lastRecordedHash = "";
    return file;
  }

  replayRuntimeInfo(): ReplayRuntimeInfo {
    return {
      engineVersion: ENGINE_VERSION,
      buildId: BUILD_ID,
      physicsVersion: RAPIER.version(),
      wasmHash: WASM_HASH,
      fixedDt: this.physics.fixedDt,
      configHashes: this.configHashes(),
      // physics-pure initial state — pristine clones have no match provider
      initialStateHash: this.stateHash({ includeMatch: false }),
    };
  }

  /** Live match snapshot for authoritative hashing; null when idle/unset. */
  matchInfo(): MatchHashInfo | null {
    return this._matchInfoProvider ? this._matchInfoProvider() : null;
  }

  setMatchInfoProvider(provider: () => MatchHashInfo | null): void {
    this._matchInfoProvider = provider;
  }
  private _matchInfoProvider?: () => MatchHashInfo | null;

  /** Respawns matching robots at their spawns without touching the rest of
   *  the session: objects, tick counter, command queue, and other robots are
   *  preserved. Used for per-team retry resets during a live match. */
  respawnRobots(team?: Team): void {
    for (const [, slot] of this.slots) {
      if (team && slot.spec.team !== team) continue;
      slot.gripper?.release(slot.body.linvel());
      const q = quatFromEulerYXZ(0, slot.spawn.yaw, 0);
      slot.body.setTranslation(
        { x: slot.spawn.x, y: (slot.spec.chassis.height ?? 0.3) / 2 + 0.02, z: slot.spawn.z },
        true,
      );
      slot.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      slot.axes = { fwd: 0, strafe: 0, turn: 0 };
    }
  }

  /** Zeroes stored drive axes and brakes robot velocities. Called on match
   *  phase transitions (setup/countdown/ended) and operator stops so a stale
   *  nonzero command can never keep applying force after the whistle. */
  neutralizeActuators(): void {
    for (const [, slot] of this.slots) {
      slot.axes = { fwd: 0, strafe: 0, turn: 0 };
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  resetForReplay(): void {
    const meshes = new Map<string, NonNullable<TrackedEntity["mesh"]>>();
    for (const id of this.physics.entityIds()) {
      const mesh = this.physics.getEntity(id)?.mesh;
      if (mesh) meshes.set(id, mesh);
    }
    const oldWorld = this.physics.world;
    this.buildSession();
    for (const [id, mesh] of meshes) this.physics.attachMesh(id, mesh);
    queueMicrotask(() => {
      try {
        oldWorld.free();
      } catch {
        // world.free() is unavailable on some Rapier builds; GC will reclaim
      }
    });
    for (const st of this.triggers.values()) st.inside = new Set();
    this.pendingEvents = [];
    this.replayCmds = null;
    this.replayVerify = null;
    this.replayCompleted = false;
    this.replayDesyncTick = null;
    this.replayError = null;
    this.tick = 0;
    this.bus.resetQueue();
    this.bus.setTick(0);
  }

  startReplayPlayback(file: ReplayFile): ReplayCompatibilityIssue[] {
    const issues = this.validateReplay(file);
    if (issues.length > 0) return issues;
    this.resetForReplay();
    const map = new Map<number, CommandAction[]>();
    for (const c of file.commands) {
      const list = map.get(c.tick) ?? [];
      list.push(c.action);
      map.set(c.tick, list);
    }
    this.replayCmds = map;
    this.replayVerify = new Map(file.checkpoints.map((c) => [c.tick, c.hash]));
    this.replayTotalTicks = file.totalTicks;
    this.replayExpectedFinal = file.finalStateHash;
    this.setInputLock("replay", true);
    return [];
  }

  /** Non-destructive compatibility check against the pristine session state. */
  validateReplay(file: ReplayFile): ReplayCompatibilityIssue[] {
    return checkReplayCompatibility(file, this.getPristineRuntimeInfo());
  }

  getPristineRuntimeInfo(): ReplayRuntimeInfo {
    if (this.pristineCache) return this.pristineCache;
    const clone = new SimulationCore(this.arena, this.competition, this.profile);
    for (const r of this.rosterSpecs) clone.addRobot(r.index, r.spec);
    this.pristineCache = clone.replayRuntimeInfo();
    return this.pristineCache;
  }

  stopReplayPlayback(): void {
    this.replayCmds = null;
    this.replayVerify = null;
    this.setInputLock("replay", false);
  }

  get currentSessionId(): number {
    return this.sessionId;
  }

  isReplayPlaybackActive(): boolean {
    return this.replayCmds !== null;
  }

  wasReplayPlaybackCompleted(): boolean {
    return this.replayCompleted;
  }

  get replayDesync(): number | null {
    return this.replayDesyncTick;
  }

  get replayPlaybackError(): string | null {
    return this.replayError;
  }

  slotTeam(slot: number): "red" | "blue" | undefined {
    return this.slots.get(slot)?.spec.team;
  }

  getObjectTypeId(objectId: string): string | undefined {
    return this.objectTypeIds.get(objectId);
  }

  objectState(objectId: string): "idle" | "held" | "scored" | "out" {
    const id = this.ownershipRef.ownerOf(
      this.worldObjects.find((o) => o.id === objectId)?.collider.handle ?? -1,
    );
    if (id) return "held";
    return this.objectStates.get(objectId) ?? "out";
  }

  markObjectState(objectId: string, state: "scored" | "out"): void {
    this.objectStates.set(objectId, state);
  }

  /** Locks a scored object to its target snap pose (kinematic, zero velocity). */
  lockObjectToTarget(
    objectId: string,
    pose: { x: number; y: number; z: number },
  ): void {
    const obj = this.worldObjects.find((o) => o.id === objectId);
    if (!obj) return;
    obj.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    obj.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    obj.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.objectStates.set(objectId, "scored");
  }

  slotsByTeam(team: "red" | "blue"): number[] {
    return [...this.slots.entries()]
      .filter(([, s]) => s.spec.team === team)
      .map(([i]) => i)
      .sort((a, b) => a - b);
  }

  objectEntityId(objectId: string): string | undefined {
    const candidate = this.worldObjects.find((o) => o.id === objectId);
    return candidate ? this.objectEntityIds.get(candidate.collider.handle) : undefined;
  }

  fieldBounds(): { halfW: number; halfL: number } {
    return { halfW: this.arena.dimensions.width / 2, halfL: this.arena.dimensions.length / 2 };
  }

  private evaluateTriggers(): void {
    for (const def of this.arena.triggers ?? []) {
      const state = this.triggers.get(def.id);
      if (!state) continue;
      const yMin = def.yMin ?? 0;
      const yMax = def.yMax ?? 2;
      const targets: Array<"robots" | "objects"> = def.targets ?? ["robots"];
      const nowInside = new Set<string>();
      const check = (entityId: string, p: { x: number; y: number; z: number }) => {
        if (
          Math.abs(p.x - def.x) <= def.w / 2 &&
          Math.abs(p.z - def.z) <= def.l / 2 &&
          p.y >= yMin &&
          p.y <= yMax
        ) {
          nowInside.add(entityId);
        }
      };
      if (targets.includes("robots")) {
        for (const [slotIndex] of this.slots) {
          const e = this.physics.getEntity(`robot-${slotIndex}`);
          if (e) check(e.id, e.body.translation());
        }
      }
      if (targets.includes("objects")) {
        for (const o of this.worldObjects) {
          const entityId = this.objectEntityIds.get(o.collider.handle);
          if (entityId) check(entityId, o.body.translation());
        }
      }
      for (const id of nowInside) {
        if (!state.inside.has(id)) {
          this.pendingEvents.push({ tick: this.tick, type: "triggerEnter", triggerId: def.id, entityId: id });
        }
      }
      for (const id of state.inside) {
        if (!nowInside.has(id)) {
          this.pendingEvents.push({ tick: this.tick, type: "triggerExit", triggerId: def.id, entityId: id });
        }
      }
      state.inside = nowInside;
    }
  }

  pullEvents(): SimEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  snapshot(): CoreSnapshot {
    const entities: EntitySnapshot[] = [];
    for (const id of this.physics.entityIds()) {
      const t = this.physics.getEntityTransform(id);
      if (!t) continue;
      entities.push({
        id,
        p: [round3(t.position.x), round3(t.position.y), round3(t.position.z)],
        q: [round3(t.quaternion.x), round3(t.quaternion.y), round3(t.quaternion.z), round5(t.quaternion.w)],
      });
    }
    const holds: Array<{ owner: string; objectId: string }> = [];
    for (const o of this.worldObjects) {
      const owner = this.ownershipRef.ownerOf(o.collider.handle);
      if (owner) holds.push({ owner, objectId: o.id });
    }
    return {
      schemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      physicsVersion: RAPIER.version(),
      tick: this.tick,
      entities,
      holds,
    };
  }

  stateHash(opts: { includeMatch?: boolean } = {}): string {
    const snap = this.snapshot();
    return fnv1a(JSON.stringify({
      entities: snap.entities,
      holds: snap.holds,
      velocities: this.velocitySamples(),
      objectStates: [...this.objectStates.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      match: opts.includeMatch === false ? undefined : this.matchInfo(),
    }));
  }

  quantizedStateHash(): string {
    const entities: Array<{ id: string; p: number[]; q: number[] }> = [];
    for (const id of this.physics.entityIds()) {
      const t = this.physics.getEntityTransform(id);
      if (!t) continue;
      entities.push({
        id,
        p: [q2(t.position.x), q2(t.position.y), q2(t.position.z)],
        q: [q2(t.quaternion.x), q2(t.quaternion.y), q2(t.quaternion.z), q2(t.quaternion.w)],
      });
    }
    const holds: Array<{ owner: string; objectId: string }> = [];
    for (const o of this.worldObjects) {
      const owner = this.ownershipRef.ownerOf(o.collider.handle);
      if (owner) holds.push({ owner, objectId: o.id });
    }
    return fnv1a(JSON.stringify({
      entities,
      holds,
      velocities: this.velocitySamples(true),
      objectStates: [...this.objectStates.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      match: this.matchInfo(),
    }));
  }

  private velocitySamples(coarse = false): Array<{ id: string; vx: number; vz: number; wy: number }> {
    const round = coarse ? q2 : round3;
    const out: Array<{ id: string; vx: number; vz: number; wy: number }> = [];
    for (const [index, slot] of this.slots) {
      const v = slot.body.linvel();
      const w = slot.body.angvel();
      out.push({ id: `robot-${index}`, vx: round(v.x), vz: round(v.z), wy: round(w.y) });
    }
    for (const o of this.worldObjects) {
      const v = o.body.linvel();
      out.push({ id: `obj-${o.id}`, vx: round(v.x), vz: round(v.z), wy: round(o.body.angvel().y) });
    }
    return out;
  }

  configHashes(): Record<string, string> {
    // Robot roster/spec identity is part of the determinism contract: a replay
    // recorded against different chassis must not pass preflight.
    const roster = [...this.rosterSpecs]
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ slot: r.index, spec: this.canonicalize(r.spec) }));
    return {
      arena: fnv1a(JSON.stringify(this.arena)),
      competition: fnv1a(JSON.stringify(this.competition)),
      profile: fnv1a(JSON.stringify(this.profile)),
      robots: fnv1a(JSON.stringify(roster)),
    };
  }

  /** Deeply key-sorted JSON so property order never changes a hash. */
  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.canonicalize(v));
    if (typeof value === "object" && value !== null) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        out[k] = this.canonicalize((value as Record<string, unknown>)[k]);
      }
      return out;
    }
    return value;
  }

  gripStatus(slot: number): { holding: boolean; heldId: string | null; hasGripper: boolean } {
    const g = this.slots.get(slot)?.gripper;
    return { holding: g?.isHolding ?? false, heldId: g?.heldId ?? null, hasGripper: !!g };
  }

  private toggleGrip(slot: number): void {
    const s = this.slots.get(slot);
    if (!s?.gripper) return;
    if (s.gripper.isHolding) {
      s.gripper.release(s.body.linvel());
    } else {
      s.gripper.tryGrab(s.body, this.worldObjects);
    }
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}
function q2(n: number): number {
  return Math.round(n * 100) / 100;
}

