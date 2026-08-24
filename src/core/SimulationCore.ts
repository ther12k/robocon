import RAPIER from "@dimforge/rapier3d-compat";
import type { ArenaConfig, CompetitionRuleset, DriveCommand, RobotSpec, SimulationProfile } from "../sim/types";
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
import { quatFromEulerYXZ } from "../sim/orientation";

export const ENGINE_VERSION = "0.1.0";

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

interface ObjectSpawnSnapshot {
  p: { x: number; y: number; z: number };
  q: { x: number; y: number; z: number; w: number };
}

interface TriggerState {
  inside: Set<string>;
}

export class SimulationCore {
  physics: PhysicsWorld;
  readonly bus = new CommandBus();
  readonly arena: ArenaConfig;
  readonly competition: CompetitionRuleset;
  readonly profile: SimulationProfile;
  private slots = new Map<number, Slot>();
  private worldObjects: GrabCandidate[] = [];
  private objectEntityIds = new Map<number, string>();
  private objectSpawns = new Map<number, ObjectSpawnSnapshot>();
  private triggers = new Map<string, TriggerState>();
  private pendingEvents: SimEvent[] = [];
  private tick = 0;
  inputGateEnabled = false;
  private replayCheckpoints: ReplayCheckpoint[] = [];
  private checkpointIntervalTicks = 0;
  private initialStateAtCapture = "";
  private replayCmds: Map<number, CommandAction[]> | null = null;
  private replayVerify: Map<number, string> | null = null;
  private replayTotalTicks = 0;
  private replayCompleted = false;
  private replayDesyncTick: number | null = null;

  constructor(arena: ArenaConfig, competition: CompetitionRuleset, profile: SimulationProfile) {
    this.arena = arena;
    this.competition = competition;
    this.profile = profile;
    this.physics = this.buildSession();
    for (const t of arena.triggers ?? []) this.triggers.set(t.id, { inside: new Set() });
    this.bus.setHandler((action) => this.handleAction(action));
  }

