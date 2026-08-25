import * as THREE from "three";
import type {
  ArenaConfig,
  CompetitionRuleset,
  RobotSpec,
  SimulationProfile,
  ValidationContext,
} from "./sim/types";
import { buildArena } from "./render/ArenaBuilder";
import { CameraRig } from "./sim/CameraRig";
import { MeasureTool } from "./sim/MeasureTool";
import { SimulationCore } from "./core/SimulationCore";
import { MatchController, type MatchPhase } from "./core/match";
import { AutonomyManager, type AutonomyState } from "./core/autonomy";
import { createBrowserHostFactory } from "./core/browserHost";
import { checkSchemaVersion } from "./core/schemas";
import { type ReplayFile } from "./core/replayFile";
import {
  buildReplayShareUrl,
  replayFromHash,
} from "./core/replayShare";
import { buildRobotMesh } from "./sim/robot/RobotVisual";
import { InputManager } from "./sim/input/InputManager";
import { RobotBuilderPanel } from "./ui/RobotBuilderPanel";
import { yawFromQuaternion } from "./sim/orientation";
import { validateTeamMass, validateSpec } from "./sim/specValidator";

type AppPhase = "loading" | "ready" | "failed";

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const bootOverlay = document.getElementById("boot-overlay")!;
const bootStatus = document.getElementById("boot-status")!;
const arenaNameEl = document.getElementById("arena-name")!;
const infoTheme = document.getElementById("info-theme")!;
const infoRulebook = document.getElementById("info-rulebook")!;
const infoDimensions = document.getElementById("info-dimensions")!;
const verifyWarning = document.getElementById("verify-warning")!;
const measureHud = document.getElementById("measure-hud")!;
const measureLabel = document.getElementById("measure-label")!;
const btnTopView = document.getElementById("btn-top-view") as HTMLButtonElement;
const btnMeasure = document.getElementById("btn-measure") as HTMLButtonElement;
const btnFollow = document.getElementById("btn-follow") as HTMLButtonElement;
const btnResetCam = document.getElementById("btn-reset-cam") as HTMLButtonElement;
const btnBuilder = document.getElementById("btn-builder") as HTMLButtonElement;
const btnAutonomy = document.getElementById("btn-autonomy") as HTMLButtonElement;
const scriptPanel = document.getElementById("script-panel")!;
const scriptSlotEl = document.getElementById("script-slot")!;
const scriptCodeEl = document.getElementById("script-code") as HTMLTextAreaElement;
const scriptStatusEl = document.getElementById("script-status")!;
const scriptCloseBtn = document.getElementById("script-close")!;
const scriptRunBtn = document.getElementById("script-run") as HTMLButtonElement;
const scriptStopBtn = document.getElementById("script-stop") as HTMLButtonElement;
const scriptLoadBtn = document.getElementById("script-load") as HTMLButtonElement;
const scriptFileInput = document.getElementById("script-file") as HTMLInputElement;
const btnMatchStart = document.getElementById("btn-match-start") as HTMLButtonElement;
const btnReplay = document.getElementById("btn-replay") as HTMLButtonElement;
const replayPanel = document.getElementById("replay-panel")!;
const replayCloseBtn = document.getElementById("replay-close")!;
const replayRecordBtn = document.getElementById("replay-record") as HTMLButtonElement;
const replayRecordMatchBtn = document.getElementById("replay-record-match") as HTMLButtonElement;
const replayPlayBtn = document.getElementById("replay-play") as HTMLButtonElement;
const replayStopBtn = document.getElementById("replay-stop") as HTMLButtonElement;
const replayLoadBtn = document.getElementById("replay-load") as HTMLButtonElement;
const replayShareBtn = document.getElementById("replay-share") as HTMLButtonElement;
const replayFileInput = document.getElementById("replay-file") as HTMLInputElement;
const replayStatusEl = document.getElementById("replay-status")!;
const scoreboardEl = document.getElementById("scoreboard")!;
const scoreRedEl = document.getElementById("score-red")!;
const scoreBlueEl = document.getElementById("score-blue")!;
const matchPhaseEl = document.getElementById("match-phase")!;
const matchTimerEl = document.getElementById("match-timer")!;
const retriesEl = document.getElementById("retries")!;
const matchBanner = document.getElementById("match-banner")!;
const fpsEl = document.getElementById("fps")!;
const robotNameEl = document.getElementById("robot-name")!;
const robotDriveEl = document.getElementById("robot-drive")!;
const robotPoseEl = document.getElementById("robot-pose")!;
const robotSpeedEl = document.getElementById("robot-speed")!;
const robotGripEl = document.getElementById("robot-grip")!;
const telemetryCanvas = document.getElementById("telemetry-canvas") as HTMLCanvasElement;

