# Proposed UI Data and Command Contracts

This document defines implementation contracts; the interfaces below do **not** already exist in the baseline. Map them to verified getters in [Source Register](SOURCE_REGISTER.md).

## Read model

```ts
type SlotId = number;
type Availability<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: string };

type UiSnapshot = Readonly<{
  sessionId: number;
  boot: "loading" | "ready" | "failed";
  activeSlot: SlotId | null;
  robots: readonly RobotCardModel[];
  telemetry: Availability<RobotTelemetry>;
  match: MatchView;
  replay: ReplayView;
  arena: { name: string; provenance: "official" | "draft" | "inferred" | "unknown"; note: string };
  camera: { view: "top" | "perspective"; following: SlotId | null; measuring: boolean };
  activePanel: "none" | "builder" | "script" | "replay-detail" | "preferences" | "inspector";
}>;
```

Objects are primitive projections, never raw Three.js vectors or Rapier body handles. `RobotCardModel`, `MatchView` and `ReplayView` are to be implemented with the fields described below, not imported from nonexistent core types.

## Field mapping

| UI field | Authoritative source | Transform / null policy |
|---|---|---|
| Robot slot/name/role/team/drive | `activeSlots()`, `getSpec(slot)` | Preserve slot identity; role is not team |
| Position X, Z | `getBody(slot).translation()` | Meters, two decimals; zero is a value, not unavailable |
| Optional height Y | Same translation | Meters; label as height, not planar Y |
| Orientation | existing `yawFromQuaternion(body.rotation())` | Degrees; document wrap convention and test near ±180° |
| Linear speed | `body.linvel()` | `hypot(v.x, v.z)` m/s |
| Yaw rate | `body.angvel().y` | Signed rad/s; magnitude-only display must be labeled accordingly |
| Gripper state | Existing core grip getter or ownership read projection | Empty / Holding ID / Not installed; add read-only getter if necessary |
| Autonomy state/details | `autonomy.status(slot)` | Map existing enum; no invented network status |
| Match phase/time/score/retries | MatchController getters | Use fixed-step derived values; retries denominator from rules/controller |
| Event entries | `match.entries` | Render bounded recent view; do not drain the domain log |
| Arena label/provenance | `arena.meta` | Unknown or inferred remains visibly provisional |
| Replay metadata | Validated ReplayFile | Name, duration from totalTicks×fixedDt, identity/compatibility; bounded text |
| Playback progress | Core tick and loaded totalTicks | Clamp 0–1; read-only, never a fake seek slider |
| Verification | Core completion/desync/error result snapshot | Compatible ≠ verified; save result before cleanup |
| Battery/weather/lift | No baseline source verified | Omit or explicit capability unavailable in an advanced inspector |

Baseline getters/types support most of this mapping. Missing read-only accessors are small adapter/domain tasks; inventing values is not allowed. [S09](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/SimulationCore.ts) [S10](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts) [S11](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/types.ts#L101-L199) [S15](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/robot/GripperController.ts) [S16](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/autonomy.ts) [S17](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/replayFile.ts)

## Command facade

Proposed commands return a typed outcome and can be denied without mutation:

```ts
type CommandResult =
  | { ok: true }
  | { ok: false; code: string; message: string };
```

| Intent | Handler requirements |
|---|---|
| `selectRobot(slot)` | Validate live slot; clear old manual holds; update all slot-bound projections |
| `submitManualAxes(slot, axes)` | Source ownership; drive capability; finite clamped inputs; throttle applied once |
| `stopDriving(slot)` | Clear manual held state; enqueue neutral axes; no global body mutation |
| `requestGrabOrRelease(slot)` | Module + state admission; command bus; authoritative possession determines label |
| `resetSelectedRobot(slot)` | Idle practice only; selected-slot domain operation; no tick/world reset |
| `setCameraView(view)` | Idempotent adapter over current camera; render-only |
| `setFollow(slotOrNull)` | Actual camera state published back to UI |
| `startMatch()` | Guard replay/recording/pending work; retain domain lifecycle |
| `startRecording(kind)` | Atomic reset/start/capture contract; disclose reset before action |
| `stopAndExport(owner)` | Owner check; meaningful capture; real JSON download; preserve valid artifact |
| `loadReplay(file)` | Byte cap → bounded parser → compatibility display; non-destructive |
| `playReplay()` | Validate before ended-state preparation; gate live sources |
| `stopReplay()` | Capture reason/result, stop injection, apply cleanup policy |
| `copyReplayLink()` | Valid file + idle transport; async request token; clipboard fallback |
| `runScript(slot, text)` | Explicit trust acknowledgement; bounded file/text; source/session policy |
| `stopScript(slot)` | Detach selected source and clear stale work; no opponent reset |
| `applyRobotSpec(slot, draft)` | Validate complete draft and proposed team mass before mutation |

The facade is a wrapper around existing functions and narrowly required additions, not an alternative physics implementation.

## Preferences schema (new, UI-only)

```ts
type UiPreferencesV1 = {
  version: 1;
  manualThrottlePercent: number; // clamp integer 0..100
  precision: boolean;
  hintsVisible: boolean;
  preferredView: "top" | "perspective";
  reduceUiMotion: boolean;
  localDisplayName?: string; // max 40 characters, text rendering only
};
```

Storage key: `robocon.ui.preferences.v1`. Parse defensively, ignore unknown versions with defaults, cap text length, and catch storage exceptions. Store no live physics state, script source, personal identifier, replay payload or credentials. Display preferences affect new manual commands, not loaded replay commands or config hashes.

## Display formatting

Use consistent SI units with explicit labels. Missing data is `—`, not numeric zero. Normalize negative zero in formatted display without altering engine values. Preserve enough precision for debugging in an advanced view; avoid full-resolution floating-point noise in the primary card. A concise status message is text, not HTML.

## Histories and logs

Proposed sparkline history: 120 samples at 10 Hz, approximately 12 seconds. Reset or segment history on selected-slot/session change so one robot's samples are not attributed to another. Cap visible event rows at 100 with an expandable bounded view; preserve the existing domain log for authoritative replay logic. Avoid reserializing whole configs every animation frame.
