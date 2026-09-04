import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ArenaConfig } from "./types";
import { yawFromQuaternion } from "./orientation";
import type { EntityTransform } from "./physics/PhysicsWorld";

const FOLLOW_BACK_M = 4;
const FOLLOW_UP_M = 2.4;

export class CameraRig {
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly homePos: THREE.Vector3;
  private readonly homeTarget: THREE.Vector3;
  private readonly orthoBaseSpan: number;
  private followId: string | null = null;
  private usingOrtho = false;
  private resolver: ((id: string) => EntityTransform | null) | null = null;

  constructor(domElement: HTMLElement, arena: ArenaConfig) {
    const w = domElement.clientWidth;
    const h = Math.max(1, domElement.clientHeight);
    const aspect = w / h;

    this.persp = new THREE.PerspectiveCamera(55, aspect, 0.05, 200);
    this.homeTarget = new THREE.Vector3(0, 0, 0);
    this.homePos = new THREE.Vector3(
      arena.dimensions.width * 0.65,
      arena.dimensions.length * 0.6,
      arena.dimensions.length * 0.85,
    );
    this.persp.position.copy(this.homePos);

    const span = (Math.max(arena.dimensions.width, arena.dimensions.length) / 2) * 1.15 + 1;
    const halfH = aspect >= 1 ? span / aspect : span;
    const halfW = aspect >= 1 ? span : span * aspect;
    this.ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 100);
    this.orthoBaseSpan = span;
    this.ortho.position.set(0, 30, 0);
    this.ortho.lookAt(0, 0, 0);
    this.ortho.updateProjectionMatrix();

    this.controls = new OrbitControls(this.persp, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 60;
    this.controls.target.copy(this.homeTarget);

    domElement.addEventListener(
      "wheel",
      (e) => {
        if (!this.usingOrtho) return;
        e.preventDefault();
        this.ortho.zoom = Math.min(6, Math.max(0.3, this.ortho.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
        this.ortho.updateProjectionMatrix();
      },
      { passive: false },
    );
  }

  setEntityResolver(resolver: (id: string) => EntityTransform | null): void {
    this.resolver = resolver;
  }

  get camera(): THREE.Camera {
    return this.usingOrtho ? this.ortho : this.persp;
  }

  isTopView(): boolean {
    return this.usingOrtho;
  }

  setTopView(top: boolean): void {
    if (this.usingOrtho !== top) {
      this.toggleTopView();
    }
  }

  toggleTopView(): boolean {
    this.usingOrtho = !this.usingOrtho;
    if (this.usingOrtho) {
      this.followId = null;
      this.ortho.position.set(0, 30, 0);
      this.ortho.lookAt(0, 0, 0);
    }
    this.controls.enabled = !this.usingOrtho && this.followId === null;
    return this.usingOrtho;
  }

  setFollow(id: string | null): void {
    this.followId = id;
    if (id !== null) this.usingOrtho = false;
    this.controls.enabled = id === null && !this.usingOrtho;
  }

  isFollowing(): boolean {
    return this.followId !== null;
  }

  getFollowingId(): string | null {
    return this.followId;
  }

  reset(): void {
    this.followId = null;
    this.usingOrtho = false;
    this.controls.enabled = true;
    this.persp.up.set(0, 1, 0);
    this.persp.position.copy(this.homePos);
    this.controls.target.copy(this.homeTarget);
    this.controls.update();
  }

  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    const halfH = this.orthoBaseSpan / (aspect >= 1 ? 1 : 1 / aspect) / (aspect >= 1 ? aspect : 1);
    const newHalfH = aspect >= 1 ? this.orthoBaseSpan / aspect : this.orthoBaseSpan;
    const newHalfW = aspect >= 1 ? this.orthoBaseSpan : this.orthoBaseSpan * aspect;
    void halfH;
    this.ortho.left = -newHalfW;
    this.ortho.right = newHalfW;
    this.ortho.top = newHalfH;
    this.ortho.bottom = -newHalfH;
    this.ortho.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.usingOrtho) return;

    if (this.followId && this.resolver) {
      const t = this.resolver(this.followId);
      if (t) {
        const yaw = yawFromQuaternion(t.quaternion);
        const backX = -Math.sin(yaw) * FOLLOW_BACK_M;
        const backZ = -Math.cos(yaw) * FOLLOW_BACK_M;
        const k = 1 - Math.exp(-6 * dt);
        const desired = t.position.clone().add(new THREE.Vector3(backX, FOLLOW_UP_M, backZ));
        this.persp.position.lerp(desired, k);
        this.controls.target.lerp(t.position, k);
        this.persp.lookAt(t.position);
      }
      return;
    }
    this.controls.update();
  }
}