const controlButtons = [btnMatchStart, btnReplay, btnTopView, btnMeasure, btnFollow, btnResetCam, btnBuilder, btnAutonomy];
for (const b of controlButtons) b.disabled = true;

let phase: AppPhase = "loading";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
scene.fog = new THREE.Fog(0x101418, 30, 90);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2129, 1.1));

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.bias = -0.0004;
scene.add(sun);

let rig: CameraRig | null = null;
let measure: MeasureTool | null = null;
let core: SimulationCore | null = null;
let builder: RobotBuilderPanel | null = null;
let arena: ArenaConfig | null = null;
let validationCtx: ValidationContext | null = null;
let floorMesh: THREE.Object3D | null = null;
let match: MatchController | null = null;
let autonomy: AutonomyManager | null = null;
let activeSlot = 0;
const input = new InputManager();

function setPhase(next: AppPhase, message?: string): void {
  phase = next;
  document.body.dataset.appPhase = next;
  if (next === "ready") {
    bootOverlay.hidden = true;
    for (const b of controlButtons) b.disabled = false;
  } else if (next === "failed") {
    bootOverlay.hidden = false;
    for (const b of controlButtons) b.disabled = true;
    bootStatus.textContent = message ?? "Failed";
  }
}

function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path;
}

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

function setMeasureHud(text: string | null): void {
  if (text === null) {
    measureHud.hidden = true;
  } else {
    measureHud.hidden = false;
    measureLabel.textContent = text;
  }
}

function zoneCenter(id: string): { x: number; z: number } {
  const zone = arena?.zones.find((z) => z.id === id);
  return zone ? { x: zone.x, z: zone.z } : { x: 0, z: 0 };
}

function populateInfo(config: ArenaConfig): void {
  arenaNameEl.textContent = config.meta.name;
  infoTheme.textContent = config.meta.name;
  const rulebookLine = `v${config.meta.rulebookVersion} (±${config.meta.tolerancePct}%)`;
  const src = config.meta.source;
  infoRulebook.textContent =
    src && src.status !== "official"
      ? `${rulebookLine} · source: ${src.status}`
      : rulebookLine;
  infoDimensions.textContent = `${config.dimensions.width} m × ${config.dimensions.length} m`;
  verifyWarning.textContent =
    config.meta.verifyNote ??
    (src && src.status !== "official"
      ? `Layout source status: "${src.status}" — pending official rulebook verification.`
      : "");
}

function openScriptPanel(): void {
  if (!scriptPanel) return;
  scriptPanel.hidden = false;
  btnAutonomy.classList.add("active");
  input.setContext("ui");
  scriptSlotEl.textContent = String(activeSlot + 1);
}

function closeScriptPanel(): void {
  scriptPanel.hidden = true;
  btnAutonomy.classList.remove("active");
  input.setContext("simulation");
}

type StatusTone = "ok" | "warn" | "err";

function toneForStatus(status: string): StatusTone {
  return status === "running" ? "ok" : status === "error" || status === "killed" ? "err" : "warn";
}

function renderStatusInto(
  el: HTMLElement,
  label: string,
  tone: StatusTone,
  detail: string,
): void {
  const badge = document.createElement("span");
  badge.className = tone;
  badge.textContent = `[${label}]`;
  el.replaceChildren(badge, document.createTextNode(` ${detail}`));
}

function setScriptStatus(state: AutonomyState): void {
  renderStatusInto(scriptStatusEl, state.status, toneForStatus(state.status), state.detail);
}

