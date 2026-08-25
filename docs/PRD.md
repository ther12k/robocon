# PRD — ABU ROBOCON 2027 Simulation Arena (Three.js)

| | |
|---|---|
| **Product** | RoboconSim — Web-based 3D ROBOCON arena simulator with custom robot builder |
| **Version** | 0.2 (Draft — revised after R0 correctness gate) |
| **Date** | 2026-08-23 |
| **Status** | For review |
| **Source video** | https://www.youtube.com/watch?v=39ZyYn9D1C8 — *"ABU ROBOCON 2027 Theme & Rules /【Solo, Indonesia】"* (cvolab) |

> **Positioning (v0.2):** the current drive model is a velocity-level controller ("game-fidelity" strategy simulator), not a wheel/contact-based drivetrain model. It is suitable for strategy prototyping and operator training; it does **not** yet support engineering conclusions about torque, slip, or traction budgets. A drivetrain-fidelity mode is a separate workstream (see §14).

---

## 1. Background

- **ABU Robocon 2027** will be hosted by **Indonesia** (host broadcaster: **TVRI**), contest venue: **Edutorium KH Ahmad Dahlan, Universitas Muhammadiyah Surakarta (UMS), Solo, Central Java**, in **August 2027**. The host handover took place at ABU Robocon 2026 in Hong Kong on 23 Aug 2026.
- Indonesia last hosted in 2015. Indonesia's representative team is selected annually through **Kontes Robot Indonesia (KRI)** — the ABU division national champion.
- Every year the host defines a new theme, field layout, game objects, scoring, and robot regulations (e.g., 2026 "Kung Fu Quest": weapon assembly + scroll collection + Tic-Tac-Toe rack; 2 robots per team: R1 ≤ 1000×1000×1000 mm manual-or-auto, R2 ≤ 800×800×800 mm autonomous, combined weight ≤ 50 kg, 3-minute matches, ±5% field tolerance).
- Teams typically get **~10–12 months** between rule release and contest. Physical practice fields are expensive and access-limited. A **browser-based 3D simulator** lets teams prototype strategies, test autonomous logic, and train operators anywhere.

> **Note:** This PRD was authored without direct playback access to the linked video. All theme-specific game details are therefore modeled as **configurable data** (`arena.json`, `ruleset.json`) with placeholder defaults, and every value that must be verified against the official 2027 rulebook / the video is tagged **[VERIFY]**. When you watch the video or receive the official PDF, update those configs — no engine rewrites required.

## 2. Problem Statement

1. Indonesian universities preparing for KRI/ABU Robocon 2027 lack affordable, repeatable field practice time.
2. Autonomous robot code (path planning, object detection strategy) is usually tested late, on the physical robot.
3. No existing tool lets teams **build their own robot virtually** (chassis/drive/weapons/sensors), define custom behavior, and simulate it inside the exact 2027 arena with full rule enforcement.

## 3. Goals & Non-Goals

### Goals (v1)
- G1. Pixel-faithful (dimension-faithful) 3D reconstruction of the Robocon 2027 arena in Three.js, from a JSON arena definition.
- G2. Users can **create their own robot**: pick chassis type (differential / omni / mecanum), dimensions, mass, actuators, grippers/arms, and sensors — via UI editor **and/or** JSON spec.
- G3. Two control modes per robot: **Manual** (keyboard/gamepad operator station) and **Autonomous** (user-written JS behavior script running in-sim).
- G4. Full **match engine**: setup phase, countdown, 3-minute timer, retries, violations, scoring events, win detection, results screen — all driven by a configurable ruleset.
- G5. Deterministic physics at fixed 60 Hz step; replay system based on input logging.
- G6. Runs in modern desktop browsers at ≥ 60 FPS with 4 robots + all field props.

### Non-Goals (v1)
- Realistic photorealistic rendering (PBR-lite is enough).
- Native mobile support (tablet viewing OK, editing is desktop-only).
- Multiplayer over network (planned Phase 3, see §11).
- Hardware-in-the-loop / ROS bridge (Phase 3 candidate).
- AI opponents beyond simple scripted behaviors.

## 4. Target Users & Personas

| Persona | Need |
|---|---|
| **Student robotics team (primary)** | Recreate their planned R1/R2 designs; tune autonomous routines; practice operator driving. |
| **Team strategist/coder** | Scriptable API to run path-planning algorithms against the real field geometry. |
| **Coach/lecturer** | Review replays, compare strategies, use as teaching tool. |
| **Organizer/KRI committee (future)** | Visualize field before fabrication; broadcast overlay experiments. |

