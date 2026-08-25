import { describe, expect, it } from "vitest";
import {
  buildReplayShareUrl,
  decodeReplayPayloadData,
  encodeReplayPayload,
  payloadFromHash,
} from "../src/core/replayShare";
import {
  parseReplayFile,
  REPLAY_SCHEMA_VERSION,
  type ReplayFile,
} from "../src/core/replayFile";

function sampleFile(): ReplayFile {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    engineVersion: "0.4.1-test",
    physicsVersion: "0.12.0",
    fixedDt: 1 / 60,
    configHashes: { arena: "abc12345", competition: "def45678" },
    initialStateHash: "11111111",
    checkpointIntervalTicks: 60,
    checkpoints: [
      { tick: 0, hash: "aaaaaaaa" },
      { tick: 60, hash: "bbbbbbbb" },
    ],
    totalTicks: 121,
    finalStateHash: "22222222",
    commands: [
      { tick: 3, action: { kind: "axes", slot: 0, payload: { fwd: 1, strafe: 0, turn: 0 } } },
      { tick: 40, action: { kind: "grabToggle", slot: 0 } },
    ],
  };
}

describe("replay share codec", () => {
  it("round-trips a replay through the compressed URL payload", async () => {
    const file = sampleFile();
    const payload = await encodeReplayPayload(file);

    expect(payload.startsWith("z") || payload.startsWith("p")).toBe(true);
    expect(payload).not.toMatch(/[+/=]/);

    const data = await decodeReplayPayloadData(payload);
    const parsed = parseReplayFile(data);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file).toEqual(file);
  });

  it("round-trips through the raw path when compression is unavailable", async () => {
    const file = sampleFile();
    const payload = await encodeReplayPayload(file, { preferRaw: true });
    expect(payload.startsWith("p")).toBe(true);
    const parsed = parseReplayFile(await decodeReplayPayloadData(payload));
    expect(parsed.ok).toBe(true);
  });

  it("builds share URLs and extracts payloads from location hashes", async () => {
    const file = sampleFile();
    const url = await buildReplayShareUrl(file, "https://example.test/sim/");
    expect(url.startsWith("https://example.test/sim/#r=")).toBe(true);
    expect(payloadFromHash(url.slice(url.indexOf("#")))).toBeTruthy();
    expect(payloadFromHash("")).toBeNull();
    expect(payloadFromHash("#nope=1")).toBeNull();
  });

  it("rejects unknown payload modes and oversized payloads", async () => {
    await expect(decodeReplayPayloadData("x123")).rejects.toThrow(/unknown share payload mode/);
    await expect(decodeReplayPayloadData("z")).rejects.toThrow(/too short/);
    await expect(decodeReplayPayloadData("p" + "A".repeat(4_000_001))).rejects.toThrow(
      /share payload too large/,
    );
  });
});

describe("replay runtime parser", () => {
  it("accepts a well-formed replay file", () => {
    const parsed = parseReplayFile(JSON.parse(JSON.stringify(sampleFile())));
    expect(parsed.ok).toBe(true);
  });

  it("rejects unknown top-level fields and wrong schema versions", () => {
    const evil = sampleFile() as unknown as Record<string, unknown>;
    evil.schemaVersion = 99;
    const r1 = parseReplayFile(evil);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.some((e) => e.includes("schemaVersion"))).toBe(true);

    const sneaky = { ...sampleFile(), pwned: true } as unknown;
    const r2 = parseReplayFile(sneaky);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.some((e) => e.includes("unknown field: pwned"))).toBe(true);

    const old = { ...sampleFile(), schemaVersion: 1 };
    const r3 = parseReplayFile(old);
    expect(r3.ok).toBe(false);
  });

  it("rejects non-finite and out-of-range command payloads", () => {
    const file = sampleFile();
    (file.commands[0].action as { payload: { fwd: number } }).payload.fwd = Number.NaN;
    const r1 = parseReplayFile(file);
    expect(r1.ok).toBe(false);

    file.commands[0].action = { kind: "axes", slot: 0, payload: { fwd: 7, strafe: 0, turn: 0 } };
    const r2 = parseReplayFile(file);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.join()).toContain("[-1,1]");
  });

  it("rejects out-of-range ticks and bad hashes", () => {
    const file = sampleFile();
    file.commands[0].tick = 999;
    const r1 = parseReplayFile(file);
    expect(r1.ok).toBe(false);

    file.commands[0].tick = 3;
    file.finalStateHash = "NOTAHASH";
    const r2 = parseReplayFile(file);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.join()).toContain("finalStateHash");
  });

  it("rejects forged slots and duplicate/unknown action keys", () => {
    const file = sampleFile();
    file.commands.push({ tick: 5, action: { kind: "release", slot: 9 } });
    const r1 = parseReplayFile(file);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.join()).toContain("[0,7]");

    file.commands.pop();
    file.checkpoints.push({ tick: -5, hash: "cccccccc" });
    const r2 = parseReplayFile(file);
    expect(r2.ok).toBe(false);
  });
});
