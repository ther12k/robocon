# Product Requirements — Robocon Arena Lab Light Dashboard

**Version:** 1.0 proposed. **Date:** 2026-09-05. **Owner:** repository maintainer. **Baseline:** `f5092ff`. **Primary reference:** [supplied light dashboard](assets/reference-dashboard.png).

## 1. Product decision

Transform Robocon's existing simulator into a clear, approachable control workspace matching the supplied light UI: white rounded cards, navy text, blue controls, a large central arena, robot controls on the left, and live status on the right.

The current application is a TypeScript/Vite browser simulator using Three.js and Rapier, with DOM-based panels. Preserve that stack and the engine. The required change is principally presentation and interaction architecture, not a new simulator or backend. [S02](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/index.html#L9-L99) [S03](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/style.css#L1-L36) [S04](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/package.json)

The reference is authoritative for **visual direction and hierarchy**, not for physical rules or unsupported features. Launch intentionally omits invented battery values, weather, lift actions, authenticated teams and seek controls. Default arena provenance remains visibly provisional. [S11](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/types.ts#L101-L199) [S12](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/arenas/default.json#L1-L39)

## 2. Problem and intended users

The current controls are dispersed in floating overlays and keyboard-first workflows. The proposed layout should let a user identify the active robot, move it, inspect telemetry, configure it, run a trusted script and review a recording without losing sight of the arena.

Primary persona: a student or robotics team member trying a robot configuration and control script. Secondary persona: a mentor/operator watching a match and reviewing results. These personas are planning assumptions, not results of user research.

Primary job: **select a robot, practice a movement, understand the result, and iterate**. Secondary jobs: validate a robot spec; run/stop autonomy safely; record a session, export it, and load a compatible replay.

## 3. Goals and success measures

Proposed acceptance targets, to be measured rather than claimed:

- A first-time evaluator can select the requested robot and move it within 60 seconds in at least 4 of 5 moderated attempts after loading.
- At least 4 of 5 evaluators can record, export, reload and play a compatible replay without developer-console assistance.
- The approved desktop screenshot matches the reference's light visual hierarchy and card layout, with intentional capability differences documented.
- Every visible action is functional, visibly unavailable with an explanation, or omitted. No simulated telemetry may be hardcoded as if measured.
- Existing deterministic fixtures still pass; a UI-only action does not alter simulation tick, score, ownership, command stream or compatibility metadata.
- Mandatory UI journeys pass automated browser checks, keyboard checks and the release review. The engine's existing security limitations remain explicit.

## 4. Launch scope

### FR-01 — Light application shell

Use the Robocon Arena Lab display name in the redesigned shell; keep package identity unchanged. Header contains Practice, Robot Builder, Load Script and Replay plus a visible Start Match action. Persistent three-column desktop workspace contains left controls, central arena and right inspector. Navigation changes presentation only; it must not reset the world or overwrite the replay URL hash.

### FR-02 — Boot, unavailable and failure states

Show real loading stages when available, otherwise an indeterminate loading status. Disable simulation actions until ready. Invalid configuration, failed asset load, unavailable WebGL or lost rendering context must show an actionable error and preserve exportable diagnostics where safe. Never show a fabricated completion percentage.

### FR-03 — Active robot selection

Show actual roster slots with name/role/team, a small robot thumbnail and a selected state. R1 is not synonymous with Blue or Team A. The baseline presets associate R1 with Red and R2 with Blue; always derive identity from data. Selection updates control ownership, telemetry, script/editor context and follow target atomically. Clear held manual input on a selection change. [S13](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r1.json) [S14](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/robots/preset-r2.json)

### FR-04 — Manual controls

Provide forward/back, turn left/right, stop-driving, and holonomic strafe controls where supported. Support keyboard and pointer holds. Pointer release, cancel, lost capture, window blur, hidden page, modal opening and control-source change must release manual input. A control click must never leak into arena orbit/measurement. Use one input arbiter; manual zero commands must not continuously overwrite autonomy commands.

### FR-05 — Manual throttle and precision

Default slider is 50%, range 0–100%, step 5%. Normal multiplier is 1; Precision multiplier is 0.25. Multiply normalized manual axes before command submission. This is **manual input scaling**, not playback speed, battery power or a mutation of robot performance limits. During replay, use recorded effective commands directly, without scaling again.

### FR-06 — Arena and camera tools

Central card hosts the existing live canvas. Add Top View / 3D segmented selection, Follow, Reset View, Measure and fullscreen affordances. Resize by actual container dimensions, including drawer/layout changes. Top view may clear follow as the existing camera does; entering follow uses 3D. Explicit setters/adapters should make UI state reflect actual camera state. [S08](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/sim/CameraRig.ts)

### FR-07 — Telemetry

Project read-only position X/Z in meters, yaw in degrees, planar speed in m/s, signed yaw rate in rad/s, gripper possession, robot status and a bounded speed history. Height Y may be an optional advanced row. Use actual core getters. Unknown/missing data displays an em dash and reason. A green dot means a documented local state, not network connectivity. No battery percentage without a real energy model.

### FR-08 — Session, match and provenance

Session Status shows Practice/Match/Replay, actual match phase, relevant simulation clock, active arena and provenance. Score/retries appear during matches and remain available at results. Read timer and score from MatchController; do not create a separate wall-clock scorekeeper. Present a visible provisional-field badge and explanation until source metadata justifies otherwise. [S10](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts) [S12](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/public/arenas/default.json#L1-L39)

### FR-09 — Quick actions

Launch actions: Reset selected robot, Grab/Release as supported, and Reset View. Reset selected robot is idle practice only, never a free match retry and never available during recording/playback. It affects only that slot and its held-object release, not the opponent or whole world. Lift Up and Lower Down are omitted. Labels describe possession rather than unsupported physical jaw-open state.

### FR-10 — Autonomy workspace

Autonomy card shows Detached, Starting, Running, Error or Stopped; details map to actual manager states. Load Script opens the editor/file flow, not immediate execution. Running code requires an explicit user action and a persistent trusted-code warning. Stop/Take Manual Control detaches the selected script, cancels undelivered commands from that source and submits neutral input through the approved domain boundary. Session and tick checks must survive the refactor. [S16](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/autonomy.ts)

### FR-11 — Record and export

Separate Practice recording from Match recording, with explicit session ownership. Explain that recording starts from a reset. Only the recording owner can Stop & Export. Export is a real JSON file generated from delivered commands; immediate zero-step stop has a documented no-file outcome. Retain the last valid recording on failure. Do not create video or cloud-storage affordances.

### FR-12 — Replay playback and verification

Show empty, loaded, incompatible, recording, playing, completed, stopped and failed states. Use Play from start and Stop, plus a **read-only progress indicator** in launch. Compatibility validation precedes any destructive match reset. Completed matches can enter compatible replay. Verification status distinguishes loaded/compatible from successfully completed verification. Preserve the verified final result even if operator cleanup subsequently neutralizes live actuators.

### FR-13 — Share and import

Copy Link is enabled only when a valid file exists and no recording/playback owns the timeline. Provide a selectable text fallback when clipboard access fails. Retain encoded/decompressed/file/validation limits. Loading a hash is parsing/import, not permission to execute scripts or automatically mutate an active session. Keep the existing replay URL format; navigation must not consume it.

### FR-14 — Builder

Restyle the existing JSON-first Builder as a light drawer/dialog or wide workspace. Preserve role and team validation, mass budget and non-destructive rejection. Support slot selection, Validate, Apply and explicit JSON import/export; forms that imply CAD materials, wheel internals or lift mechanics are not part of launch. Keep unsaved drafts separate from applied specs.

### FR-15 — Responsive layout

Desktop keeps the target hierarchy. Tablet may collapse the inspector to a drawer. Phone shows arena first with accessible Controls, Status and Replay sections. No horizontal page overflow at 360 CSS px. No control pad is hidden behind a fixed footer or virtual keyboard. Retain one renderer and one world across responsive changes.

### FR-16 — Accessibility and keyboard

Set a WCAG 2.2 AA implementation target for the interface; conformance requires review, not just a library scan. Use labeled controls, visible focus, text equivalents, sufficient contrast and no color-only state. Default Tab must navigate the document. Robot cycling becomes a documented command in an explicitly focused driving region; do not globally steal Tab. Dialogs restore focus and Escape does not start/reset a match. A readable scene summary complements the WebGL canvas. [S22](https://www.w3.org/TR/WCAG22/)

### FR-17 — Local preferences and tips

Gear opens local UI preferences: control scale, precision, help visibility, reduced visual motion, default camera preference and optional local display label. Persist only these bounded preferences under a versioned key. No account claims, cloud sync, cookies for tracking, stored scripts or replay payloads by default. Provide clear reset-preferences behavior and storage-denied fallback.

### FR-18 — Visual arena fidelity without rule changes

Improve frame, materials, lighting, labels and rendering presentation while retaining config geometry and colliders. Do not reproduce the picture's illustrative arena by changing simulation rules. New detailed robot/field art requires asset provenance and no collider changes disguised as visual polish.

### FR-19 — Lifecycle and source ownership

Boot, match, replay, overlays and per-slot command source are orthogonal state dimensions. A centralized capability function controls enabled state **and** handler admission. UI and legacy shell cannot both attach engine/input handlers. Modal closure releases only its own UI focus lock, not match/replay locks. Source/session changes cancel obsolete pending work without neutralizing unrelated robots.

### FR-20 — Errors and safe output

Render robot names, script logs, file names, replay metadata and error text as text. Keep validation bounded. Rejection preserves previous valid file, draft and match results. User-facing errors include a next action and never claim an unsupported operation succeeded.

## 5. Nonfunctional requirements

**NFR-01 Performance:** one renderer/render loop; telemetry text and sparkline at up to 10 Hz; instantaneous state transitions delivered promptly; bounded histories; no sustained memory growth after repeated panel cycles. Proposed frame-time budget is at most 15% p95 regression against the same baseline scene and machine, excluding explicitly approved visual upgrades.

**NFR-02 Determinism:** no physics, scoring, solver or replay-schema rewrite. Capture already scaled effective commands, preserve ticks, and run before/after fixtures on the same runtime/config/build identity. Where build IDs change, regenerate fixtures deliberately; do not disable compatibility checks.

**NFR-03 Safety/privacy:** trusted-script limitation stays visible; no fictional connected state, account or official-arena claim. New UI text cannot become dynamic HTML. Local preferences store no secrets or user code.

**NFR-04 Delivery:** feature-flagged migration, immutable evidence at release SHA, explicit rollback and deployment-base-path verification. Unit tests alone cannot close browser acceptance tasks.

## 6. Out of scope and later scope

No React/Next rewrite, backend, authentication, multiplayer, cloud replay library, video export, mechanical lift, weather or battery model, official 2027 field reconstruction, CAD editor, new competition rulebook, replay seeking or simulation-rate controls in launch. Deferred issues document prerequisites rather than displaying nonfunctional placeholders.

QuickJS/WASM isolation is an engineering/security project, not a styling requirement. A trusted-code technical preview can be evaluated separately from a product that accepts untrusted scripts; the dashboard launch makes no blanket public-beta security claim.

## 7. Main user journeys

**Practice:** boot → choose robot → inspect drive type → hold movement → release/stop → inspect telemetry → adjust throttle → practice grab/release.

**Configure:** idle → Builder → edit JSON → Validate → error remains non-destructive or Apply succeeds → selected robot updates → return to Practice.

**Autonomy:** Load Script → review trusted-code warning → Run selected slot → observe status → Stop or Take Manual Control → commands become neutral without restarting the world.

**Match:** idle → Start Match or Record Match → setup → countdown → playing → ended → inspect score/retries/log → compatible replay or export. Illegal transitions show reasons, not silent no-ops.

**Replay:** Record Practice → Stop & Export → import downloaded file → compatibility check → Play → verified completion → Copy Link → fresh-page import. A failed import or incompatible replay leaves existing results intact.

## 8. Definition of done

All RUI-001–038 acceptance criteria are evidenced or have an explicit maintainer-approved scope change. The visual target is approved at desktop and responsive sizes; keyboard/pointer input and real downloads work; existing regressions pass; no invented telemetry appears; source and asset provenance are documented; release evidence belongs to one exact SHA. See [Release Gates](RELEASE_GATES.md) and [Traceability](TRACEABILITY.md).
