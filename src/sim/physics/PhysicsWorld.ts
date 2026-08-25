import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { ArenaConfig, ObjectSpawnDef, StaticPropDef } from "../types";
import { shapeToColliderDesc, poseToQuaternion, shapeVolume } from "../geometry";
import {
  CG_OBJECT,
  ALL_ROBOT_BITS,
  CG_STATIC,
  staticGroups,
  collisionGroup,
} from "./collisionGroups";

export interface TrackedEntity {
  id: string;
  body: RAPIER.RigidBody;
  mesh?: THREE.Object3D;
}

export interface DynamicObject {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export interface EntityTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function disposeObjectDeep(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.map) std.map.dispose();
      m.dispose();
    }
  });
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  fixedDt = 1 / 60;
  private accumulator = 0;
  private entities = new Map<string, TrackedEntity>();

  constructor(gravity = { x: 0, y: -9.81, z: 0 }) {
    this.world = new RAPIER.World(gravity);
    this.world.timestep = this.fixedDt;
  }

  setSolverHz(hz: number): void {
    if (hz <= 0) return;
    this.fixedDt = 1 / hz;
    this.world.timestep = this.fixedDt;
  }

  static async init(): Promise<void> {
    await RAPIER.init();
  }

  buildStaticFromArena(arena: ArenaConfig): void {
    const { width: w, length: l } = arena.dimensions;
    const h = arena.dimensions.wallHeight ?? 0.15;
    const t = arena.dimensions.wallThickness ?? 0.1;
    const friction = arena.surfaces.defaultFriction;

    this.addStaticCuboid(w + t * 2, 0.2, l + t * 2, 0, -0.1, 0, friction);

    const walls: Array<[number, number, number, number]> = [
      [w + t * 2, t, 0, -(l / 2 + t / 2)],
      [w + t * 2, t, 0, l / 2 + t / 2],
      [t, l, -(w / 2 + t / 2), 0],
      [t, l, w / 2 + t / 2, 0],
    ];
    for (const [sw, sl, x, z] of walls) {
      this.addStaticCuboid(sw, h, sl, x, h / 2, z, friction);
    }

    for (const prop of arena.staticProps) {
      this.addStaticProp(prop, friction);
    }
  }

  addStaticCuboid(hw: number, hh: number, hl: number, x: number, y: number, z: number, friction: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const g = staticGroups();
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw / 2, hh / 2, hl / 2)
        .setFriction(friction)
        .setCollisionGroups(collisionGroup(g.membership, g.filter)),
      body,
    );
  }

  addStaticProp(prop: StaticPropDef, friction: number): void {
    const quat = poseToQuaternion(prop.pose);
    const y = prop.pose.y ?? prop.size.h / 2;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(prop.pose.x, y, prop.pose.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }),
    );
    const desc = shapeToColliderDesc("box", prop.size).setFriction(friction);
    const g = staticGroups();
    desc.setCollisionGroups(collisionGroup(g.membership, g.filter));
    this.world.createCollider(desc, body);
  }

  addDynamicObject(spawn: ObjectSpawnDef, friction: number, restitution = 0.25): DynamicObject {
    const r = spawn.render;
    const size = r?.size ?? { w: 0.15, h: 0.15, d: 0.15 };
    const kind = r?.shape ?? "box";
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.pose.x, spawn.pose.y, spawn.pose.z)
      .setLinearDamping(0.4)
      .setAngularDamping(0.6);
    const body = this.world.createRigidBody(desc);
    const collider = shapeToColliderDesc(kind, size).setFriction(friction);
    collider.setRestitution(restitution);
    const volume = Math.max(shapeVolume(kind, size), 1e-6);
    collider.setDensity(spawn.massKg !== undefined ? spawn.massKg / volume : 600);
    collider.setCollisionGroups(collisionGroup(CG_OBJECT, CG_OBJECT | ALL_ROBOT_BITS | CG_STATIC));
    const handle = this.world.createCollider(collider, body);
    return { body, collider: handle };
  }

  registerEntity(id: string, body: RAPIER.RigidBody, mesh?: THREE.Object3D): void {
    this.unregisterEntity(id);
    this.entities.set(id, { id, body, mesh });
  }

  attachMesh(id: string, mesh: THREE.Object3D): boolean {
    const e = this.entities.get(id);
    if (!e) return false;
    e.mesh = mesh;
    return true;
  }

  unregisterEntity(id: string, opts: { removeBody?: boolean; disposeMesh?: boolean } = {}): boolean {
    const e = this.entities.get(id);
    if (!e) return false;
    this.entities.delete(id);
    if (opts.removeBody ?? true) this.world.removeRigidBody(e.body);
    if (e.mesh) {
      e.mesh.parent?.remove(e.mesh);
      if (opts.disposeMesh ?? true) disposeObjectDeep(e.mesh);
    }
    return true;
  }

  getEntity(id: string): TrackedEntity | undefined {
    return this.entities.get(id);
  }

  getEntityTransform(id: string): EntityTransform | null {
    const e = this.entities.get(id);
    if (!e) return null;
    const p = e.body.translation();
    const r = e.body.rotation();
    return {
      position: new THREE.Vector3(p.x, p.y, p.z),
      quaternion: new THREE.Quaternion(r.x, r.y, r.z, r.w),
    };
  }

  entityIds(): string[] {
    return [...this.entities.keys()];
  }

  /**
   * Fixed-timestep loop. `onBeforeStep` runs before each world.step (command
   * application / actuation); returning false skips the remaining steps.
   * `onAfterStep` runs after each world.step (scoring, bookkeeping); returning
   * false halts the loop once the current step has fully completed.
   */
  advance(
    frameDt: number,
    onBeforeStep?: (dt: number) => boolean | void,
    onAfterStep?: (dt: number) => boolean | void,
  ): void {
    this.accumulator += Math.min(frameDt, 0.25);
    while (this.accumulator >= this.fixedDt) {
      const haltBefore = onBeforeStep?.(this.fixedDt);
      if (haltBefore === false) {
        this.accumulator = 0;
        break;
      }
      this.world.step();
      this.syncMeshes();
      this.accumulator -= this.fixedDt;
      const haltAfter = onAfterStep?.(this.fixedDt);
      if (haltAfter === false) {
        this.accumulator = 0;
        break;
      }
    }
  }

  syncMeshes(): void {
    for (const { body, mesh } of this.entities.values()) {
      if (!mesh) continue;
      const p = body.translation();
      const r = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  resetAccumulator(): void {
    this.accumulator = 0;
  }
}
