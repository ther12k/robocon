import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { preview, type PreviewServer } from "vite";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { encodeReplayPayload } from "../src/core/replayShare";
import { REPLAY_SCHEMA_VERSION, type ReplayFile } from "../src/core/replayFile";

interface SimProbe {
  __sim_robotPos(): { x: number; z: number };
  __sim_robotMeshPos(): { x: number; z: number };
  __sim_robotSpeed(): number;
  __sim_gripStatus(): string;
  __sim_activeCameraIsOrtho(): boolean;
  __sim_placeObjectForGrab(): string | null;
  __sim_replayState(): string;
  __sim_replayRecordToggle(): void;
  __sim_replayStopExport(): {
    schemaVersion: number;
    engineVersion: string;
    totalTicks: number;
    commands: Array<{ tick: number }>;
  } | null;
  __sim_replayLoadText(text: string): { ok: boolean };
  __sim_replayPlay(): { ok: boolean };
  __sim_telemetryCount(): number;
  __sim_replayShareLink(): Promise<string | null>;
  __sim_isFollowing(): boolean;
}

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
let server: PreviewServer | null = null;
let browser: Browser | null = null;
let page: Page;
let browserAvailable = false;

beforeAll(async () => {
  try {
    server = await preview({ preview: { port: PORT, strictPort: true } });
    await new Promise<void>((resolve) => {
      if (server?.httpServer?.listening) resolve();
      else server?.httpServer?.once("listening", () => resolve());
    });
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1280, height: 800 });
    browserAvailable = true;
  } catch (e) {
    if (process.env.CI) {
      // In CI a missing browser is an environment failure, not a skippable case.
      throw e;
    }
    console.warn(`smoke environment unavailable, skipping: ${String(e)}`);
    await browser?.close();
    browser = null;
    void server?.close();
    server = null;
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.httpServer?.close(() => resolve());
  });
});

async function forceClosePanels(): Promise<void> {
  await page.evaluate(() => {
    for (const id of ["builder-panel", "script-panel"]) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    document.querySelectorAll(".active").forEach((b) => {
      if ((b as HTMLElement).id !== "btn-top-view") b.classList.remove("active");
    });
  });
}

async function waitForReady(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => document.body.dataset.appPhase);
    if (state === "ready") return;
    if (state === "failed") throw new Error("app entered failed phase");
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timeout waiting for app ready");
}

