# Regression Invariant Inventory (RUI-002)

**Baseline SHA:** `f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a`  
**Date:** 2026-09-05  

This inventory pins and maps previous audit fixes and core invariants to ensure the UI redesign does not bypass or break any regression guarantees.

---

## 1. Regression Inventory Map

| Commit / Invariant | Core Area | Source Implementation | Test Coverage | UI Redesign Guardrails |
|---|---|---|---|---|
| **ca3ea1f**: Command after done is protocol violation | Autonomy Worker Protocol | `src/core/autonomy.ts` (`AutonomyManager.onWorkerMessage`) | `tests/autonomy.test.ts` ("rejects commands after session has concluded") | Worker session status transitions to `stopped` / `errored`; subsequent commands are rejected. UI must disable Run/Stop buttons accurately according to status. |
| **6970c5f**: Bind worker commands to originating tick ID | Tick Synchronization | `src/core/autonomy.ts` (`session.currentTick`, `tickId`) | `tests/autonomy.test.ts` ("drops commands with mismatched tick IDs") | Autonomy commands cannot execute out-of-order or apply to future ticks. Disallow queuing commands past current fixed-step tick. |
| **dbb267c**: Global parser error budget & oversized command rejection | Replay Ingestion Security & Memory | `src/core/replayFile.ts` (`parseReplayFile`, `MAX_PARSE_ERRORS = 50`, byte limits) | `tests/replayFile.test.ts` ("stops parsing after error budget exceeded", "rejects oversized commands") | UI replay loader must pass raw text to `parseReplayFile` with byte cap checks and display formatted issues safely via textContent. |
| **bca4384**: Discard worker messages across world-session resets | World & Session Resets | `src/core/autonomy.ts` (`sessionToken`, `sessionGeneration`), `SimulationCore.reset()` | `tests/autonomy.test.ts` ("ignores stale worker responses after world reset") | When resetting world or switching matches, increment session generation. Stale worker responses must be discarded by adapter and store. |
| **f5092ff**: Share button state, ended-match replay path, playback braking | UI Replay & Match Lifecycle | `src/main.ts`, `src/core/replayShare.ts`, `src/core/SimulationCore.ts` | `tests/replayShare.test.ts`, `tests/smoke.browser.test.ts` | Replay Share button only active when valid loaded or recorded replay exists; ended-match preserves final score; playback braking decelerates properly. |

---

## 2. Core Invariants and Purity Contracts

1. **SimulationCore Purity (`tests/corePurity.test.ts`)**:
   - `SimulationCore` never imports DOM, Three.js rendering classes, or window globals.
   - All physics calculations are deterministic and step-driven (`stepFixed(dt)`).
   - UI views cannot hold Rapier body handles or call mutable physics methods directly.

2. **Match Controller Lifecycle (`tests/matchFlow.test.ts`)**:
   - Match flows strictly through: `IDLE` -> `COUNTDOWN` -> `PLAYING` -> `ENDED`.
   - Inputs are gated during `COUNTDOWN` and disabled at `ENDED`.
   - Match banner and scoreboard reflect authoritative match state.

3. **Replay Determinism & Checkpointing (`tests/determinism.test.ts`, `tests/determinismFuzz.test.ts`)**:
   - State hashes match across identical seeds and command sequences.
   - Checkpoint restores produce bit-exact replays.

4. **Autonomy Sandboxing & Watchdog (`tests/smoke.browser.test.ts`)**:
   - Blob worker runs scripts in worker thread.
   - Script termination via watchdog does not freeze the UI or browser thread.
   - UI copy explicitly discloses: "Trusted code only — runs in a worker (thread isolation, not a security sandbox)".

5. **Same-Build Fixture Policy**:
   - Replay validation enforces build identity checks. Replays recorded with a different build version or schema version will report compatibility failure.
   - Downstream UI development must preserve exact-build validation checks and never weaken compatibility validation.