## 5. Confirmed Facts & Assumptions

### 5.1 Confirmed (from public sources)
- Host: Indonesia, TVRI; venue Edutorium UMS, Solo; contest ~August 2027.
- Format follows ABU Robocon tradition: **Red vs Blue**, symmetric field, simultaneous play, short timed match, win-condition first then score tiebreakers, retry mechanic, judges' discretion clauses.
- Reference constraints from recent years (good starting defaults until 2027 rulebook): R1 ≤ 1000×1000×1000 mm (extended ≤ 1800 L × 1300 H), R2 ≤ 800×800×800 mm (extended ≤ 1300 L × 1300 H), combined weight ≤ 50 kg, field tolerance ±5%.

### 5.2 To verify from the video / official rulebook — **[VERIFY] list**
- Theme name & story (likely revealed at the 2026 contest closing).
- Field overall dimensions and zone names/layout.
- Game objects: shapes, sizes, weights, materials, counts, initial placement.
- Task flow: assembly steps? transport? target structures? final objective?
- Scoring table & tiebreaker order.
- Robot count/type split (R1/R2 or other), autonomy rules, retry conditions, violation list.
- Any special surfaces: ramps, elevated poles, bridges, slippery/rough zones.

## 6. Functional Requirements

### 6.1 FR-1 Arena Renderer (Priority: P0)
- Load `arena.json` (schema §8.1) and build the scene: floor, zone decals, walls/borders, ramps/elevations, game objects, decorations.
- Units: meters; world origin at field center; +X right (Blue→Red axis), +Z toward Red side, +Y up.
- Field scale slider + top-view orthographic camera preset; free orbit camera (OrbitControls); follow-cam per robot.
- Color themes: official Red/Blue halves; night/day lighting toggle.
- Measure tool: click two points → distance readout (for verifying rulebook dims).
- Acceptance: loading the shipped default `arena.json` reproduces the [VERIFY] layout within ±5%; 60 FPS on integrated GPU laptop (2020+).

### 6.2 FR-2 Physics Engine (P0)
- Fixed-timestep rigid body simulation (recommended: **@dimforge/rapier3d-compat** WASM; fallback cannon-es).
- Configurable global gravity, friction/restitution per material pair (`materials.json`).
- Game-object states: idle/held/scored/out-of-play; held objects become kinematic children of the gripper; scored objects lock to targets.
- Collision events surfaced to the Referee Engine via event bus (with impulse magnitude).
- Determinism: same input log ⇒ identical outcome (seeded RNG, no wall-clock reads inside sim loop).

### 6.3 FR-3 Robot Builder (P0)
Two authoring paths producing the same `robot.json` (§8.2):
1. **Visual Editor:** add/arrange modules on a chassis grid — wheels, motor blocks, battery, controller, arm segments, gripper/ejector/lifter, sensors (line array, ultrasonic, IMU, wheel encoders, optional 2D lidar, RGB-D camera stub).
2. **JSON import/export:** shareable spec; validation with human-readable errors.

Constraints enforced live (from `ruleset.json`): footprint, height, extended envelope during actuation, weight budget; red/blue livery applied automatically.
- Drive models: differential, 4-wheel omni, mecanum (velocity-level model with slip approximation), optional simulated gimbal.
- Presets library: "Generic R1 (manual)", "Generic R2 (auto)", plus community presets.

### 6.4 FR-4 Robot Control (P0)
- **Manual:** keyboard (WASD + action keys), remappable; gamepad API support; per-team operator HUD (speed, battery estimate, sensor readings, held-object indicator).
- **Autonomous:** sandboxed script (JS module) receiving a documented API:
  - `robot.setVelocity(vx, vy, w)` / `robot.moveDistance()` / `robot.rotateTo()`
  - `sensors.line[]`, `sensors.imu`, `sensors.odometry`, `sensors.lidar.raycast(angleRange)`, `sensors.camera.getImageData()` (opt-in, low-res)
  - `world.getObject(id).pose`, `world.getTime()`
  - Lifecycle: `onInit(ctx)`, `onTick(ctx, dt)`; hard CPU budget per tick (e.g., 5 ms) with watchdog warning.
- Hot-reload of scripts without page reload.