  private buildSession(): PhysicsWorld {
    const physics = new PhysicsWorld({ x: 0, y: -9.81, z: 0 });
    if (this.profile.solverHz && this.profile.solverHz !== 60) {
      (physics as { fixedDt: number }).fixedDt = 1 / this.profile.solverHz;
      physics.world.timestep = physics.fixedDt;
    }
    this.physics = physics;
    physics.buildStaticFromArena(this.arena);
    this.worldObjects = [];
    this.objectEntityIds = new Map();
    this.objectSpawns = new Map();
    for (const spawn of this.arena.objectSpawns) {
      const obj = physics.addDynamicObject(spawn, this.arena.surfaces.defaultFriction);
      const entityId = `obj-${spawn.objectId}`;
      physics.registerEntity(entityId, obj.body);
      this.worldObjects.push({ id: spawn.objectId, body: obj.body, collider: obj.collider });
      this.objectEntityIds.set(obj.collider.handle, entityId);
      this.objectSpawns.set(obj.collider.handle, {
        p: { x: spawn.pose.x, y: spawn.pose.y, z: spawn.pose.z },
        q: { x: 0, y: 0, z: 0, w: 1 },
      });
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
    if (this.inputGateEnabled && (action.kind === "axes" || action.kind === "grabToggle")) return false;
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
  }

  removeRobot(index: number): void {
    const slot = this.slots.get(index);
    if (!slot) return;
    slot.gripper?.release(slot.body.linvel());
    this.physics.unregisterEntity(`robot-${index}`);
    this.slots.delete(index);
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

  busReplayInject(action: Parameters<CommandBus["enqueue"]>[0]): void {
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
    this.physics.advance(frameDt, (dt) => {
      const halt = this.onFixedTick();
      for (const fn of this.postStepListeners) fn(dt);
      return halt;
    });
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
    this.checkpointIntervalTicks = checkpointIntervalTicks;
    this.initialStateAtCapture = this.stateHash();
  }

  endReplayCapture(): ReplayFile {
    const commands = this.bus.stopRecording();
    const file: ReplayFile = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      physicsVersion: RAPIER.version(),
      fixedDt: this.physics.fixedDt,
      configHashes: this.configHashes(),
      initialStateHash: this.initialStateAtCapture,
      checkpointIntervalTicks: this.checkpointIntervalTicks,
      checkpoints: [...this.replayCheckpoints],
      totalTicks: this.tick,
      finalStateHash: this.stateHash(),
      commands,
    };
    this.checkpointIntervalTicks = 0;
    this.initialStateAtCapture = "";
    return file;
  }

  replayRuntimeInfo(): ReplayRuntimeInfo {
    return {
      engineVersion: ENGINE_VERSION,
      physicsVersion: RAPIER.version(),
      fixedDt: this.physics.fixedDt,
      configHashes: this.configHashes(),
      initialStateHash: this.stateHash(),
    };
  }

  matchInfo(): {
    phase: string;
    timeRemainingSec: number;
    scores: { red: number; blue: number };
  } {
    const info = this._matchInfoProvider?.();
    return (
      info ?? { phase: "idle", timeRemainingSec: 0, scores: { red: 0, blue: 0 } }
    );
  }

  setMatchInfoProvider(provider: () => {
    phase: string;
    timeRemainingSec: number;
    scores: { red: number; blue: number };
  }): void {
    this._matchInfoProvider = provider;
  }
  private _matchInfoProvider?: () => {
    phase: string;
    timeRemainingSec: number;
    scores: { red: number; blue: number };
  };

  resetRobotsToSpawns(): void {
    for (const [, slot] of this.slots) {
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

  resetObjectsToSpawns(): void {
    for (const o of this.worldObjects) {
      if (this.ownershipRef.isHeld(o.collider.handle)) continue;
      const spawn = this.objectSpawns.get(o.collider.handle);
      if (!spawn) continue;
      o.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      o.body.setTranslation(spawn.p, true);
      o.body.setRotation(spawn.q, true);
      o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
    try {
      oldWorld.free();
    } catch {
      // world.free() is unavailable on some Rapier builds; GC will reclaim
    }
    for (const st of this.triggers.values()) st.inside = new Set();
    this.pendingEvents = [];
    this.replayCmds = null;
    this.replayVerify = null;
    this.replayCompleted = false;
    this.replayDesyncTick = null;
    this.tick = 0;
    this.bus.resetQueue();
  }

  startReplayPlayback(file: ReplayFile): ReplayCompatibilityIssue[] {
    this.resetForReplay();
    const issues = checkReplayCompatibility(file, this.replayRuntimeInfo());
    if (issues.length > 0) return issues;
    const map = new Map<number, CommandAction[]>();
    for (const c of file.commands) {
      const list = map.get(c.tick) ?? [];
      list.push(c.action);
      map.set(c.tick, list);
    }
    this.replayCmds = map;
    this.replayVerify = new Map(file.checkpoints.map((c) => [c.tick, c.hash]));
    this.replayTotalTicks = file.totalTicks;
    this.inputGateEnabled = true;
    return [];
  }

  stopReplayPlayback(): void {
    this.replayCmds = null;
    this.replayVerify = null;
    this.inputGateEnabled = false;
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

  slotTeam(slot: number): "red" | "blue" | undefined {
    return this.slots.get(slot)?.spec.team;
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

  private onFixedTick(): boolean {
    const injected = this.replayCmds?.get(this.tick);
    if (injected) for (const a of injected) this.applyAction(a);
    this.bus.setTick(this.tick);
    this.bus.drain();
    for (const [, slot] of this.slots) {
      applyDrive(slot.body, slot.spec, slot.axes, this.physics.fixedDt);
      slot.gripper?.update(slot.body);
    }
    this.evaluateTriggers();
    if (
      this.checkpointIntervalTicks > 0 &&
      this.bus.isRecording() &&
      this.tick % this.checkpointIntervalTicks === 0
    ) {
      this.replayCheckpoints.push({ tick: this.tick, hash: this.quantizedStateHash() });
    }
    this.tick += 1;
    if (this.replayCmds) {
      const expected = this.replayVerify?.get(this.tick - 1);
      if (expected !== undefined && this.quantizedStateHash() !== expected) {
        this.replayDesyncTick = this.tick - 1;
        this.stopReplayPlayback();
        return false;
      }
      if (this.tick >= this.replayTotalTicks) {
        this.stopReplayPlayback();
        this.replayCompleted = true;
        return false;
      }
    }
    return true;
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

  stateHash(): string {
    const snap = this.snapshot();
    return fnv1a(JSON.stringify({ entities: snap.entities, holds: snap.holds }));
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
    return fnv1a(JSON.stringify({ entities, holds }));
  }

  configHashes(): Record<string, string> {
    return {
      arena: fnv1a(JSON.stringify(this.arena)),
      competition: fnv1a(JSON.stringify(this.competition)),
      profile: fnv1a(JSON.stringify(this.profile)),
    };
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