btnAutonomy.addEventListener("click", () => {
  if (phase !== "ready") return;
  if (scriptPanel.hidden) {
    openScriptPanel();
    scriptCodeEl.focus();
  } else {
    closeScriptPanel();
  }
});

scriptCloseBtn.addEventListener("click", () => {
  closeScriptPanel();
});

scriptLoadBtn.addEventListener("click", () => scriptFileInput.click());

scriptFileInput.addEventListener("change", () => {
  const file = scriptFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    scriptCodeEl.value = String(reader.result ?? "");
    scriptCodeEl.focus();
  };
  reader.readAsText(file);
  scriptFileInput.value = "";
});

scriptRunBtn.addEventListener("click", () => {
  if (phase !== "ready" || !autonomy) return;
  autonomy.attach(activeSlot, scriptCodeEl.value);
  const st = autonomy.status(activeSlot);
  setScriptStatus(st.status === "detached" ? { status: "booting", detail: "" } : st);
});

scriptStopBtn.addEventListener("click", () => {
  autonomy?.detach(activeSlot);
  setScriptStatus({ status: "detached", detail: "stopped by operator" });
});

type ReplayUiState = "idle" | "recording" | "playing";

let replayUi: ReplayUiState = "idle";
let replayLoadedFile: ReplayFile | null = null;
let replayRecordingMatch = false;

function setReplayStatus(entries: Array<{ cls: StatusTone; text: string }>): void {
  const frag = document.createDocumentFragment();
  for (const e of entries) {
    const span = document.createElement("span");
    span.className = e.cls;
    span.textContent = e.text;
    frag.appendChild(span);
  }
  replayStatusEl.replaceChildren(frag);
}

function updateReplayButtons(): void {
  const recording = replayUi === "recording";
  const playing = replayUi === "playing";
  replayRecordBtn.classList.toggle("recording", recording && !replayRecordingMatch);
  replayRecordBtn.textContent = recording && !replayRecordingMatch ? "■ Stop & Export" : "● Record";
  replayRecordMatchBtn.classList.toggle("recording", recording && replayRecordingMatch);
  replayRecordMatchBtn.textContent = recording && replayRecordingMatch ? "■ Stop & Export" : "● Record Match";
  replayRecordBtn.disabled = playing;
  replayRecordMatchBtn.disabled = playing;
  replayPlayBtn.disabled = playing || recording || !replayLoadedFile;
  replayStopBtn.disabled = !playing;
  replayLoadBtn.disabled = playing || recording;
  replayShareBtn.disabled = playing || recording || !replayLoadedFile;
}

function requireIdleMatch(): boolean {
  if (match && match.phase !== "idle") {
    setReplayStatus([
      { cls: "err", text: "match must be idle — match state is not captured in replay files" },
    ]);
    return false;
  }
  return true;
}

function startReplayRecording(): void {
  if (!core || replayUi !== "idle" || !requireIdleMatch()) return;
  core.resetForReplay();
  core.beginReplayCapture(60);
  replayRecordingMatch = false;
  replayUi = "recording";
  updateReplayButtons();
  setReplayStatus([{ cls: "warn", text: "recording from spawn reset — drive, then Stop & Export" }]);
}