### 6.5 FR-5 Match / Referee Engine (P0)
Driven by `ruleset.json` (§8.3):
- Phases: `SETUP (60 s)` → `COUNTDOWN` → `PLAY (configurable, default 180 s)` → `END`.
- Retry: per-team counter, respawn at Start Zone, objects reset policy configurable.
- Violations: zone intrusion, illegal contact, object mishandling, out-of-bounds — each mapped to penalty type from config.
- Scoring: rule plugins subscribe to physics/referee events (e.g., `objectPlaced(targetId)`, `objectAssembled(a,b)`, `lineCrossed(zoneA,zoneB)`) and award points per the scoring table.
- Win detection: absolute-win patterns checked every tick (pattern matcher, e.g., N-in-a-row, occupancy sets).
- End screen: per-task breakdown, timeline of scoring events, winner resolution following configured tiebreaker chain.
- Human referee overrides panel (add/remove points, force retry, end match early).

### 6.6 FR-6 Telemetry, Replay & Analysis (P1)
- Live HUD: scoreboard, timers, mini-map with robot poses, selected-robot telemetry graphs (velocities, currents estimate).
- Recording: input-log based replay files (small, deterministic); scrubber UI; frame-step; export pose CSV.
- Heatmap generator: robot position density over match (strategy insight).

### 6.7 FR-7 Sharing & Persistence (P1)
- Save/load workspaces (arena variant + robots + scripts) to local storage and file export/import.
- One-click share link encoding compact workspace (URL-safe compressed JSON) for small setups.

### 6.8 FR-8 Practice Sandbox Mode (P1)
- Free-roam mode without match rules: spawn/despawn objects, teleport robots, slow-mo (0.25×/0.5×), pause-and-drag debugging.

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | ≥ 60 FPS with 4 robots, ~40 dynamic objects, shadows on; physics step ≤ 4 ms/frame budget. |
| Compatibility | Chrome/Edge/Firefox latest-2; WebGL2; WASM enabled. |
| Determinism | Same inputs + seed ⇒ bit-identical trajectories across runs (enables fair replays/tests). |
| Extensibility | New year's rules = new `arena.json` + `ruleset.json` + optional plugin module; zero core edits. |
| Accessibility | Remappable keys, color-blind-safe team colors option. |
| i18n | EN + ID strings from day one. |
| Testing | Unit tests for referee plugins & drive models; golden-file replay regression tests. |

## 8. Data Schemas (source of truth)

### 8.1 `arena.json`
```jsonc
{
  "meta": {
    "name": "ROBOCON 2027 — [THEME NAME]", "schemaVersion": 1,
    "source": {
      "authority": "ABU | TVRI | UMS | provisional",
      "documentTitle": "...", "documentVersion": "...", 
      "sha256": "...", "verifiedAt": "...",
      "status": "official | draft | inferred"
    }
  },
  "dimensions": { "width": 16.0, "length": 16.0, "wallHeight": 0.15 },   // VERIFY
  "zones": [ /* ... as before ... */ ],
  "staticProps": [ /* box/ramp; full rotX/rotY/rotZ via canonical pose layer */ ],
  "objectSpawns": [ { "objectId": "...", "typeId": "...", "pose": {...}, "massKg": 0.8, "render": {...} } ],
  "targets": [ /* pose.y is respected by renderer and physics */ ],
  "surfaces": { "defaultFriction": 0.7 }
}
```
Provenance (`meta.source`) is mandatory before any config may be labeled official. A Scribd or user-uploaded rulebook copy is **not** an acceptable source of truth without version + checksum verification.

### 8.2 `robot.json`
```jsonc
{
  "schemaVersion": 1,
  "name": "MyR2", "role": "R2", "team": "red",
  "chassis": { "drive": "mecanum", "footprint": { "w": 0.6, "l": 0.6 }, "massKg": 18,
               "maxSpeedMps": 1.5, "maxAccelMps2": 2.0 },
  "modules": [
    { "type": "gripper", "mount": { "x": 0, "y": 0.15, "z": 0.35 }, "gripRangeM": 0.08 }
  ]
}
```
Notes (v0.2):
- `constraintsCheck` was removed — validation results are **derived state** computed from spec + ruleset at load time; storing them invites staleness and tampering.
- All numeric fields must be positive; validator rejects negatives/zeros with errors, clamps sim caps with warnings, and uses own-property lookups (no prototype-chain roles).

### 8.3a `competition-ruleset.json` (competition legality & scoring only)
```jsonc
{
  "match": { "setupSec": 60, "playSec": 180, "retriesPerTeam": 3 },
  "robots": { "R1": { "autoAllowed": true, "maxFootprintMm": [1000,1000,1000] },
              "R2": { "autoRequired": true, "maxFootprintMm": [800,800,800] } },
  "teamWeightBudgetKg": 50,
  "scoring": [ /* [VERIFY] */ ],
  "absoluteWin": { "type": "patternOccupancy" },
  "tiebreakers": [ /* [VERIFY] */ ],
  "violations": [ /* ... */ ]
}
```

