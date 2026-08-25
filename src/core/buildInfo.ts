/**
 * Build identity injected by Vite's `define` (bare-identifier substitution).
 * Falls back to "dev" outside production builds (unit tests, plain tsx), so
 * values stay stable within a process while distinguishing real deployments.
 */
declare const __BUILD_ID__: string | undefined;
declare const __WASM_HASH__: string | undefined;

export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
export const WASM_HASH = typeof __WASM_HASH__ !== "undefined" ? __WASM_HASH__ : "dev";