function startMatchRecording(): void {
  if (!core || !match || replayUi !== "idle" || !requireIdleMatch()) return;
  core.resetForReplay();
  core.beginReplayCapture(60);
  match.startMatch();
  replayRecordingMatch = true;
  replayUi = "recording";
  updateReplayButtons();
  scoreboardEl.hidden = false;
  matchBanner.hidden = true;
  setReplayStatus([{ cls: "warn", text: "recording match from kickoff — scoreboard will reproduce on playback" }]);
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stopReplayRecording(opts: { download?: boolean } = {}): ReplayFile | null {
  if (!core || replayUi !== "recording") return null;
  const file = core.endReplayCapture({ matchStarted: replayRecordingMatch });
  replayLoadedFile = file;
  replayRecordingMatch = false;
  replayUi = "idle";
  updateReplayButtons();
  if (opts.download) downloadJson(file, `robocon-replay-${Date.now()}.json`);
  setReplayStatus([
    { cls: "ok", text: `captured ${file.commands.length} commands / ${file.totalTicks} ticks` },
  ]);
  return file;
}

function finishPlayback(detail: string, cls: "ok" | "warn" | "err" = "warn"): void {
  if (!core) return;
  core.stopReplayPlayback();
  replayUi = "idle";
  updateReplayButtons();
  setReplayStatus([{ cls, text: `replay ${detail}` }]);
}

function loadReplayText(text: string): { ok: boolean } {
  if (!core) return { ok: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    setReplayStatus([{ cls: "err", text: `invalid JSON: ${String(err)}` }]);
    return { ok: false };
  }
  const f = parsed as Partial<ReplayFile> | null;
  if (
    !f ||
    typeof f !== "object" ||
    typeof f.schemaVersion !== "number" ||
    !Array.isArray(f.commands) ||
    typeof f.totalTicks !== "number"
  ) {
    setReplayStatus([{ cls: "err", text: "not a replay file (missing schemaVersion/commands/totalTicks)" }]);
    return { ok: false };
  }
  replayLoadedFile = parsed as ReplayFile;
  replayUi = "idle";
  updateReplayButtons();
  setReplayStatus([
    {
      cls: "ok",
      text: `loaded ${f.commands.length} commands / ${f.totalTicks} ticks · engine ${String(f.engineVersion)}`,
    },
  ]);
  return { ok: true };
}

function playReplay(): void {
  if (!core || !replayLoadedFile || replayUi !== "idle" || !requireIdleMatch()) return;
  if (replayLoadedFile.matchStarted) {
    if (!match) {
      setReplayStatus([{ cls: "err", text: "this replay needs a match session — match controller unavailable" }]);
      return;
    }
    match.startMatch();
  }
  const issues = core.startReplayPlayback(replayLoadedFile);
  if (issues.length > 0) {
    setReplayStatus(issues.map((i) => ({ cls: "err", text: `${i.field}: ${i.message}` })));
    return;
  }
  replayUi = "playing";
  updateReplayButtons();
  setReplayStatus([{ cls: "warn", text: `playing ${replayLoadedFile.totalTicks} ticks…` }]);
}

document.addEventListener("visibilitychange", () => {
  if (!autonomy) return;
  if (document.hidden) autonomy.suspendWatchdog();
  else autonomy.resumeWatchdog();
});

btnReplay.addEventListener("click", () => {
  if (phase !== "ready") return;
  replayPanel.hidden = !replayPanel.hidden;
  btnReplay.classList.toggle("active", !replayPanel.hidden);
  input.setContext(replayPanel.hidden ? "simulation" : "ui");
});

replayCloseBtn.addEventListener("click", () => {
  replayPanel.hidden = true;
  btnReplay.classList.remove("active");
  input.setContext("simulation");
});

replayRecordBtn.addEventListener("click", () => {
  if (phase !== "ready") return;
  if (replayUi === "recording") stopReplayRecording();
  else startReplayRecording();
});

replayRecordMatchBtn.addEventListener("click", () => {
  if (phase !== "ready") return;
  if (replayUi === "recording" && replayRecordingMatch) stopReplayRecording();
  else startMatchRecording();
});

replayLoadBtn.addEventListener("click", () => replayFileInput.click());

async function copyReplayLink(): Promise<void> {
  if (!replayLoadedFile) return;
  const url = await buildReplayShareUrl(replayLoadedFile, `${location.origin}${location.pathname}`);
  const sizeKb = Math.round(url.length / 1024);
  let copied = true;
  try {
    await Promise.race([
      navigator.clipboard.writeText(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 1500)),
    ]);
  } catch {
    copied = false;
  }
  if (copied) {
    setReplayStatus([{ cls: "ok", text: `share link copied (${sizeKb} KB)` }]);
  } else {
    window.prompt("Copy this replay link:", url);
    setReplayStatus([{ cls: "warn", text: "clipboard unavailable — link shown in a prompt" }]);
  }
}

replayShareBtn.addEventListener("click", () => {
  void copyReplayLink();
});

