# Technical Architecture and Incremental Migration

## Decision: stay on the current stack

The pinned project declares TypeScript, Vite, Three.js, Rapier, Vitest and Puppeteer. Do not introduce React, a router, a global state framework or a backend for this redesign. A modular DOM UI is sufficient and avoids replacing the rendering/physics integration while fixing presentation. Pin dependencies through the existing lockfile; upgrades are separate changes. [S04](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/package.json)

## Proposed module structure

All paths below are **new/proposed** except the existing files explicitly named.

```text
src/
  main.ts                        # existing; becomes thin bootstrap
  app/
    AppController.ts             # commands + lifecycle admission
    SimulatorAdapter.ts          # projects existing core/controllers
    UiStore.ts                   # immutable snapshots, subscriptions
    capabilities.ts              # pure admission functions + reason codes
    InputArbiter.ts               # manual/worker/replay source ownership
    preferences.ts               # local, bounded, versioned UI settings
  ui/
    AppShell.ts                  # light shell, one set of IDs
    PanelManager.ts              # focus and overlay lifetime
    components/
      RobotControlCard.ts
      AutonomyCard.ts
      QuickActionsCard.ts
      ArenaViewport.ts
      SessionCard.ts
      TelemetryCard.ts
      ReplayCard.ts
      MatchResultPanel.ts
      TipsCard.ts
    RobotBuilderPanel.ts         # existing; reuse validator/apply path
    styles/
      tokens.css
      shell.css
      components.css
      responsive.css
  core/                          # retain domain ownership
  sim/                           # retain physics, camera and input fundamentals
  render/                        # rendering-only visual improvements
```

## Ownership

There is one SimulationCore, one MatchController, one AutonomyManager, one renderer, one camera rig, and one simulation/render loop. Views subscribe to snapshots and dispatch intents; they do not own simulation time or create new controller instances when tabs change. Never recreate the canvas element or WebGL context during inspector transitions.

Retain core input locks and existing replay contracts. AppController can orchestrate calls but cannot bypass validation to get a disabled button to work. Limit core additions to missing read-only accessors, cancellable source queues and selected-slot reset required by the new control surface. Each addition gets parity tests and isolated review.

## Snapshot flow

Adapter reads from the existing controllers after a completed fixed step or on an explicit state transition. Store retains primitive values and immutable copies; never expose Rapier handles, mutable bodies or the world to components. Match/replay/source transitions publish immediately; telemetry and sparkline sample at up to 10 Hz. Renderer remains at animation-frame cadence, independent of DOM cadence.

A snapshot includes session generation. Async subscriptions and file requests carry generation/request IDs; stale results cannot replace new state. Unsubscribe functions and event-listener cleanup are required for every mount.

## Bootstrap sequence

1. Read feature flag and bounded UI preferences.
2. Mount exactly one shell (legacy or light) before resolving DOM references.
3. Create renderer and controllers once; show a real loading state.
4. Load and validate configured assets; do not duplicate or silently alter arena configuration.
5. Attach adapter/store and input arbiter.
6. Attach stable UI handlers, resize observation and disposal.
7. Publish ready state and process a pending replay hash non-destructively.
8. Start the single frame loop.

The existing application has many direct DOM references in `src/main.ts`. Preserve stable IDs initially or update all selectors/test probes atomically. Do not mount both old and new markup with duplicate IDs. [S05](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts)

## Renderer/container integration

Observe the arena's content box with ResizeObserver. Recompute renderer size and camera projection after layout changes, fullscreen, device-pixel-ratio changes and drawer transitions. Ignore zero-sized measurements while hidden. Set CSS size separately from rendering-buffer size and preserve the current DPR cap unless measured evidence justifies a change.

Call camera resize using measured width/height, not `window.innerWidth/innerHeight`. MeasureTool pointer coordinates must use the canvas bounding rectangle. Dispose resize listeners and fullscreen handlers. Do not rebuild the physics world on resize.

## Replay compatibility and navigation

Keep `#r=` payload handling reserved for replay sharing. Use view state and, if needed, query parameters for the UI mode; don't repurpose the fragment as a client router. Use the existing base-URL asset resolution for subdirectory deployment.

A UI build changes build identity under the existing replay contract. Do not weaken exact-build checks in order to make a previous fixture load. Generate same-build comparison fixtures or explicitly document incompatibility; relaxing identity is a separate versioned decision. Compare command streams/domain behavior under identical fixture conditions.

## Input integration

Keyboard and pointer states feed a single manual sampler. Apply throttle once, then submit through the existing bus. Source arbitration means no manual sample is submitted while autonomy owns a slot. Neutralization on source/panel interruption happens before releasing ownership, with re-arm on fresh input. No timer repeatedly fires simulated keyboard events.

For pointer driving, use Pointer Events, pointer capture and cancellation. Pointer-up, pointer-cancel, lost capture, visibility/blur and active-slot changes all clear pressed state. Native controls such as sliders never trigger drive shortcuts. [S23](https://www.w3.org/TR/pointerevents3/)

## Test strategy and tooling

Retain existing Vitest and Puppeteer infrastructure. Extend rather than replace. The current CI defines typecheck, test, build and browser jobs on Node 22; local baseline commands should use the repository lockfile and record exact browser version. This describes the baseline, not a promise that new tests were run for this package. [S19](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/.github/workflows/ci.yml)

Add focused unit suites for capability functions, view projections, preference parsing, input arbitration and panel lifetime. Browser suites operate real buttons, keyboard/pointer events, file inputs, downloads and hash URLs. Testing can use probes for observation and fixture preparation, not as a replacement for the UI action under test.

## Incremental rollout

M0: pin baseline, preserve regression evidence, approve capability-safe design.
M1: extract snapshot/controller/focus/resize seams and mount the light shell behind a flag.
M2: implement left/center/right live cards and match/autonomy states.
M3: complete Builder/replay/export/share/preferences flows.
M4: responsive/accessibility/performance tests, release evidence, staged default switch.

Use a query such as `?ui=light` while feature-flagged and keep `?ui=legacy` as rollback until the approved stabilization window ends. Flag reads happen before mounting; no concurrent shells. Neither mode changes replay content. Remove legacy code only in a subsequent explicitly approved cleanup, not as a condition for first preview.
