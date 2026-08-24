import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { preview, type PreviewServer } from "vite";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

interface SimProbe {
  __sim_robotPos(): { x: number; z: number };
  __sim_robotMeshPos(): { x: number; z: number };
  __sim_robotSpeed(): number;
  __sim_gripStatus(): string;
  __sim_activeCameraIsOrtho(): boolean;
  __sim_placeObjectForGrab(): string | null;
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
      executablePath: "/usr/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    browserAvailable = true;
  } catch (e) {
    console.warn(`smoke environment unavailable, skipping: ${String(e)}`);
    await browser?.close();
    browser = null;
    void server?.close();
    server = null;
  }
});

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
    await new Promise((r) => setTimeout(r, 400));

    const after = await probe();
    const displacement = Math.hypot(after.body.z - before.body.z, after.body.x - before.body.x);
    expect(displacement).toBeGreaterThan(1);
    expect(Math.hypot(after.mesh.x - after.body.x, after.mesh.z - after.body.z)).toBeLessThan(0.05);
    expect(after.speed).toBeLessThan(0.5);
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

  it("typing in the builder JSON editor does not drive the robot", async (ctx) => {
    ctx.skip(!browserAvailable, "chrome unavailable");
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
});