async function autoloadFromHash(): Promise<void> {
  try {
    const file = await replayFromHash(location.hash);
    if (file && loadReplayText(JSON.stringify(file)).ok) {
      replayPanel.hidden = false;
      btnReplay.classList.add("active");
      input.setContext("ui");
    }
  } catch (err) {
    setReplayStatus([{ cls: "err", text: `share link invalid: ${String(err)}` }]);
  }
}
void autoloadFromHash();

replayFileInput.addEventListener("change", () => {
  const file = replayFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadReplayText(String(reader.result ?? ""));
  reader.readAsText(file);
  replayFileInput.value = "";
});

replayPlayBtn.addEventListener("click", () => {
  if (phase === "ready") playReplay();
});

replayStopBtn.addEventListener("click", () => finishPlayback("stopped by operator"));

function updateRobotPanel(): void {
  if (!core || !core.hasSlot(activeSlot)) return;
  const body = core.getBody(activeSlot)!;
  const p = body.translation();
  const v = body.linvel();
  const yawDeg = ((yawFromQuaternion(body.rotation()) * 180) / Math.PI).toFixed(0);
  const spec = core.getSpec(activeSlot)!;
  robotNameEl.textContent = `${spec.name} [${spec.team}]`;
  robotDriveEl.textContent = `${spec.chassis.drive} · ${spec.chassis.massKg ?? 20} kg · ${(spec.chassis.maxSpeedMps ?? 2).toFixed(1)} m/s max`;
  robotPoseEl.textContent = `x ${p.x.toFixed(2)}  z ${p.z.toFixed(2)}  yaw ${yawDeg}°`;
  robotSpeedEl.textContent = `${Math.hypot(v.x, v.z).toFixed(2)} m/s`;
  const grip = core.gripStatus(activeSlot);
  if (grip.hasGripper) {
    robotGripEl.hidden = false;
    robotGripEl.textContent = grip.holding ? `Holding: ${grip.heldId}` : "Space = grab / release";
  } else {
    robotGripEl.hidden = true;
  }
}

const TELEMETRY_POINTS = 240;
const telemetryBuf = new Float32Array(TELEMETRY_POINTS);
let telemetryLen = 0;
const telemetryCtx: CanvasRenderingContext2D | null = telemetryCanvas.getContext("2d");

function sizeTelemetryCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = telemetryCanvas.clientWidth || 260;
  telemetryCanvas.width = Math.round(cssWidth * dpr);
  telemetryCanvas.height = Math.round(56 * dpr);
  telemetryCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function pushTelemetry(speed: number): void {
  if (telemetryLen < TELEMETRY_POINTS) {
    telemetryBuf[telemetryLen++] = speed;
  } else {
    telemetryBuf.copyWithin(0, 1);
    telemetryBuf[TELEMETRY_POINTS - 1] = speed;
  }
}