describe("browser smoke (R0-07)", () => {
  it("boots to ready phase with no page errors", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const response = await page.goto(`${BASE}/?probe=1`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await waitForReady();
    expect(errors).toEqual([]);
  });

  it("robot mesh follows physics body when driven", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    const probe = () => page.evaluate(() => {
      const w = window as unknown as SimProbe;
      return {
        body: w.__sim_robotPos(),
        mesh: w.__sim_robotMeshPos(),
        speed: w.__sim_robotSpeed(),
      };
    });

    await new Promise((r) => setTimeout(r, 500));
    const before = await probe();
    expect(Math.hypot(before.mesh.x - before.body.x, before.mesh.z - before.body.z)).toBeLessThan(0.05);

    await page.keyboard.down("KeyW");
    await new Promise((r) => setTimeout(r, 1500));
    await page.keyboard.up("KeyW");
    await new Promise((r) => setTimeout(r, 700));

    const after = await probe();
    const displacement = Math.hypot(after.body.z - before.body.z, after.body.x - before.body.x);
    expect(displacement).toBeGreaterThan(1);
    expect(Math.hypot(after.mesh.x - after.body.x, after.mesh.z - after.body.z)).toBeLessThan(0.05);
    expect(after.speed).toBeLessThan(0.75);

    const telemetry = await page.evaluate(() => {
      const canvas = document.getElementById("telemetry-canvas") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let inked = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) inked++;
      return {
        samples: (window as unknown as SimProbe).__sim_telemetryCount(),
        inked,
      };
    });
    expect(telemetry.samples).toBeGreaterThan(15);
    expect(telemetry.inked).toBeGreaterThan(0);
  });

  it("grab -> release -> re-grab works in the live app", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    const gripStatus = () =>
      page.evaluate(() => (window as unknown as SimProbe).__sim_gripStatus());

    const placed = await page.evaluate(() => (window as unknown as SimProbe).__sim_placeObjectForGrab());
    expect(placed).not.toBeNull();

    const pressSpace = async () => {
      await page.keyboard.down("Space");
      await new Promise((r) => setTimeout(r, 250));
      await page.keyboard.up("Space");
      await new Promise((r) => setTimeout(r, 250));
    };

    await pressSpace();
    expect(await gripStatus()).toContain("Holding:");

    await pressSpace();
    expect(await gripStatus()).not.toContain("Holding:");

    await page.evaluate(() => (window as unknown as SimProbe).__sim_placeObjectForGrab());
    await pressSpace();
    expect(await gripStatus()).toContain("Holding:");

    await pressSpace();
  });

  it("builder presets validate and apply without exceptions for both slots", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    await page.click("#btn-builder");

    const clickButtonByText = (text: string) =>
      page.evaluate((label) => {
        const buttons = [
          ...document.querySelectorAll("#builder-panel button"),
        ] as HTMLButtonElement[];
        const target = buttons.find((b) => b.textContent?.trim() === label);
        if (!target) throw new Error(`button not found: ${label}`);
        target.click();
      }, text);

    for (const slot of [0, 1]) {
      await page.evaluate((s) => {
        const tabs = [...document.querySelectorAll("#builder-panel .builder-tabs button, #builder-panel button")] as HTMLButtonElement[];
        const tab = tabs.find((b) => b.textContent?.trim() === `S${s + 1}` || b.textContent?.trim().startsWith(`S${s + 1}:`));
        if (tab) tab.click();
      }, slot);
      await new Promise((r) => setTimeout(r, 80));

      await clickButtonByText("Validate");
      await new Promise((r) => setTimeout(r, 80));
      let issues = await page.evaluate(
        () => document.querySelector("#builder-panel .builder-issues")!.textContent ?? "",
      );
      expect(issues).toContain("Valid");
      expect(issues).not.toContain("✖");

      await clickButtonByText("Apply ▶");
      await new Promise((r) => setTimeout(r, 150));
      issues = await page.evaluate(
        () => document.querySelector("#builder-panel .builder-issues")!.textContent ?? "",
      );
      expect(issues).toContain("Applied & respawned");
    }

    await page.evaluate(() => {
      (document.getElementById("btn-builder") as HTMLButtonElement).click();
    });
  });

  it("typing in the builder JSON editor does not drive the robot", async (ctx) => {    ctx.skip(!browserAvailable, "chrome unavailable");
    await page.click("#btn-builder");
    await new Promise((r) => setTimeout(r, 100));

    await page.click("#builder-panel .builder-json");
    const posBefore = await page.evaluate(() => (window as unknown as SimProbe).__sim_robotPos());
    await page.keyboard.type(
      '{"w":1,"a":1,"s":1,"d":1,"q":1,"e":1}',
      { delay: 5 },
    );
    await new Promise((r) => setTimeout(r, 300));
    const posAfter = await page.evaluate(() => (window as unknown as SimProbe).__sim_robotPos());
    const speedNow = await page.evaluate(() => (window as unknown as SimProbe).__sim_robotSpeed());

    expect(Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z)).toBeLessThan(0.05);
    expect(speedNow).toBeLessThan(0.05);

    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 100));
  });

  it("top view switches to orthographic camera", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();
    const isOrtho = () =>
      page.evaluate(() => (window as unknown as SimProbe).__sim_activeCameraIsOrtho());
    expect(await isOrtho()).toBe(false);
    await page.keyboard.press("KeyT");
    await new Promise((r) => setTimeout(r, 150));
    expect(await isOrtho()).toBe(true);
    await page.keyboard.press("KeyT");
    await new Promise((r) => setTimeout(r, 150));
    expect(await isOrtho()).toBe(false);
  });

  it("replay round-trip: record, export, load, play back to the same pose", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    // immediate stop: EITHER yields no export (guard) OR a valid ≥1-tick
    // replay — a zero-tick exportable file is the only forbidden outcome.
    await page.evaluate(() => (window as unknown as SimProbe).__sim_replayRecordToggle());
    const zeroTick = await page.evaluate(() => (window as unknown as SimProbe).__sim_replayStopExport());
    if (zeroTick === null) {
      const st = await page.evaluate(
        () => document.getElementById("replay-status")!.textContent ?? "",
      );
      expect(st).toContain("0 ticks");
    } else {
      expect(zeroTick.totalTicks).toBeGreaterThanOrEqual(1);
    }

    await page.evaluate(() => (window as unknown as SimProbe).__sim_replayRecordToggle());
    expect(
      await page.evaluate(() => (window as unknown as SimProbe).__sim_replayState()),
    ).toBe("recording");
    expect(
      await page.evaluate(() => (document.getElementById("replay-share") as HTMLButtonElement).disabled),
    ).toBe(true);

    // Spy on actual browser file download via Blob / ObjectURL / anchor click
    await page.evaluate(() => {
      (window as unknown as { __capturedDownloads: Array<{ filename: string; size: number }> }).__capturedDownloads = [];
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob) {
        const url = origCreate.call(URL, blob);
        (window as unknown as { __capturedDownloads: Array<{ filename: string; size: number }> }).__capturedDownloads.push({
          filename: "",
          size: blob.size,
        });
        return url;
      };
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        const list = (window as unknown as { __capturedDownloads: Array<{ filename: string; size: number }> }).__capturedDownloads;
        if (list && list.length > 0) {
          list[list.length - 1].filename = this.download;
        }
        return origClick.call(this);
      };
    });

    const spawnPos = await page.evaluate(() => (window as unknown as SimProbe).__sim_robotPos());

    await page.keyboard.down("KeyW");
    await new Promise((r) => setTimeout(r, 1000));
    await page.keyboard.up("KeyW");
    await new Promise((r) => setTimeout(r, 300));

    // Stop recording via UI button (Stop & Export) — triggers downloadJson
    await page.evaluate(() => {
      if (document.getElementById("replay-panel")!.hidden) {
        (document.getElementById("btn-replay") as HTMLButtonElement).click();
      }
      (document.getElementById("replay-record") as HTMLButtonElement).click();
    });
    await new Promise((r) => setTimeout(r, 100));

    const downloads = await page.evaluate(
      () => (window as unknown as { __capturedDownloads?: Array<{ filename: string; size: number }> }).__capturedDownloads ?? [],
    );
    expect(downloads.length).toBeGreaterThan(0);
    expect(downloads[0].filename).toMatch(/^robocon-replay-\d+\.json$/);
    expect(downloads[0].size).toBeGreaterThan(50);

    // Share button must now be enabled
    expect(
      await page.evaluate(() => (document.getElementById("replay-share") as HTMLButtonElement).disabled),
    ).toBe(false);

    // Clicking share button from UI must copy or prompt share link
    await page.click("#replay-share");
    await new Promise((r) => setTimeout(r, 100));
    const shareStatus = await page.evaluate(
      () => document.getElementById("replay-status")!.textContent ?? "",
    );
    expect(shareStatus).toMatch(/share link copied|clipboard unavailable/);

    const link = await page.evaluate(
      () => (window as unknown as SimProbe).__sim_replayShareLink(),
    );
    expect(link).not.toBeNull();
    const hashIndex = link!.indexOf("#r=");
    expect(hashIndex).toBeGreaterThan(-1);
    expect("zp").toContain(link![hashIndex + 3]);
    expect(link!.length).toBeGreaterThan(100);

    const playResult = await page.evaluate(() => (window as unknown as SimProbe).__sim_replayPlay());
    expect(playResult.ok).toBe(true);

    const start = Date.now();
    let state = "playing";
    let status = "";
    while (Date.now() - start < 20000) {
      state = await page.evaluate(() => (window as unknown as SimProbe).__sim_replayState());
      status = await page.evaluate(() => document.getElementById("replay-status")!.textContent ?? "");
      if (state !== "playing") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(state).toBe("idle");
    expect(status).toContain("finished");

    const replayedEnd = await page.evaluate(() => (window as unknown as SimProbe).__sim_robotPos());
    const travelled = Math.hypot(replayedEnd.x - spawnPos.x, replayedEnd.z - spawnPos.z);
    expect(travelled).toBeGreaterThan(1);
  });

  it("start match leaves idle phase, shows scoreboard, world stays alive", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    await page.click("#btn-match-start");
    await new Promise((r) => setTimeout(r, 300));

    const state = await page.evaluate(() => ({
      appPhase: document.body.dataset.appPhase,
      matchPhase: document.getElementById("match-phase")!.textContent,
      scoreboardHidden: document.getElementById("scoreboard")!.hidden,
      speed: (window as unknown as SimProbe).__sim_robotSpeed(),
    }));

    expect(state.appPhase).toBe("ready");
    expect(state.matchPhase).not.toBe("IDLE");
    expect(state.scoreboardHidden).toBe(false);
    expect(Number.isNaN(state.speed)).toBe(false);
  });

  it("follow mode persists across slot switches and Enter on a button never starts a match", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    // enable follow on slot 0
    await page.keyboard.press("KeyF");
    expect(await page.evaluate(() => (window as unknown as SimProbe).__sim_isFollowing())).toBe(true);

    // switch to slot 1 — follow must retarget, not toggle off
    await page.keyboard.press("Tab");
    await new Promise((r) => setTimeout(r, 150));
    expect(await page.evaluate(() => (window as unknown as SimProbe).__sim_isFollowing())).toBe(true);

    // Enter pressed while a button is focused activates that control only —
    // the global shortcut must not also start a match.
    const phaseBefore = await page.evaluate(
      () => document.getElementById("match-phase")!.textContent,
    );
    await page.evaluate(() => {
      const b = document.getElementById("replay-close") as HTMLButtonElement;
      if (document.getElementById("replay-panel")!.hidden) {
        (document.getElementById("btn-replay") as HTMLButtonElement).click();
      }
      b.focus();
    });
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 200));
    const phaseAfter = await page.evaluate(
      () => document.getElementById("match-phase")!.textContent,
    );
    expect(phaseAfter).toBe(phaseBefore); // untouched

    await page.keyboard.press("KeyF");
    await page.evaluate(() => {
      if (!document.getElementById("replay-panel")!.hidden) {
        (document.getElementById("btn-replay") as HTMLButtonElement).click();
      }
    });
  });

  it("status panels render worker and replay metadata as text, not HTML", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    await page.click("#btn-autonomy");
    await page.evaluate(() => {
      (document.getElementById("script-code") as HTMLTextAreaElement).value =
        'function onTick(sense, api){ api.log(\'<img src=x onerror="document.body.dataset.pwned=1">\'); }';
    });
    await page.click("#script-run");

    const start = Date.now();
    let text = "";
    while (Date.now() - start < 4000) {
      text = await page.evaluate(
        () => document.getElementById("script-status")!.textContent ?? "",
      );
      if (text.includes("<img")) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    const scriptCheck = await page.evaluate(() => ({
      pwned: document.body.dataset.pwned ?? "",
      imgs: document.getElementById("script-status")!.querySelectorAll("img").length,
    }));
    expect(text).toContain("<img src=x");
    expect(scriptCheck.imgs).toBe(0);
    expect(scriptCheck.pwned).not.toBe("1");

    const evil = JSON.stringify({
      schemaVersion: REPLAY_SCHEMA_VERSION,
      engineVersion: '<img src=x onerror="document.body.dataset.pwned=2">',
      physicsVersion: "ci",
      buildId: "abcdef123456",
      wasmHash: "1234567890ab",
      fixedDt: 1 / 60,
      configHashes: {},
      initialStateHash: "00000000",
      checkpointIntervalTicks: 60,
      checkpoints: [],
      totalTicks: 1,
      finalStateHash: "00000000",
      commands: [],
    });
    await page.evaluate(
      (t) => (window as unknown as SimProbe).__sim_replayLoadText(t),
      evil,
    );
    const replayCheck = await page.evaluate(() => ({
      text: document.getElementById("replay-status")!.textContent ?? "",
      imgs: document.getElementById("replay-status")!.querySelectorAll("img").length,
      pwned: document.body.dataset.pwned ?? "",
    }));
    expect(replayCheck.text).toContain("<img src=x");
    expect(replayCheck.imgs).toBe(0);
    expect(replayCheck.pwned).not.toBe("2");

    await page.evaluate(() => document.getElementById("script-stop")!.click());
  });

  it("autonomy script reaches running state in a live blob worker", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
    await forceClosePanels();

    await page.click("#btn-autonomy");
    await new Promise((r) => setTimeout(r, 100));

    const code = await page.evaluate(async () => {
      const res = await fetch("./scripts/sample-gather.js");
      return res.text();
    });
    await page.evaluate((c) => {
      (document.getElementById("script-code") as HTMLTextAreaElement).value = c;
    }, code);
    await page.click("#script-run");

    const start = Date.now();
    let status = "";
    while (Date.now() - start < 5000) {
      status = await page.evaluate(
        () => document.getElementById("script-status")!.textContent ?? "",
      );
      if (status.includes("[running]")) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(status).toContain("[running]");

    await new Promise((r) => setTimeout(r, 2000));
    status = await page.evaluate(
      () => document.getElementById("script-status")!.textContent ?? "",
    );
    expect(status).toContain("[running]");

    await page.evaluate(() => document.getElementById("script-stop")!.click());
    await page.evaluate(() => document.getElementById("btn-autonomy")!.click());
  });

  it("watchdog terminates an infinite-loop script without freezing the tab", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");

    await page.evaluate(() => {
      const panel = document.getElementById("script-panel")!;
      if (panel.hidden) (document.getElementById("btn-autonomy") as HTMLButtonElement).click();
    });
    await page.evaluate(() => {
      (document.getElementById("script-code") as HTMLTextAreaElement).value = "while (true) {}";
    });
    await page.click("#script-run");

    const start = Date.now();
    let status = "";
    while (Date.now() - start < 5000) {
      status = await page.evaluate(
        () => document.getElementById("script-status")!.textContent ?? "",
      );
      if (status.includes("[killed]")) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(status).toContain("[killed]");
    expect(status).toContain("watchdog");

    const alive = await page.evaluate(() => 1 + 1);
    expect(alive).toBe(2);

    await page.evaluate(() => {
      if (!document.getElementById("script-panel")!.hidden) {
        (document.getElementById("btn-autonomy") as HTMLButtonElement).click();
      }
    });
  });

  it("share links load a replay on a cold page open", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");

    const file: ReplayFile = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      engineVersion: "ci-cold-load",
      physicsVersion: "ci",
      buildId: "abcdef123456",
      wasmHash: "1234567890ab",
      fixedDt: 1 / 60,
      configHashes: {},
      initialStateHash: "00000000",
      checkpointIntervalTicks: 60,
      checkpoints: [],
      totalTicks: 1,
      finalStateHash: "00000000",
      commands: [],
    };
    const payload = await encodeReplayPayload(file);
    await page.goto(`${BASE}/#r=${payload}`, { waitUntil: "domcontentloaded" });
    await waitForReady();
    await new Promise((r) => setTimeout(r, 400));

    expect(
      await page.evaluate(() => document.getElementById("replay-panel")!.hidden),
    ).toBe(false);
    const status = await page.evaluate(
      () => document.getElementById("replay-status")!.textContent ?? "",
    );
    expect(status).toContain("loaded");
    expect(status).toContain("ci-cold-load");

    // clean the hash so subsequent reloads in this session stay pristine
    await page.evaluate((base) => history.replaceState(null, "", base), BASE);
  });
});
