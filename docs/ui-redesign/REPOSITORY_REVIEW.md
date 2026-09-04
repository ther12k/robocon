# Repository Review and Design Gap Analysis

**Review date:** 2026-09-05. **Pinned baseline:** `f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a`. This is a source-grounded UI implementation review, not a new comprehensive security audit.

## Finding

The requested design is **not already implemented**. The inspected markup exposes a viewport, compact toolbar, floating information/robot panels, JSON builder and script/replay panels. Its stylesheet uses dark tokens and absolute positioning. The reference instead uses an always-visible light application shell with a left control column, framed arena, and right inspector cards. [S02](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/index.html#L9-L99) [S03](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/style.css#L1-L36)

The newer `f5092ff` revision contains share-button synchronization, ended-match replay preparation and playback braking changes. Those are behavioral fixes, not a dashboard redesign. Prior audit claims must not be reopened from an older cached page; verify current implementation before creating duplicate bugs. [S01](https://github.com/ther12k/robocon/commit/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a) [S05](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts)

## Capability-to-reference mapping

| Reference element | Verified baseline | Planned treatment | Launch issue(s) |
|---|---|---|---|
| Light background, white cards, blue active state | Dark global theme and floating overlays | New design tokens and responsive shell | RUI-003, 008, 009 |
| Practice / Robot Builder / Load Script / Replay navigation | Toolbar actions and panels | Navigation opens views/panels without resetting the world | RUI-006, 008 |
| Clickable R1/R2 robot cards | Two presets and keyboard slot cycling | Data-driven selection cards; real role and team labels | RUI-010 |
| On-screen direction pad | Keyboard input exists | Pointer + keyboard input arbitration and cancellation | RUI-011, 013 |
| Speed 50%, Normal/Precision | No corresponding UI control | Scale manual command amplitudes; do not change simulation time | RUI-012 |
| Top View / 3D / fullscreen | Top/perspective/follow camera exist | Present segmented control; add fullscreen capability checks | RUI-007, 015 |
| Attractive framed arena | Existing render scene and placeholder field | Frame existing live canvas; rendering-only polish | RUI-016 |
| Session Status and match timer | Match controller and score presentation exist | Always-visible status, phase and provenance | RUI-018, 019 |
| Position, orientation and speed | Rigid-body getters and a speed sparkline | Read-only telemetry mapping with correct units | RUI-017 |
| Battery 100% | No battery contract found | Omit from launch, never hardcode 100% | RUI-041 deferred |
| Weather / Lighting: Normal | Scene lighting is configured, no weather model found | Omit weather; optionally display a truthful default-lighting label | RUI-016, 041 deferred |
| Manipulator: Closed | Holding/held ID, not jaw-state sensing | Display Empty / Holding / Not installed | RUI-014, 017 |
| Lift Up / Lower Down | Module union contains gripper only | Hide; not a restyling task | RUI-040 deferred |
| Reset Robot | Team respawn exists, not an exposed selected-slot reset | Add guarded selected-slot reset for idle practice only | RUI-014 |
| Autonomy card + Run | Worker/editor/run/stop available | New presentation, explicit trusted-code warning and ownership | RUI-020, 021 |
| Replay card, export, load, share | Existing capture/playback/JSON/share mechanisms | Reuse through controller, status and real control tests | RUI-022–025 |
| Seekable replay timeline | No seek/pause UI or exposed seek implementation verified | Read-only progress in launch; interactive seeking deferred | RUI-024, 039 deferred |
| User / Student Team menu | No auth product in inspected application entry/dependencies | Local session label and local display preferences only | RUI-028 |
| Tips & Hints | Compact keyboard instructions | Contextual help card with dismiss/reset preference | RUI-027 |
| Responsive light panels | Viewport-bound overlay CSS | Deliberate desktop/tablet/phone arrangements | RUI-029 |

Evidence for this table is distributed across [S02](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/index.html#L9-L99) [S03](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/style.css#L1-L36) [S05](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts) [S06](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/ui/RobotBuilderPanel.ts) [S07](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/input/InputManager.ts) [S08](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/CameraRig.ts) [S09](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/SimulationCore.ts) [S10](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts) [S11](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/types.ts#L101-L199) [S12](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/arenas/default.json#L1-L39) [S13](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r1.json) [S14](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r2.json) [S15](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/robot/GripperController.ts) [S16](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/autonomy.ts) [S17](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/replayFile.ts). Absence claims are scoped to the inspected baseline files; re-check before implementation.

## Reuse versus new work

**Reuse:** physics and ownership logic; drive and gripper commands; match state and logs; input/replay locks; camera behavior; validation functions; replay parser, compatibility, hashes and export payloads; existing tests. This is a UI modernization with some missing interaction work, not a rewrite.

**Build:** shell, cards, tabs, drawer management, selected-robot control surface, manual throttle, interaction-source arbitration, light presentation, inspector data adapter, accessible focus handling, responsive layout and UI-level test coverage.

**Add only under explicit domain contracts:** selected-slot practice reset, per-source command cancellation, and missing read-only telemetry accessors. These changes need deterministic tests; do not mutate rigid bodies from view components.

**Defer:** seeking/time scaling, lift physics, energy/weather simulation, accounts, multiplayer, cloud replay storage, video export and detailed CAD assets. The arena in the picture is illustrative; its props and dimensions must not overwrite the repository configuration.

## File-level migration map

| Existing file | Responsibility retained | Planned extraction/addition |
|---|---|---|
| `index.html` | Entry document, semantic landmarks, viewport ID | New shell markup, regions and asset-safe title |
| `src/style.css` | Entry stylesheet | Token/theme/layout/component CSS modules or imports |
| `src/main.ts` | Bootstrap and one render loop | `src/app/*` controller/adapter; `src/ui/components/*` presentation |
| `src/ui/RobotBuilderPanel.ts` | Existing validation/apply integration | Restyled editor with focus lifecycle and import/export actions |
| `src/sim/input/InputManager.ts` | Keyboard sampling | Focus-scoped keys, pointer integration through an input arbiter |
| `src/sim/CameraRig.ts` | Camera ownership | Explicit view selection adapter and container-resize integration |
| `src/core/SimulationCore.ts` | Authoritative simulation | Narrow read-only projection and selected-slot reset only where needed |
| `src/core/match.ts` | Match lifecycle and score | Read-only summary consumption; no second UI timer |
| `tests/smoke.browser.test.ts` | Real browser foundation | New UI interaction assertions; retain previous regressions |

All new paths above are **proposals**, not claimed existing files. No new runtime dependency is mandatory. [S04](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/package.json) [S05](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts) [S06](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/ui/RobotBuilderPanel.ts) [S07](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/input/InputManager.ts) [S08](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/CameraRig.ts) [S09](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/SimulationCore.ts) [S10](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts) [S18](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/tests/smoke.browser.test.ts)

## Confidence and verification

High confidence: the inspected UI does not match the supplied layout; the engine foundation exists; several illustrated fields have no baseline data contract. Not assessed here: deployed URL appearance, local unpushed work, current performance numbers, all historical bugs, or public-beta security readiness. A UI release is not automatically a declaration that the simulator is suitable for untrusted scripts or official competition use.