function drawTelemetry(): void {
  const ctx = telemetryCtx;
  if (!ctx) return;
  const w = telemetryCanvas.clientWidth || 260;
  const h = 56;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
  if (telemetryLen < 2) return;
  let max = 1;
  for (let i = 0; i < telemetryLen; i++) {
    if (telemetryBuf[i] > max) max = telemetryBuf[i];
  }
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < telemetryLen; i++) {
    const x = (i / (TELEMETRY_POINTS - 1)) * w;
    const y = h - 2 - (telemetryBuf[i] / max) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

let lastScoreboardFingerprint = "";
let bannerShownForPhase = "";

function updateScoreboard(): void {
  if (!match || scoreboardEl.hidden) return;
  const fp = match.scoreboardFingerprint();
  const phase = match.phase;
  if (fp === lastScoreboardFingerprint && bannerShownForPhase === (phase === "ended" ? "ended" : "")) return;
  lastScoreboardFingerprint = fp;

  scoreRedEl.textContent = String(match.score.red);
  scoreBlueEl.textContent = String(match.score.blue);
  const phaseLabel: Record<MatchPhase, string> = {
    idle: "IDLE", setup: "SETUP", countdown: "READY", playing: "PLAY", ended: "FULL TIME",
  };
  matchPhaseEl.textContent = phaseLabel[phase];
  const secs = Math.ceil(match.timeRemainingSec);
  matchTimerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const team = core?.slotTeam(activeSlot);
  retriesEl.textContent = team ? `Retry ${match.retriesFor(team)}/3` : "";

  if (phase === "ended" && bannerShownForPhase !== "ended") {
    bannerShownForPhase = "ended";
    const w = match.winner;
    matchBanner.textContent = w
      ? `${w.toUpperCase()} WINS!`
      : "DRAW — judges to decide";
    matchBanner.hidden = false;
  } else if (phase !== "ended") {
    bannerShownForPhase = "";
    matchBanner.hidden = true;
  }
}

function spawnSlot(index: number, spec: RobotSpec): void {
  if (!core || !arena) return;
  core.addRobot(index, spec);

  const mesh = buildRobotMesh(spec);
  const zoneId = spec.team === "red" ? "startRed" : "startBlue";
  const c = zoneCenter(zoneId);
  mesh.position.set(c.x, (spec.chassis.height ?? 0.3) / 2 + 0.02, c.z);
  mesh.rotation.y = spec.team === "red" ? Math.PI : 0;
  scene.add(mesh);
  core.physics.attachMesh(`robot-${index}`, mesh);
}

function activeSlotCount(): number {
  return core?.slotCount() ?? 0;
}

function setActiveSlot(index: number): void {
  const count = activeSlotCount();
  if (count === 0) return;
  activeSlot = ((index % count) + count) % count;
  rig?.setFollow(rig.isFollowing() ? `robot-${activeSlot}` : null);
  updateFollowButton();
  if (!scriptPanel.hidden) scriptSlotEl.textContent = String(activeSlot + 1);
}

function updateFollowButton(): void {
  if (!rig || !core) return;
  btnFollow.classList.toggle("active", rig.isFollowing());
  const name = core.getSpec(activeSlot)?.name ?? "";
  btnFollow.textContent = rig.isFollowing() ? `Follow: ${name}` : "Follow Cam";
}

function onResize(): void {
  if (!rig) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
}

window.addEventListener("resize", () => {
  onResize();
  sizeTelemetryCanvas();
});

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "ready" || !measure || !rig || !floorMesh) return;
  if (!measure.isEnabled() || e.button !== 0) return;
  if (!(e.target instanceof HTMLCanvasElement)) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  measure.handleClick(ndc, rig.camera, floorMesh);
});

btnTopView.addEventListener("click", () => {
  if (phase !== "ready" || !rig) return;
  btnTopView.classList.toggle("active", rig.toggleTopView());
});

btnResetCam.addEventListener("click", () => {
  if (phase !== "ready" || !rig) return;
  rig.reset();
  updateFollowButton();
  btnTopView.classList.remove("active");
});

btnFollow.addEventListener("click", () => {
  if (phase !== "ready" || !rig) return;
  rig.setFollow(rig.isFollowing() ? `robot-${activeSlot}` : null);
  updateFollowButton();
});

btnMeasure.addEventListener("click", () => {
  if (phase !== "ready" || !measure) return;
  const active = !btnMeasure.classList.contains("active");
  btnMeasure.classList.toggle("active", active);
  measure.setEnabled(active);
});

function startMatch(): void {
  if (phase !== "ready" || !match || !core) return;
  match.startMatch();
  scoreboardEl.hidden = false;
  matchBanner.hidden = true;
}


btnMatchStart.addEventListener("click", startMatch);

btnBuilder.addEventListener("click", () => {
  if (phase !== "ready" || !builder) return;
  builder.toggle(activeSlot);
  btnBuilder.classList.toggle("active", builder.isOpen());
  input.setContext(builder.isOpen() ? "ui" : "simulation");
});

