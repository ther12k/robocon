import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function coreFiles(): string[] {
  const dir = join(process.cwd(), "src", "core");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(dir, f));
}

describe("SimCore DOM purity (R1)", () => {
  it("contains no direct window/document access in src/core", () => {
    const offenders: string[] = [];
    for (const file of coreFiles()) {
      const src = readFileSync(file, "utf8");
      if (/[^.\w](window|document)\./.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
