import type { AppController } from "../app/AppController";
import type { UiStore } from "../app/UiStore";
import type { UiSnapshot } from "../app/types";
import { PanelManager } from "./PanelManager";

export interface AppShellOptions {
  root: HTMLElement;
  controller: AppController;
  store: UiStore;
  panelManager: PanelManager;
}

export class AppShell {
  readonly root: HTMLElement;
  readonly controller: AppController;
  readonly store: UiStore;
  readonly panelManager: PanelManager;
  private unsubscribeStore?: () => void;

  constructor(opts: AppShellOptions) {
    this.root = opts.root;
    this.controller = opts.controller;
    this.store = opts.store;
    this.panelManager = opts.panelManager;
  }

  mount(): void {
    this.root.classList.add("light-shell");
    this.root.innerHTML = `
      <header class="app-header" role="banner">
        <div class="header-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
            <line x1="8" y1="16" x2="8" y2="16"></line>
            <line x1="16" y1="16" x2="16" y2="16"></line>
          </svg>
          <span>Robocon Arena Lab</span>
        </div>

        <nav class="header-nav" aria-label="Main Navigation">
          <button id="nav-practice" class="nav-link-btn active">Practice</button>
          <button id="btn-builder" class="nav-link-btn" title="Robot builder (B)">Robot Builder</button>
          <button id="btn-autonomy" class="nav-link-btn" title="Autonomy script editor (V)">Autonomy</button>
          <button id="btn-replay" class="nav-link-btn" title="Record / load deterministic replays">Replay</button>
        </nav>

        <div class="header-actions">
          <button id="btn-match-start" class="control-btn primary" title="Start match (Enter)">▶ Start Match</button>
          <button id="btn-preferences" class="control-btn" title="UI Preferences">⚙ Preferences</button>
          <span class="badge" id="session-badge">Local Session</span>
        </div>
      </header>

      <div id="match-banner" class="match-strip" hidden>
        <span class="score-badge red">Red Team: <strong id="score-red">0</strong></span>
        <div class="match-phase-box">
          <span id="match-phase" class="badge">IDLE</span>
          <span id="match-timer" class="mono">0:00</span>
          <span id="retries" class="muted">⟳ 3/3</span>
        </div>
        <span class="score-badge blue">Blue Team: <strong id="score-blue">0</strong></span>
      </div>

      <div id="measure-hud" class="measure-hud-box" hidden>
        <span id="measure-label">Click two points on the field</span>
      </div>

      <main class="workspace-container">
        <div class="workspace-grid">
          <!-- Left Column: Robot Controls & Autonomy -->
          <div class="workspace-col col-left">
            <div class="ui-card" id="robot-control-card">
              <h3 class="card-title">Robot Selection</h3>
              <div class="robot-selection-grid" id="robot-roster"></div>

              <hr style="border: 0; border-top: 1px solid var(--ui-border); margin: 4px 0;" />

              <h4 style="margin: 0; font-size: var(--ui-font-size-sm); color: var(--ui-muted);">Manual Control</h4>
              <div class="dpad-container">
                <button class="dpad-btn" id="dpad-up" title="Forward (W)">▲</button>
                <div class="dpad-row">
                  <button class="dpad-btn" id="dpad-left" title="Turn Left (Q)">◀</button>
                  <button class="dpad-stop-btn" id="dpad-stop" title="Stop (Space)">STOP</button>
                  <button class="dpad-btn" id="dpad-right" title="Turn Right (E)">▶</button>
                </div>
                <button class="dpad-btn" id="dpad-down" title="Reverse (S)">▼</button>
              </div>

              <div class="throttle-row">
                <span class="telemetry-label">Throttle: <strong id="throttle-val">50%</strong></span>
                <input type="range" min="0" max="100" value="50" step="5" class="throttle-slider" id="throttle-range" />
              </div>

              <div style="display: flex; gap: 8px;">
                <button class="control-btn" id="btn-precision-mode" style="flex: 1;">Precision: OFF</button>
                <button class="control-btn" id="btn-reset-robot" style="flex: 1;">Reset Robot</button>
              </div>
              <button class="control-btn primary" id="btn-grab-toggle">Grab / Release</button>
            </div>

            <div class="ui-card" id="quick-autonomy-card">
              <h3 class="card-title">
                Autonomy
                <span id="autonomy-status-pill" class="status-pill idle">Idle</span>
              </h3>
              <p style="margin: 0; font-size: var(--ui-font-size-xs); color: var(--ui-muted);">
                Trusted code only. Script runs in background worker thread.
              </p>
              <div style="display: flex; gap: 8px;">
                <button class="control-btn primary" id="btn-quick-run-script" style="flex: 1;">Run ▶</button>
                <button class="control-btn" id="btn-quick-stop-script" style="flex: 1;">Stop ■</button>
              </div>
            </div>
          </div>

          <!-- Center Column: Arena Viewport -->
          <div class="workspace-col col-center" id="arena-col"></div>

          <!-- Right Column: Telemetry & Status & Replay -->
          <div class="workspace-col col-right">
            <div class="ui-card" id="session-card">
              <h3 class="card-title">Session & Arena</h3>
              <div class="telemetry-grid">
                <div class="telemetry-metric">
                  <span class="telemetry-label">Arena</span>
                  <span class="telemetry-value" id="arena-name">—</span>
                </div>
                <div class="telemetry-metric">
                  <span class="telemetry-label">Session ID</span>
                  <span class="telemetry-value" id="session-id-val">#1</span>
                </div>
              </div>
              <div id="verify-warning" style="font-size: var(--ui-font-size-xs); color: var(--ui-warning);"></div>
            </div>

            <div class="ui-card" id="robot-telemetry-card">
              <h3 class="card-title">
                Telemetry
                <span class="badge" id="robot-team-badge">RED</span>
              </h3>
              <div class="telemetry-grid">
                <div class="telemetry-metric">
                  <span class="telemetry-label">Speed</span>
                  <span class="telemetry-value" id="robot-speed">0.00 m/s</span>
                </div>
                <div class="telemetry-metric">
                  <span class="telemetry-label">Heading</span>
                  <span class="telemetry-value" id="robot-heading">0.0°</span>
                </div>
                <div class="telemetry-metric">
                  <span class="telemetry-label">Position X, Z</span>
                  <span class="telemetry-value" id="robot-pose">0.00, 0.00 m</span>
                </div>
                <div class="telemetry-metric">
                  <span class="telemetry-label">Gripper</span>
                  <span class="telemetry-value" id="robot-grip-val">Empty</span>
                </div>
              </div>
              <div style="margin-top: 4px;">
                <span class="telemetry-label">Speed History (10Hz)</span>
                <canvas id="telemetry-canvas" height="56" style="width: 100%; border-radius: 6px; background: var(--ui-surface-soft); display: block; margin-top: 4px;"></canvas>
              </div>
            </div>

            <div class="ui-card" id="replay-card">
              <h3 class="card-title">Replay & Sharing</h3>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="control-btn" id="replay-record" style="flex: 1;">● Record</button>
                <button class="control-btn" id="replay-record-match" style="flex: 1;">● Match</button>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="control-btn primary" id="replay-play" disabled style="flex: 1;">Play ▶</button>
                <button class="control-btn" id="replay-stop" disabled style="flex: 1;">Stop ■</button>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="control-btn" id="replay-load" style="flex: 1;">Load JSON</button>
                <button class="control-btn" id="replay-share" disabled style="flex: 1;">Copy Link</button>
              </div>
              <input type="file" id="replay-file" accept=".json,application/json" hidden />
              <div id="replay-status" style="font-size: var(--ui-font-size-xs); color: var(--ui-muted);">
                Deterministic replay engine ready.
              </div>
            </div>

            <div class="ui-card" id="tips-card">
              <h3 class="card-title">Quick Reference</h3>
              <p style="margin: 0; font-size: var(--ui-font-size-xs); color: var(--ui-muted); line-height: 1.6;">
                <strong>W / S</strong> Forward & Reverse<br />
                <strong>Q / E</strong> Turn Left & Right<br />
                <strong>A / D</strong> Strafe (Holonomic drive)<br />
                <strong>Space</strong> Grab / Release Toggle<br />
                <strong>T</strong> Top-down / 3D camera
              </p>
            </div>
          </div>
        </div>
      </main>

      <!-- Drawers / Overlays for Script and Builder -->
      <div id="script-panel" class="drawer-panel" hidden>
        <div class="drawer-header">
          <h3 class="drawer-title">Autonomy Script — Slot <span id="script-slot">1</span></h3>
          <button class="drawer-close-btn" id="script-close">×</button>
        </div>
        <textarea id="script-code" class="builder-json" spellcheck="false" style="height: 240px; font-family: var(--ui-font-mono); font-size: var(--ui-font-size-xs); padding: 8px; border: 1px solid var(--ui-border); border-radius: 8px;"
          placeholder="function onTick(sense, api) {&#10;  api.setAxes(0.5, 0, 0);&#10;}"></textarea>
        <div style="display: flex; gap: 8px;">
          <button class="control-btn" id="script-load">Load .js</button>
          <button class="control-btn primary" id="script-run">Run ▶</button>
          <button class="control-btn" id="script-stop">Stop ■</button>
        </div>
        <input type="file" id="script-file" accept=".js,text/javascript" hidden />
        <div id="script-status" style="font-size: var(--ui-font-size-xs); color: var(--ui-muted);">
          Trusted code only — runs in a worker.
        </div>
      </div>

      <footer class="app-statusbar">
        <span id="fps">— fps</span>
        <span id="hint">Drag = orbit · Wheel = zoom · Space = grab · T = top view · F = follow</span>
      </footer>
    `;

    this.wireListeners();
  }