window.addEventListener("keydown", (e) => {
  if (phase !== "ready") return;
  const targetEditable =
    e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
  if (e.key === `Enter`) {
    startMatch();
    return;
  }
  if (e.key === "b" || e.key === "B") {
    if (targetEditable) return;
    btnBuilder.click();
    return;
  }
  if (e.key === "v" || e.key === "V") {
    if (targetEditable) return;
    btnAutonomy.click();
    return;
  }
  if (builder?.isOpen()) {
    if (e.key === "Escape") {
      builder.close();
      btnBuilder.classList.remove("active");
      input.setContext("simulation");
    }
    return;
  }
  if (targetEditable) return;
  if (e.key === "t" || e.key === "T") {
    btnTopView.classList.toggle("active", rig?.toggleTopView() ?? false);
  } else if (e.key === "m" || e.key === "M") {
    btnMeasure.click();
  } else if (e.key === "r" || e.key === "R") {
    btnResetCam.click();
  } else if (e.key === "f" || e.key === "F") {
    btnFollow.click();
  } else if (e.key === "Escape" && measure?.isEnabled()) {
    measure.clear();
  }
});

async function main(): Promise<void> {
  await import("@dimforge/rapier3d-compat").then((R) => R.init());

  arena = await loadJson<ArenaConfig>("arenas/default.json");
  const competition = await loadJson<CompetitionRuleset>("config/competition-ruleset.json");
  const profile = await loadJson<SimulationProfile>("config/simulation-profile.json");

  for (const [kind, data] of [
    ["arena", arena],
    ["competitionRuleset", competition],
    ["simulationProfile", profile],
  ] as const) {
    const check = checkSchemaVersion(kind, data);
    if (!check.ok) throw new Error(`${kind}: unsupported schemaVersion ${check.found}`);
  }

  validationCtx = {
    roles: competition.robots,
    teamWeightBudgetKg: competition.teamWeightBudgetKg,
    limits: {
      maxSpeedMps: profile.maxSpeedMps,
      maxAccelMps2: profile.maxAccelMps2,
      maxTurnRps: profile.maxTurnRps,
    },
  };

  populateInfo(arena);

  core = new SimulationCore(arena, competition, profile);
  match = new MatchController(core, competition);
  const hostFactory = createBrowserHostFactory();
  if (hostFactory) {
    autonomy = new AutonomyManager(core, hostFactory);
  }

  const arenaRoot = buildArena(arena);
  scene.add(arenaRoot);
  floorMesh = arenaRoot.getObjectByName("floor") ?? null;

  for (const spawn of arena.objectSpawns) {
    const entityId = `obj-${spawn.objectId}`;
    const marker = arenaRoot.getObjectByName(entityId);
    if (!marker) continue;
    arenaRoot.remove(marker);
    scene.add(marker);
    core.physics.attachMesh(entityId, marker);
  }

  const presetSpecs = await Promise.all([
    loadJson<RobotSpec>("robots/preset-r1.json"),
    loadJson<RobotSpec>("robots/preset-r2.json"),
  ]);

  rig = new CameraRig(canvas, arena);
  rig.setEntityResolver((id) => core?.physics.getEntityTransform(id) ?? null);
  measure = new MeasureTool(scene, setMeasureHud);

  presetSpecs.forEach((spec, i) => spawnSlot(i, spec));

  builder = new RobotBuilderPanel({
    root: document.getElementById("app")!,
    validationCtx,
    slotCount: activeSlotCount(),
    slotLabel: (i) => `S${i + 1}: ${core?.getSpec(i)?.name ?? "?"}`,
    getSpecText: (i) => JSON.stringify(core?.getSpec(i) ?? {}, null, 2),
    onApply: (slot, spec) => spawnSlot(slot, spec),
    postApplyIssues: () =>
      validateTeamMass(
        presetSlots().map((i) => core?.getSpec(i)),
        competition.teamWeightBudgetKg,
      ),
  });
  builder.selectSlot(0);

  onResize();
  sizeTelemetryCanvas();
  setPhase("ready");
  installProbe();

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsAccum = 0;
  let prevGripDown = false;

  function loop(): void {
    requestAnimationFrame(loop);
    try {
      const dt = clock.getDelta();

      while (input.consumeTabPress()) setActiveSlot(activeSlot + 1);

      const cmd = input.readCommand();
      if (replayUi !== "playing" && core?.hasSlot(activeSlot)) {
        core.setAxesFromInput(activeSlot, cmd);
        const gripDown = input.isDown("Space");
        if (gripDown && !prevGripDown) core.enqueueGrabToggle(activeSlot);
        prevGripDown = gripDown;
      }

      if (match) {
        match.advance(dt);
      } else {
        core!.advance(dt);
      }

      if (replayUi === "playing" && core && !core.isReplayPlaybackActive()) {
        const desync = core.replayDesync;
        if (desync !== null) {
          finishPlayback(`aborted — state diverged from checkpoint at tick ${desync}`, "err");
        } else {
          finishPlayback(core.wasReplayPlaybackCompleted() ? "finished" : "stopped");
        }
      }

      rig!.update(dt);
      renderer.render(scene, rig!.camera);

      frames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 0.5) {
        fpsEl.textContent = `${Math.round(frames / fpsAccum)} fps`;
        frames = 0;
        fpsAccum = 0;
      }
      updateRobotPanel();
      if (core?.hasSlot(activeSlot)) {
        const v = core.getBody(activeSlot)!.linvel();
        pushTelemetry(Math.hypot(v.x, v.z));
        drawTelemetry();
      }
      updateScoreboard();
      if (autonomy && !scriptPanel.hidden) {
        setScriptStatus(autonomy.status(activeSlot));
      }
    } catch (err) {
      console.error(err);
      setPhase("failed", err instanceof Error ? err.message : String(err));
    }
  }

  loop();
}