### 8.3b `simulation-profile.json` (simulator tuning, never competition rules)
```jsonc
{
  "maxSpeedMps": 3, "maxAccelMps2": 8, "maxTurnRps": 2,
  "solver": { "fixedDtHz": 60, "maxSubSteps": 4 },
  "frictionModel": "velocity-servo + multiply-combine"
}
```
Competition constraints and simulator tuning are deliberately separate files so that tuning the sim never mutates rule semantics.

## 8.4 Determinism contract (scoped)
Replays are deterministic **for identical**: engine version, Rapier/WASM build hash, config hashes (arena/ruleset/profile/robot specs), seed, fixed timestep, and initial-state hash. Replay files store: `schemaVersion`, engine + wasm hashes, config hashes, `seed`, `fixedDt`, `initialStateHash`, and a tick-indexed command log (`{tick, robotId, action, payload}`), plus periodic quantized state hashes to localize desync. Cross-browser / cross-version determinism is explicitly **not** claimed.

User actions (grab/release) are queued and consumed inside fixed-step callbacks, never applied at render rate.

## 9. System Architecture

```
Browser (Vite + TypeScript)
├── Renderer        three.js scene graph, materials, cameras, minimap
├── SimCore (Worker)
│   ├── Physics     rapier3d-compat, fixed 60 Hz, seeded RNG
│   ├── RobotModel  drive kinematics, actuator/sensor simulation
│   ├── Referee     phase machine, rule plugins, event bus
│   └── EventBus    collision / zone / hold / score messages → main thread
├── ControlLayer    keyboard/gamepad mapper · user script VM (sandboxed iframe/worker)
├── StateStore      zustand: entities, match state, settings
└── UI              React: builder, operator HUD, referee panel, replay viewer
Persistence: localStorage + File System Access API; replay = compressed input log
```

Key decisions:
- **Physics in a Web Worker** keeps rendering smooth; state snapshots synced at render rate, interpolated.
- **Rule plugins** implement `RefereePlugin { id, onEvent(e, api) }`; shipped plugins cover the 2027 tasks; users can add practice variants.
- **Script sandbox**: user autonomy code runs in a **dedicated, terminable worker** with no DOM/net access and only the injected API. Watchdogs that merely time a callback in the same worker cannot stop an infinite loop — termination must be `worker.terminate()`.
- **Entity registry**: every simulated body is registered (`registerEntity(id, body, mesh)` / `unregisterEntity`), with disposal; renderer, follow-cam, HUD, and referee all read from physics-body transforms via stable entity IDs — never from detached meshes.
- **Canonical transform & geometry layer**: one pose→quaternion helper and one shape→(geometry | collider-desc) mapping shared by renderer and physics; visual/collider divergence is structurally impossible (regression-tested).
- **Input contexts**: `simulation | ui`; editor focus never drives robots; key state clears on context switch.

### 9.1 Autonomous robot API split
- **Competition API** (what scripts see): only sensor-derived data — odometry, IMU, line array, lidar raycasts, low-res camera stubs. Perfect world state is *not* exposed.
- **Debug API** (tooling/tests): full world snapshots; unavailable to competition scripts.
- **Referee API**: authoritative match state; internal to the engine.

## 10. Milestones

Release gates precede feature milestones: correctness of the foundation outranks new features.

