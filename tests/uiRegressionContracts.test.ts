import { describe, it, expect } from "vitest";
import { parseReplayFile, REPLAY_SCHEMA_VERSION } from "../src/core/replayFile";
import { ENGINE_VERSION } from "../src/core/SimulationCore";
import { checkSchemaVersion, SCHEMA_VERSIONS } from "../src/core/schemas";
import { BUILD_ID, WASM_HASH } from "../src/core/buildInfo";

describe("UI Regression Contracts (RUI-002)", () => {
  it("enforces schema version compatibility contract across core kinds", () => {
    expect(SCHEMA_VERSIONS.arena).toBeGreaterThan(0);
    expect(SCHEMA_VERSIONS.robot).toBeGreaterThan(0);

    const validCheck = checkSchemaVersion("robot", { schemaVersion: SCHEMA_VERSIONS.robot });
    expect(validCheck.ok).toBe(true);

    const futureCheck = checkSchemaVersion("robot", { schemaVersion: SCHEMA_VERSIONS.robot + 99 });
    expect(futureCheck.ok).toBe(false);

    const invalidTypeCheck = checkSchemaVersion("robot", { schemaVersion: "invalid" });
    expect(invalidTypeCheck.ok).toBe(false);
  });

  it("enforces replay schema version and parser bounds", () => {
    expect(REPLAY_SCHEMA_VERSION).toBeGreaterThan(0);
    const invalidJson = "{ invalid: json ]";
    const result = parseReplayFile(invalidJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("enforces build identity constants are present and non-empty", () => {
    expect(typeof BUILD_ID).toBe("string");
    expect(BUILD_ID.length).toBeGreaterThan(0);
    expect(typeof WASM_HASH).toBe("string");
    expect(WASM_HASH.length).toBeGreaterThan(0);
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
  });
});