function presetSlots(): number[] {
  return core?.activeSlots() ?? [];
}

interface SimProbe {
  __sim_robotPos(): { x: number; z: number };
  __sim_robotMeshPos(): { x: number; z: number };
  __sim_robotSpeed(): number;
  __sim_gripStatus(): string;
  __sim_activeCameraIsOrtho(): boolean;
  __sim_placeObjectForGrab(): string | null;
  __sim_validateSpecText(text: string): unknown;
  __sim_replayState(): ReplayUiState;
  __sim_replayRecordToggle(): void;
  __sim_replayRecordMatchToggle(): void;
  __sim_replayStopExport(): unknown;
  __sim_replayLoadText(text: string): { ok: boolean };
  __sim_replayPlay(): { ok: boolean };
  __sim_telemetryCount(): number;
  __sim_replayShareLink(): Promise<string | null>;
}

function installProbe(): void {
  if (!new URLSearchParams(window.location.search).has("probe")) return;
  const w = window as unknown as Partial<SimProbe>;
  w.__sim_robotPos = () => {
    const p = core!.getBody(activeSlot)!.translation();
    return { x: p.x, z: p.z };
  };
  w.__sim_robotMeshPos = () => {
    const p = core?.physics.getEntity(`robot-${activeSlot}`)?.mesh?.position;
    return { x: p?.x ?? NaN, z: p?.z ?? NaN };
  };
  w.__sim_robotSpeed = () => {
    const v = core!.getBody(activeSlot)!.linvel();
    return Math.hypot(v.x, v.z);
  };
  w.__sim_gripStatus = () => robotGripEl.textContent ?? "";
  w.__sim_activeCameraIsOrtho = () => rig?.isTopView() ?? false;
  w.__sim_placeObjectForGrab = () => core?.placeObjectNearGripper(activeSlot) ?? null;
  w.__sim_validateSpecText = (text: string) => {
    try {
      return validateSpec(JSON.parse(text), validationCtx!);
    } catch (err) {
      return { error: String(err) };
    }
  };
  w.__sim_replayState = () => replayUi;
  w.__sim_replayRecordToggle = () => replayRecordBtn.click();
  w.__sim_replayRecordMatchToggle = () => replayRecordMatchBtn.click();
  w.__sim_replayStopExport = () => stopReplayRecording({ download: false });
  w.__sim_replayLoadText = (text: string) => loadReplayText(text);
  w.__sim_replayPlay = () => {
    playReplay();
    return { ok: replayUi === "playing" };
  };
  w.__sim_telemetryCount = () => telemetryLen;
  w.__sim_replayShareLink = async () =>
    replayLoadedFile
      ? buildReplayShareUrl(replayLoadedFile, `${location.origin}${location.pathname}`)
      : null;
}

main().catch((err) => {
  console.error(err);
  setPhase("failed", err instanceof Error ? err.message : String(err));
});
