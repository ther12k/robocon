/**
 * Build identity injected by Vite at bundle time. Falls back to "dev" when
 * running outside a production build (unit tests, plain tsx, etc.), so values
 * stay stable within a process while still distinguishing real deployments.
 */
const g = globalThis as { __BUILD_ID__?: string; __WASM_HASH__?: string };

export const BUILD_ID = g.__BUILD_ID__ ?? "dev";
export const WASM_HASH = g.__WASM_HASH__ ?? "dev";
