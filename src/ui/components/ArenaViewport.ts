import * as THREE from "three";
import type { CameraRig } from "../../sim/CameraRig";
import type { AppController } from "../../app/AppController";
import type { UiSnapshot } from "../../app/types";

export interface ArenaViewportOptions {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  cameraRig: CameraRig;
  controller: AppController;
}

export class ArenaViewport {
  readonly card: HTMLDivElement;
  readonly canvasContainer: HTMLDivElement;
  private resizeObserver: ResizeObserver | null = null;
  private isDisposed = false;

  private btnTopView: HTMLButtonElement;
  private btn3DView: HTMLButtonElement;
  private btnFollow: HTMLButtonElement;
  private btnMeasure: HTMLButtonElement;
  private btnResetCam: HTMLButtonElement;
  private btnFullscreen: HTMLButtonElement;
  private legendEl: HTMLDivElement;

  private renderer: THREE.WebGLRenderer;
  private cameraRig: CameraRig;
  private controller: AppController;

  constructor(opts: ArenaViewportOptions) {
    this.renderer = opts.renderer;
    this.cameraRig = opts.cameraRig;
    this.controller = opts.controller;

    this.card = document.createElement("div");
    this.card.className = "arena-card";
    this.card.setAttribute("role", "region");
    this.card.setAttribute("aria-label", "Arena Simulation Viewport");

    // Header & Toolbar
    const header = document.createElement("div");
    header.className = "arena-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "arena-title-group";

    const title = document.createElement("h2");
    title.className = "arena-title";
    title.textContent = "Arena Simulation";

    const subtitle = document.createElement("div");
    subtitle.className = "arena-subtitle";
    subtitle.innerHTML = `<span class="arena-name">ABU ROBOCON 2027 Arena</span> <span class="badge badge-provisional">Provisional Inferred</span>`;

    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);
    header.appendChild(titleGroup);

    const toolbar = document.createElement("div");
    toolbar.className = "arena-toolbar";

    // Segmented camera view control
    const segControl = document.createElement("div");
    segControl.className = "segmented-control";
    this.btn3DView = document.createElement("button");
    this.btn3DView.className = "seg-btn active";
    this.btn3DView.textContent = "3D View";
    this.btn3DView.setAttribute("aria-pressed", "true");
    this.btn3DView.addEventListener("click", () => this.controller.setCameraView("perspective"));

    this.btnTopView = document.createElement("button");
    this.btnTopView.className = "seg-btn";
    this.btnTopView.textContent = "Top View";
    this.btnTopView.setAttribute("aria-pressed", "false");
    this.btnTopView.addEventListener("click", () => this.controller.setCameraView("top"));

    segControl.appendChild(this.btn3DView);
    segControl.appendChild(this.btnTopView);
    toolbar.appendChild(segControl);

    // Follow camera
    this.btnFollow = document.createElement("button");
    this.btnFollow.className = "control-btn";
    this.btnFollow.textContent = "Follow";
    this.btnFollow.setAttribute("aria-pressed", "false");
    this.btnFollow.addEventListener("click", () => {
      const isFollowing = this.cameraRig.isFollowing();
      const targetSlot = isFollowing ? null : this.controller.store.snapshot.activeSlot;
      this.controller.setFollow(targetSlot);
    });
    toolbar.appendChild(this.btnFollow);

    // Measure tool
    this.btnMeasure = document.createElement("button");
    this.btnMeasure.className = "control-btn";
    this.btnMeasure.id = "btn-measure";
    this.btnMeasure.textContent = "Measure";
    this.btnMeasure.setAttribute("aria-pressed", "false");
    this.btnMeasure.addEventListener("click", () => {
      const measuring = !this.controller.store.snapshot.camera.measuring;
      this.controller.adapter.setMeasuring(measuring);
      this.btnMeasure.setAttribute("aria-pressed", String(measuring));
      this.btnMeasure.classList.toggle("active", measuring);
      const measureHud = document.getElementById("measure-hud");
      if (measureHud) measureHud.hidden = !measuring;
    });
    toolbar.appendChild(this.btnMeasure);

    // Reset camera
    this.btnResetCam = document.createElement("button");
    this.btnResetCam.className = "control-btn";
    this.btnResetCam.textContent = "Reset Cam";
    this.btnResetCam.addEventListener("click", () => this.controller.resetCamera());
    toolbar.appendChild(this.btnResetCam);

    // Fullscreen
    this.btnFullscreen = document.createElement("button");
    this.btnFullscreen.className = "control-btn";
    this.btnFullscreen.textContent = "Fullscreen";
    this.btnFullscreen.addEventListener("click", () => this.toggleFullscreen());
    toolbar.appendChild(this.btnFullscreen);

    header.appendChild(toolbar);
    this.card.appendChild(header);

    // Canvas Container
    this.canvasContainer = document.createElement("div");
    this.canvasContainer.className = "canvas-container";
    this.canvasContainer.appendChild(opts.canvas);
    this.card.appendChild(this.canvasContainer);

    // Legend
    this.legendEl = document.createElement("div");
    this.legendEl.className = "arena-legend";
    this.legendEl.innerHTML = `
      <span class="legend-item"><span class="legend-dot dot-red"></span> Red Team (R1)</span>
      <span class="legend-item"><span class="legend-dot dot-blue"></span> Blue Team (R2)</span>
      <span class="legend-item"><span class="legend-dot dot-object"></span> Silo / Objects</span>
      <span class="legend-item"><span class="legend-dot dot-zone"></span> Scored Zones</span>
    `;
    this.card.appendChild(this.legendEl);

    opts.container.appendChild(this.card);
    this.setupResizeObserver();
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.isDisposed) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;
        this.updateSize(width, height);
      }
    });

    this.resizeObserver.observe(this.canvasContainer);
  }

  updateSize(width: number, height: number): void {
    if (this.isDisposed || width <= 0 || height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.cameraRig.resize(width, height);
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      if (this.card.requestFullscreen) {
        this.card.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  updateFromSnapshot(snap: UiSnapshot): void {
    const isTop = snap.camera.view === "top";
    this.btnTopView.classList.toggle("active", isTop);
    this.btnTopView.setAttribute("aria-pressed", String(isTop));
    this.btn3DView.classList.toggle("active", !isTop);
    this.btn3DView.setAttribute("aria-pressed", String(!isTop));

    const isFollowing = snap.camera.following !== null;
    this.btnFollow.classList.toggle("active", isFollowing);
    this.btnFollow.setAttribute("aria-pressed", String(isFollowing));

    this.btnMeasure.classList.toggle("active", snap.camera.measuring);
    this.btnMeasure.setAttribute("aria-pressed", String(snap.camera.measuring));
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
