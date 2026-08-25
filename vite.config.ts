import { defineConfig } from "vite";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

/** SHA-256 (first 12 hex) of the Rapier entry that embeds the WASM binary. */
function rapierWasmHash(): string {
  try {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const entryPath = require.resolve("@dimforge/rapier3d-compat");
    return createHash("sha256").update(readFileSync(entryPath)).digest("hex").slice(0, 12);
  } catch {
    try {
      const require = createRequire(path.join(process.cwd(), "package.json"));
      const pkgPath = require.resolve("@dimforge/rapier3d-compat/package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      return createHash("sha256").update(pkg.version ?? "unknown").digest("hex").slice(0, 12);
    } catch {
      return "dev";
    }
  }
}

void spawnSync;

export default defineConfig({
  base: "./",
  define: {
    __BUILD_ID__: JSON.stringify(gitShortSha()),
    __WASM_HASH__: JSON.stringify(rapierWasmHash()),
  },
  server: { port: 5173 },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          rapier: ["@dimforge/rapier3d-compat"],
        },
      },
    },
  },
});
