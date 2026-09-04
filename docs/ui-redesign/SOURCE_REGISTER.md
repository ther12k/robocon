# Source Register and Review Provenance

**Review date:** 2026-09-05. **Immutable planning revision:** `f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a`.

Repository facts below were verified from public source retrieval. The `main` history pages showed inconsistent cached revisions; a filtered history exposed `f5092ff`, which was then inspected via immutable source paths. Direct Git access in the container failed DNS resolution. No local checkout, browser rendering, build or tests are claimed for this document package.

The most important distinction is: **current facts** are limited to these inspected files; **proposed requirements** are original implementation decisions in this pack; **visual direction** comes from the user-selected image. Historical chat summaries and unrelated Bundar notes are not implementation evidence.

## V01

**User-supplied light dashboard.** Local asset: [reference-dashboard.png](assets/reference-dashboard.png). Dimensions: 1672×941. SHA-256: `18d8680065e691bd9ccb1ff7839221c21ff7356cd0f2f1d2c05b8875adc0469e`. Exact supplied bytes are preserved. It is a generated design reference, not a runtime screenshot or rulebook.

## S01

**Verified planning revision.** [Source](https://github.com/ther12k/robocon/commit/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a)

Public commit f5092ff, dated 27 August 2026; UI behavior fixes, not the proposed dashboard redesign.

## S02

**Application markup.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/index.html#L9-L99)

One viewport, toolbar, floating information/robot panels, score banner, script and replay panels.

## S03

**Current stylesheet.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/style.css#L1-L36)

Dark tokens, viewport-filling canvas, absolute-positioned overlays; no light three-column dashboard in this stylesheet.

## S04

**Declared stack and scripts.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/package.json)

TypeScript/Vite; Three.js and Rapier dependencies; Vitest and Puppeteer-based browser testing. Version ranges are baseline declarations, not upgrade recommendations.

## S05

**Application orchestration.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts)

DOM wiring, render loop, telemetry, recorder ownership, UI handlers, and the newer replay preparation path.

## S06

**Builder panel.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/ui/RobotBuilderPanel.ts)

DOM-based JSON editor with slot tabs, validation and apply. It is not a CAD editor or the illustrated form-heavy builder.

## S07

**Input implementation.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/input/InputManager.ts)

Keyboard command sampling and UI/simulation context. Pointer-pad and throttle/precision UI require new implementation.

## S08

**Camera implementation.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/CameraRig.ts)

Perspective and orthographic cameras, orbit, follow, reset and resize operations exist.

## S09

**Simulation facade/core.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/SimulationCore.ts)

Command ingress, slot/body/spec getters, replay capture/playback and neutralization primitives. Proposed adapter APIs are not existing APIs.

## S10

**Match controller.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts)

idle/setup/countdown/playing/ended states, score, retries and event entries available to a new presentation layer.

## S11

**Data and module types.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/types.ts#L101-L199)

Drive, gripper, arena, match and profile contracts; no battery, lift or weather simulation contract in these types.

## S12

**Default arena.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/arenas/default.json#L1-L39)

Explicitly provisional/inferred placeholder; 16 by 16 meter baseline, not the detailed illustrated field.

## S13

**Default R1.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r1.json)

Preset R1 is red and differential-drive. Role, team and active-selection color are different concepts.

## S14

**Default R2.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r2.json)

Preset R2 is blue and mecanum-drive.

## S15

**Gripper implementation.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/robot/GripperController.ts)

Holding and held-object identity exist; mechanical jaw-open sensor and lift actuation do not appear here.

## S16

**Autonomy manager.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/autonomy.ts)

Worker lifecycle and tick/session checks; reuse rather than replace when restyling.

## S17

**Replay schema/parser.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/replayFile.ts)

Existing JSON replay and compatibility contracts; no UI-redesign schema fork.

## S18

**Browser smoke suite.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/tests/smoke.browser.test.ts)

Existing browser test foundation; new UI tests must exercise real controls and downloads.

## S19

**CI workflow.** [Source](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/.github/workflows/ci.yml)

Baseline Node 22 jobs run typecheck, unit tests, build and headless-Chrome smoke.

## S20

**GitHub issue creation.** [Source](https://cli.github.com/manual/gh_issue_create)

Official CLI flags for title, body file, labels and milestone.

## S21

**GitHub API through CLI.** [Source](https://cli.github.com/manual/gh_api)

Official CLI interface used by the optional registration helper.

## S22

**WCAG 2.2.** [Source](https://www.w3.org/TR/WCAG22/)

Accessibility reference. The package sets an implementation target, not a conformance certification.

## S23

**Pointer Events.** [Source](https://www.w3.org/TR/pointerevents3/)

Reference for pointer capture, cancellation and pointer lifecycle handling.

## Verification scope

The lack of the target light dashboard is demonstrated by the pinned markup and dark absolute-positioned CSS. Existing functionality is inferred only from the named concrete modules/handlers. No statement here certifies all engine bugs fixed, all tests passing, latest deployment state, or official competition fidelity. RUI-001 reconciles this plan with the actual implementation checkout.
