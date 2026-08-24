import { describe, it, expect } from "vitest";
import { validateSpec, validateTeamMass } from "../src/sim/specValidator";
import type { ValidationContext, RobotSpec } from "../src/sim/types";

const ruleset: ValidationContext = {
  roles: {
    R1: { maxFootprintMm: { w: 1000, l: 1000, h: 1000 }, extendedMm: { w: 1000, l: 1800, h: 1300 } },
    R2: { maxFootprintMm: { w: 800, l: 800, h: 800 }, extendedMm: { w: 800, l: 1300, h: 1300 } },
  },
  teamWeightBudgetKg: 50,
  limits: { maxSpeedMps: 3, maxAccelMps2: 8, maxTurnRps: 2 },
};

const valid = {
  name: "TestBot",
  role: "R2",
  team: "blue",
  chassis: {
    drive: "mecanum",
    footprint: { w: 0.5, l: 0.55 },
    height: 0.28,
    massKg: 14,
    maxSpeedMps: 2.4,
    maxAccelMps2: 5,
    maxTurnRps: 1.5,
  },
  modules: [{ type: "gripper", mount: { x: 0, y: 0.1, z: 0.32 }, gripRangeM: 0.22 }],
};

describe("specValidator basics", () => {
  it("accepts a valid spec and preserves values", () => {
    const { spec, issues } = validateSpec(valid, ruleset);
    expect(spec).toBeDefined();
    expect(spec!.name).toBe("TestBot");
    expect(spec!.chassis.maxSpeedMps).toBe(2.4);
    expect(spec!.modules).toHaveLength(1);
    expect(issues).toHaveLength(0);
  });

  it("rejects footprint exceeding role limit", () => {
    const bad = { ...valid, chassis: { ...valid.chassis, footprint: { w: 1.2, l: 0.55 } } };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field === "chassis.footprint.w")).toBe(true);
  });

  it("rejects invalid drive type and missing name", () => {
    const bad = { ...valid, name: "", chassis: { ...valid.chassis, drive: "hover" } };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field === "name")).toBe(true);
    expect(issues.some((i) => i.field === "chassis.drive")).toBe(true);
  });

  it("clamps overspeed to sim cap with warning", () => {
    const fast = { ...valid, chassis: { ...valid.chassis, maxSpeedMps: 10 } };
    const { spec, issues } = validateSpec(fast, ruleset);
    expect(spec!.chassis.maxSpeedMps).toBe(3);
    expect(issues.some((i) => i.message.includes("clamped"))).toBe(true);
  });

  it("requires numeric mount for gripper module", () => {
    const bad = { ...valid, modules: [{ type: "gripper", mount: { x: 0, y: 0.1 } }] };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field.startsWith("modules["))).toBe(true);
  });
});

describe("specValidator hardening (R0-06)", () => {
  it("rejects negative and zero dimensions", () => {
    const bad = {
      ...valid,
      chassis: { ...valid.chassis, footprint: { w: -1, l: 0 }, maxSpeedMps: -2 },
    };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.message.includes("footprint.w must be > 0"))).toBe(true);
    expect(issues.some((i) => i.message.includes("footprint.l must be > 0"))).toBe(true);
    expect(issues.some((i) => i.message.includes("maxSpeedMps must be > 0"))).toBe(true);
  });

  it("rejects negative mass, turn rate, accel, and grip range", () => {
    const bad = {
      ...valid,
      chassis: { ...valid.chassis, massKg: -5, maxAccelMps2: -4, maxTurnRps: -1 },
      modules: [{ type: "gripper", mount: { x: 0, y: 0.1, z: 0.3 }, gripRangeM: -0.5 }],
    };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field === "chassis.massKg" && i.level === "error")).toBe(true);
    expect(issues.some((i) => i.field === "chassis.maxAccelMps2")).toBe(true);
    expect(issues.some((i) => i.field === "chassis.maxTurnRps")).toBe(true);
    expect(issues.some((i) => i.field.endsWith("gripRangeM"))).toBe(true);
  });

  it("does not crash on prototype-chain role names", () => {
    const evil = { ...valid, role: "__proto__" };
    const { spec, issues } = validateSpec(evil, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field === "role" && i.level === "error")).toBe(true);
  });

  it("rejects non-finite numbers instead of defaulting silently", () => {
    const bad = {
      ...valid,
      chassis: { ...valid.chassis, maxSpeedMps: "fast" as unknown as number },
    };
    const { spec, issues } = validateSpec(bad, ruleset);
    expect(spec).toBeUndefined();
    expect(issues.some((i) => i.field === "chassis.maxSpeedMps")).toBe(true);
  });

  it("warns on unsupported schemaVersion but still validates", () => {
    const versioned = { ...valid, schemaVersion: 99 };
    const { spec, issues } = validateSpec(versioned, ruleset);
    expect(spec).toBeDefined();
    expect(issues.some((i) => i.field === "schemaVersion")).toBe(true);
  });
});

describe("validateTeamMass", () => {
  const heavyRed: RobotSpec = {
    name: "Heavy",
    role: "R1",
    team: "red",
    chassis: { drive: "differential", footprint: { w: 0.6, l: 0.7 }, massKg: 30 },
  };
  const lightBlue: RobotSpec = {
    name: "Light",
    role: "R2",
    team: "blue",
    chassis: { drive: "mecanum", footprint: { w: 0.5, l: 0.55 }, massKg: 14 },
  };

  it("flags team exceeding aggregate budget", () => {
    const red2: RobotSpec = { ...heavyRed, name: "Heavy2" };
    const issues = validateTeamMass([heavyRed, red2, lightBlue], 50);
    expect(issues.some((i) => i.field === "team.red.mass")).toBe(true);
    expect(issues.some((i) => i.field === "team.blue.mass")).toBe(false);
  });

  it("passes when both teams within budget", () => {
    const issues = validateTeamMass([heavyRed, lightBlue], 50);
    expect(issues).toHaveLength(0);
  });
});
