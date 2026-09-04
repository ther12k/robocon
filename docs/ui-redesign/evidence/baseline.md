# Baseline Verification Evidence (RUI-001)

**Date:** 2026-09-05  
**Repository:** `ther12k/robocon`  
**Git SHA:** `f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a` (`f5092ff`)  
**Branch:** `main`  
**Working tree state at verification:** Clean (untracked `.zcode/` only)  
**Package-lock SHA-256:** `4cfd5e958255becf5b1ee7a8a413c83a4234fb1f6b2c1500ad032cae801a47c3`  
**Reference Image SHA-256 (`assets/reference-dashboard.png`):** `18d8680065e691bd9ccb1ff7839221c21ff7356cd0f2f1d2c05b8875adc0469e` (exact match to `MANIFEST.md`)  

---

## 1. Environment

- **Node.js:** `v22.23.2`
- **npm:** `10.9.8`
- **Browser for tests / headless capture:** Google Chrome `152.0.7977.75` (Puppeteer-core headless)
- **OS:** Linux 7.0.0-30-generic x64

---

## 2. Command Execution & Test Verification

### A. TypeScript Typecheck
- **Command:** `npm run typecheck` (`tsc --noEmit`)
- **Result:** Success (0 errors, clean)

### B. Unit & Core Test Suite
- **Command:** `npm test` (`vitest run --exclude "tests/smoke.browser.test.ts"`)
- **Result:** 14 test files passed, 123 tests passed (0 failed)
  - `commandBus.test.ts`: 6 passed
  - `specValidator.test.ts`: 12 passed
  - `replayShare.test.ts`: 11 passed
  - `gripper.test.ts`: 5 passed
  - `runtimeConfig.test.ts`: 3 passed
  - `geometry.test.ts`: 8 passed
  - `determinism.test.ts`: 2 passed
  - `corePurity.test.ts`: 1 passed
  - `replay.test.ts`: 7 passed
  - `autonomy.test.ts`: 22 passed
  - `simulationCore.test.ts`: 6 passed
  - `matchFlow.test.ts`: 14 passed
  - `replayFile.test.ts`: 18 passed
  - `determinismFuzz.test.ts`: 8 passed
- **Duration:** 3.33s

### C. Build
- **Command:** `npm run build` (`tsc --noEmit && vite build`)
- **Result:** Success (35 modules transformed, production bundle in `dist/`, built in 2.58s)

### D. Browser Smoke Test Suite
- **Command:** `npm run test:browser` (`npm run build && vitest run --config vitest.smoke.config.ts`)
- **Result:** 1 test file passed, 13 tests passed (0 failed)
  - boots to ready phase with no page errors
  - robot mesh follows physics body when driven
  - grab -> release -> re-grab works in the live app
  - builder presets validate and apply without exceptions for both slots
  - typing in the builder JSON editor does not drive the robot
  - top view switches to orthographic camera
  - replay round-trip: record, export, load, play back to the same pose
  - start match leaves idle phase, shows scoreboard, world stays alive
  - follow mode persists across slot switches and Enter on a button never starts a match
  - status panels render worker and replay metadata as text, not HTML
  - autonomy script reaches running state in a live blob worker
  - watchdog terminates an infinite-loop script without freezing the tab
  - share links load a replay on a cold page open
- **Duration:** 22.84s

---

## 3. UI Baseline Assessment vs. Reference Dashboard

- **Baseline Screenshot:** Saved at `docs/ui-redesign/evidence/baseline-dark-ui-1440x900.png` (captured at 1440×900 viewport from Vite preview server).
- **Appearance:** Fullscreen dark canvas with floating semi-transparent HUD panels (Match, Telemetry, Controls, JSON Builder, Autonomy, Replay).
- **Gaps Confirmed:**
  - The UI does not use the light three-column design (left sidebar controls, central framed canvas card, right status/telemetry/replay cards).
  - Pointer driving controls (D-pad/directional pointer buttons) and manual throttle / precision modes are absent.
  - Robot cards with telemetry summary, status tags, and honest state indication are not present.
  - Controls need unified focus handling, panel manager lifecycle, and accessible ARIA roles.
  - Visual styling matches the legacy dark theme, confirming the requirements for RUI-004 through RUI-038.
- **Approved Visual Deviations Preserved:**
  - No simulated battery/weather/network/account data (omitted honestly per PRD/DESIGN_SPEC).
  - Arena remains provisional Robocon specification without inventing unverified physics colliders.
