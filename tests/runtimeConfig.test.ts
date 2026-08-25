import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateArenaRuntime,
  validateCompetitionRulesetRuntime,
  validateSimulationProfileRuntime,
} from "../src/sim/runtimeConfig";

const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

describe("runtime config validation", () => {
  it("accepts the shipped production configs", () => {
    const ruleset = readJson("../public/config/competition-ruleset.json");
    const profile = readJson("../public/config/simulation-profile.json");
    const arena = readJson("../public/arenas/default.json");

    expect(validateCompetitionRulesetRuntime(ruleset)).toEqual([]);
    expect(validateSimulationProfileRuntime(profile)).toEqual([]);
    expect(validateArenaRuntime(arena)).toEqual([]);
  });

  it("rejects a ruleset without role constraints (the shipped-config P0)", () => {
    const missing = { ...readJson("../public/config/competition-ruleset.json") };
    delete missing.robots;
    const errors = validateCompetitionRulesetRuntime(missing);
    expect(errors.some((e) => e.startsWith("robots"))).toBe(true);

    const empty = { ...missing, robots: {} };
    expect(validateCompetitionRulesetRuntime(empty).some((e) => e.includes("at least one role"))).toBe(true);
  });

  it("rejects unsupported object initial states explicitly", () => {
    const arena = readJson("../public/arenas/default.json");
    arena.objectSpawns[0].initialState = "scored";
    const errors = validateArenaRuntime(arena);
    expect(errors.some((e) => e.includes('initialState "scored" is not supported'))).toBe(true);
  });
});
