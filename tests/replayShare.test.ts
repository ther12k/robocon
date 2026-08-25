import { describe, expect, it } from "vitest";
import {
  buildReplayShareUrl,
  decodeReplayPayload,
  encodeReplayPayload,
  replayFromHash,
} from "../src/core/replayShare";
import type { ReplayFile } from "../src/core/replayFile";

function sampleFile(): ReplayFile {
  return {
    schemaVersion: 1,
    engineVersion: "0.4.1-test",
    physicsVersion: "0.12.0",
    fixedDt: 1 / 60,
    configHashes: { arena: "abc123", competition: "def456" },
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

    const decoded = await decodeReplayPayload(payload);
    expect(decoded).toEqual(file);
  });

  it("round-trips through the raw path when compression is unavailable", async () => {
    const file = sampleFile();
    const payload = await encodeReplayPayload(file, { preferRaw: true });
    expect(payload.startsWith("p")).toBe(true);
    const decoded = await decodeReplayPayload(payload);
    expect(decoded).toEqual(file);
  });

  it("builds share URLs and recovers replays from location hashes", async () => {
    const file = sampleFile();
    const url = await buildReplayShareUrl(file, "https://example.test/sim/");
    expect(url.startsWith("https://example.test/sim/#r=")).toBe(true);
    const recovered = await replayFromHash(url.slice(url.indexOf("#")));
    expect(recovered).toEqual(file);
    expect(await replayFromHash("")).toBeNull();
    expect(await replayFromHash("#nope=1")).toBeNull();
  });

  it("rejects unknown payload modes instead of guessing", async () => {
    await expect(decodeReplayPayload("x123")).rejects.toThrow(/unknown share payload mode/);
    await expect(decodeReplayPayload("z")).rejects.toThrow(/too short/);
  });
});