| Gate / Phase | Deliverable | Exit Criteria |
|---|---|---|
| **R0 Correctness gate** ✅ (done 2026-08) | Entity registry + sync, gripper ownership, canonical geometry layer, input context isolation, validator hardening, boot/disposal lifecycle, browser smoke suite (5 E2E in headless Chrome incl. mesh-sync & editor-isolation assertions) | All unit tests + browser smoke green; visual = collider parity |
| **R1 SimCore separation** ✅ (done 2026-08) | DOM-free SimulationCore (+ purity test); tick-based CommandBus with dedupe, gate verdicts, and recording; stable entity IDs + versioned snapshots & state hashes; versioned schemas for arena/ruleset/profile/replay with a load-time compatibility gate (engine/Rapier/config/initial-state); competition-ruleset vs simulation-profile split; replay files with periodic quantized checkpoints, desync localization, and match-session support; seeded determinism fuzz suite (multi-robot, random grabs, jittery pacing, dirty-core playback) | Bit-exact replay round-trips across seeds/pacing/dirty cores in the unit suite; schema negotiation tested |
| **M3 Rules & Match Flow** ✅ (done 2026-08) | `MatchController`: setup→countdown→playing→ended phase machine, tick-driven timers, input gating outside play, objectInTrigger scoring with dedupe, out-of-bounds violation → retry/exhaustion loss, absolute-win threshold, scoreboard UI + end banner, event log | Full match playable via Start button / Enter; 10 dedicated tests incl. gate & dedupe interaction |
| **M4 Autonomy SDK** ✅ (done 2026-08) | `AutonomyManager` + per-script terminable Web Worker (blob wrapper), watchdog (750 ms stall → `terminate()`), command-spam guard, Competition API sensors only (odometry/IMU/lidar raycasts/object scan — no world truth), hot-reload via Run, Autonomy panel UI; sample bot scores unaided in ~4.7 s sim | Sample bot wins match unaided; infinite-loop script killed cleanly and robot remains controllable; gate respected during setup |
| **M5 Polish & Beta** | Replay record/playback panel ✅ + share links ✅ (done 2026-08: deterministic replays with checkpoint verification, match-session support, URL-hash sharing); speed telemetry sparkline ✅ (done 2026-08); remaining: minimap, i18n | Beta to pilot teams (3–5 universities); feedback round |

The **arena capability model** (elevation, compound colliders, mechanisms, plugin extension) is intentionally deferred past R1: it requires the official 2027 rulebook provenance before schema evolution begins ([VERIFY] policy, §12).

Earlier M0–M2 (foundation, physics/driving, builder v1) shipped pre-R0 and were subsequently hardened by the R0 gate above.

Post-v1 candidates: networked 2v2 matches, ROS2 bridge, tournament bracket runner, broadcast-style camera director, wheel/contact-based drivetrain fidelity mode.

## 11. Success Metrics

- Pilot: ≥ 5 university teams onboarded within 1 month of beta; ≥ 20 saved workspaces shared.
- Reliability: < 1 crash / 100 matches; replay desync rate 0% (within the §8.4 determinism contract).
- Engagement: median session ≥ 30 min (practice loops).

### 11.1 Accuracy — three distinct layers (do not conflate)
| Layer | Meaning | Target |
|---|---|---|
| **A. Rulebook tolerance** | Official manufacturing tolerance of the physical field (±5% is the *rulebook's* allowance) | Reported per config, from `meta.source` |
| **B. Data-entry accuracy** | How faithfully `arena.json` transcribes the rulebook | Every dimension traceable to a rulebook page/figure; [VERIFY] cleared |
| **C. Simulator transform error** | Renderer vs collider vs telemetry divergence inside the sim | ≤ ±1 cm, regression-tested via canonical geometry layer |

"Measured field/object error ≤ ±2 cm vs rulebook" refers to **layer B** only and must never be presented as overall simulator accuracy.

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 2027 rulebook details unknown/in flux | Wrong arena | Config-driven + provenance metadata; capability-bounded re-skin ("new year = JSON only" holds only *within* the arena capability model; new mechanics need schema evolution/plugins) |
| Physics realism vs performance (stacking, gripping) | Jittery objects | Velocity-level drives, sleep states, tuned solver iterations; fallback kinematic grip |
| Velocity-controller mistaken for drivetrain truth | Wrong engineering conclusions | Explicit positioning (§ header); fidelity mode deferred to post-v1 |
| User scripts abuse (infinite loops) | Frozen tab | Dedicated terminable workers (`worker.terminate()`), no shared-thread watchdogs |
| Scope creep (photorealism / premature features) | Delay | Explicit non-goals; gates before features |

## 13. Open Questions

1. Exact 2027 theme name, field drawing (top view + sections), and object specs from the video/rulebook — **owner: you**, feed into `arena.json`/`competition-ruleset.json` with provenance.
2. Will KRI domestic rounds need variant rules support in-app?
3. Preferred deployment: static GitHub Pages vs internal server? (Vite `base` is already handled via relative asset URLs.)
4. License choice (MIT?) given potential inter-university sharing.

## 14. Deferred Workstreams (post-v1)
- **Drivetrain fidelity mode**: wheel/contact-based traction, motor torque curves, slip — for engineering-performance conclusions; kept out of the strategy simulator to avoid "realistic-looking but wrong" results.
- Networked multiplayer, ROS2 bridge, tournament runner, broadcast camera director.