  private wireListeners(): void {
    // Navigation items
    const btnBuilder = document.getElementById("btn-builder");
    if (btnBuilder) {
      btnBuilder.addEventListener("click", () => {
        const isOpen = this.panelManager.isPanelOpen("builder");
        if (isOpen) this.panelManager.closePanel("builder");
        else this.panelManager.openPanel("builder", btnBuilder);
      });
    }

    const btnAutonomy = document.getElementById("btn-autonomy");
    if (btnAutonomy) {
      btnAutonomy.addEventListener("click", () => {
        const isOpen = this.panelManager.isPanelOpen("script");
        if (isOpen) this.panelManager.closePanel("script");
        else this.panelManager.openPanel("script", btnAutonomy);
      });
    }

    const scriptClose = document.getElementById("script-close");
    if (scriptClose) {
      scriptClose.addEventListener("click", () => this.panelManager.closePanel("script"));
    }

    // Manual D-pad controls
    const setupDpadBtn = (id: string, axes: { fwd: number; strafe: number; turn: number }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const start = () => {
        btn.classList.add("pressing");
        this.controller.submitManualAxes(undefined, axes);
      };
      const stop = () => {
        btn.classList.remove("pressing");
        this.controller.stopDriving();
      };
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        start();
      });
      btn.addEventListener("pointerup", stop);
      btn.addEventListener("pointercancel", stop);
      btn.addEventListener("pointerleave", stop);
    };

    setupDpadBtn("dpad-up", { fwd: 1, strafe: 0, turn: 0 });
    setupDpadBtn("dpad-down", { fwd: -1, strafe: 0, turn: 0 });
    setupDpadBtn("dpad-left", { fwd: 0, strafe: 0, turn: -1 });
    setupDpadBtn("dpad-right", { fwd: 0, strafe: 0, turn: 1 });

    const stopBtn = document.getElementById("dpad-stop");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => this.controller.stopDriving());
    }

    // Throttle range
    const throttleRange = document.getElementById("throttle-range") as HTMLInputElement;
    const throttleVal = document.getElementById("throttle-val");
    if (throttleRange && throttleVal) {
      throttleRange.addEventListener("input", () => {
        const val = parseInt(throttleRange.value, 10);
        throttleVal.textContent = `${val}%`;
        this.controller.setThrottle(val);
      });
    }

    // Precision mode toggle
    const btnPrecision = document.getElementById("btn-precision-mode");
    if (btnPrecision) {
      btnPrecision.addEventListener("click", () => {
        const isPrec = this.store.snapshot.precisionMode;
        this.controller.setPrecisionMode(!isPrec);
        btnPrecision.textContent = `Precision: ${!isPrec ? "ON" : "OFF"}`;
        btnPrecision.classList.toggle("active", !isPrec);
      });
    }

    // Grab toggle
    const btnGrab = document.getElementById("btn-grab-toggle");
    if (btnGrab) {
      btnGrab.addEventListener("click", () => this.controller.requestGrabOrRelease());
    }

    // Reset robot
    const btnResetRobot = document.getElementById("btn-reset-robot");
    if (btnResetRobot) {
      btnResetRobot.addEventListener("click", () => this.controller.resetSelectedRobot());
    }

    // Match Start
    const btnStartMatch = document.getElementById("btn-match-start");
    if (btnStartMatch) {
      btnStartMatch.addEventListener("click", () => this.controller.startMatch());
    }

    // Replay buttons
    const btnRecPractice = document.getElementById("replay-record");
    if (btnRecPractice) {
      btnRecPractice.addEventListener("click", () => this.controller.startRecording("practice"));
    }

    const btnRecMatch = document.getElementById("replay-record-match");
    if (btnRecMatch) {
      btnRecMatch.addEventListener("click", () => this.controller.startRecording("match"));
    }

    const btnPlayReplay = document.getElementById("replay-play");
    if (btnPlayReplay) {
      btnPlayReplay.addEventListener("click", () => this.controller.playReplay());
    }

    const btnStopReplay = document.getElementById("replay-stop");
    if (btnStopReplay) {
      btnStopReplay.addEventListener("click", () => {
        if (this.store.snapshot.replay.state === "recording") {
          this.controller.stopAndExport();
        } else {
          this.controller.stopReplay();
        }
      });
    }

    const btnShareReplay = document.getElementById("replay-share");
    if (btnShareReplay) {
      btnShareReplay.addEventListener("click", async () => {
        const res = await this.controller.copyReplayLink();
        if (res.ok) {
          const status = document.getElementById("replay-status");
          if (status) status.textContent = "Share link copied to clipboard!";
        }
      });
    }

    // Panel Manager subscriber to toggle visibility
    this.panelManager.onPanelChange((active) => {
      const scriptPanel = document.getElementById("script-panel");
      if (scriptPanel) scriptPanel.hidden = active !== "script";

      const builderPanel = document.getElementById("builder-panel");
      if (builderPanel) builderPanel.hidden = active !== "builder";

      if (btnBuilder) btnBuilder.classList.toggle("active", active === "builder");
      if (btnAutonomy) btnAutonomy.classList.toggle("active", active === "script");
    });

    // Subscribe to store updates
    this.unsubscribeStore = this.store.subscribe((snap) => this.renderFromSnapshot(snap));
  }

  private renderFromSnapshot(snap: UiSnapshot): void {
    // Render roster
    const rosterEl = document.getElementById("robot-roster");
    if (rosterEl) {
      rosterEl.innerHTML = "";
      for (const r of snap.robots) {
        const item = document.createElement("div");
        item.className = `robot-card-item ${r.slot === snap.activeSlot ? "selected" : ""}`;
        item.setAttribute("role", "button");
        item.setAttribute("aria-pressed", String(r.slot === snap.activeSlot));
        item.innerHTML = `
          <div class="robot-card-info">
            <span class="robot-card-name">${r.name} (Slot ${r.slot})</span>
            <span class="robot-card-meta">${r.team.toUpperCase()} · ${r.role} · ${r.driveType}</span>
          </div>
          <span class="status-pill ${r.isDriving ? "success" : "idle"}">${r.isDriving ? "Driving" : "Idle"}</span>
        `;
        item.addEventListener("click", () => this.controller.selectRobot(r.slot));
        rosterEl.appendChild(item);
      }
    }

    // Match banner
    const matchBanner = document.getElementById("match-banner");
    if (matchBanner) {
      matchBanner.hidden = snap.match.phase === "idle";
      const scoreRed = document.getElementById("score-red");
      const scoreBlue = document.getElementById("score-blue");
      const matchPhase = document.getElementById("match-phase");
      const matchTimer = document.getElementById("match-timer");
      const retries = document.getElementById("retries");
      if (scoreRed) scoreRed.textContent = String(snap.match.scoreRed);
      if (scoreBlue) scoreBlue.textContent = String(snap.match.scoreBlue);
      if (matchPhase) matchPhase.textContent = snap.match.phase.toUpperCase();
      if (matchTimer) {
        const m = Math.floor(snap.match.timeRemainingSec / 60);
        const s = snap.match.timeRemainingSec % 60;
        matchTimer.textContent = `${m}:${s.toString().padStart(2, "0")}`;
      }
      if (retries) retries.textContent = `⟳ ${snap.match.retriesRed}/${snap.match.maxRetries}`;
    }

    // Telemetry
    if (snap.telemetry.status === "available") {
      const t = snap.telemetry.value;
      const spd = document.getElementById("robot-speed");
      const heading = document.getElementById("robot-heading");
      const pose = document.getElementById("robot-pose");
      const grip = document.getElementById("robot-grip-val");
      const badge = document.getElementById("robot-team-badge");

      if (spd) spd.textContent = `${t.speed.toFixed(2)} m/s`;
      if (heading) heading.textContent = `${t.headingDeg.toFixed(1)}°`;
      if (pose) pose.textContent = `${t.posX.toFixed(2)}, ${t.posZ.toFixed(2)} m`;
      if (grip) grip.textContent = t.gripper === "holding" ? `Holding (${t.heldObjectId ?? ""})` : t.gripper === "empty" ? "Empty" : "Not Installed";
      if (badge) {
        badge.textContent = t.team.toUpperCase();
        badge.style.backgroundColor = t.team === "red" ? "var(--ui-team-red)" : "var(--ui-team-blue)";
        badge.style.color = "#ffffff";
      }
    }

    // Replay card controls
    const playBtn = document.getElementById("replay-play") as HTMLButtonElement;
    const stopBtn = document.getElementById("replay-stop") as HTMLButtonElement;
    const shareBtn = document.getElementById("replay-share") as HTMLButtonElement;
    const recBtn = document.getElementById("replay-record") as HTMLButtonElement;
    const recMatchBtn = document.getElementById("replay-record-match") as HTMLButtonElement;
    const replayStatus = document.getElementById("replay-status");

    if (playBtn) playBtn.disabled = snap.replay.state === "playing" || snap.replay.state === "recording" || !snap.replay.compatible;
    if (stopBtn) stopBtn.disabled = snap.replay.state !== "playing" && snap.replay.state !== "recording";
    if (shareBtn) shareBtn.disabled = !snap.replay.shareable || snap.replay.state === "recording";
    if (recBtn) recBtn.disabled = snap.replay.state === "playing" || snap.replay.state === "recording" || snap.match.phase !== "idle";
    if (recMatchBtn) recMatchBtn.disabled = snap.replay.state === "playing" || snap.replay.state === "recording";

    if (replayStatus) {
      if (snap.replay.state === "recording") {
        replayStatus.textContent = `Recording (${snap.replay.currentTick} ticks, ${snap.replay.durationSec.toFixed(1)}s)`;
      } else if (snap.replay.state === "playing") {
        replayStatus.textContent = `Playing (${Math.round(snap.replay.progress * 100)}%)`;
      } else if (snap.replay.state === "ended") {
        replayStatus.textContent = "Playback completed";
      }
    }
  }

  dispose(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = undefined;
    }
  }
}
