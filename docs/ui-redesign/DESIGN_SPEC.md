# Visual and Interaction Specification

**Authority:** the supplied light Practice dashboard, interpreted together with [PRD](PRD.md). All numeric tokens below are proposed implementation values, not pixel measurements from a design-source file.

![Reference](assets/reference-dashboard.png)

## Reference identity

Original image: 1672 × 941 pixels. SHA-256: `18d8680065e691bd9ccb1ff7839221c21ff7356cd0f2f1d2c05b8875adc0469e`. Preserve this asset unchanged. The detailed field and robot artwork in it is conceptual; the application continues to render its configured arena.

## 1. Composition

At the reference size, a 72 px header sits above three columns with roughly equal sidebars and a center approximately twice as wide. Use 16 px outer padding and gutters. Proposed grid:

```css
.workspace {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(560px, 2.1fr) minmax(280px, 1fr);
  gap: 16px;
  align-items: start;
}
```

The left stack contains Robot Control, Autonomy, Quick Actions. The center contains the Arena Simulation card, toolbar, canvas and legend. The right stack contains Session Status, Telemetry, Replay, Tips. A match score strip appears between header and workspace during active/completed matches without swapping to the unrelated dark mockups.

The arena is the visual focal point. Sidebars should not cover it on wide screens. Prefer one document scroll on shorter windows rather than multiple nested scrolling cards. Editor bodies and bounded logs may have their own scroll. The CSS must allow `min-width: 0` and avoid intrinsic canvas dimensions expanding the grid.

## 2. Tokens

| Token | Proposed value | Use |
|---|---|---|
| `--ui-bg` | `#F2F7FC` | Application background |
| `--ui-surface` | `#FFFFFF` | Cards and dialogs |
| `--ui-surface-soft` | `#F5F8FC` | Grouped rows, inactive controls |
| `--ui-text` | `#12234B` | Primary navy text |
| `--ui-muted` | `#516481` | Secondary text; verify actual contrast |
| `--ui-border` | `#D8E3EF` | Card/control borders |
| `--ui-accent` | `#246BFD` | Selection, links, primary actions |
| `--ui-accent-soft` | `#E8F1FF` | Active navigation background |
| `--ui-success` | `#087F5B` | Text/icon success |
| `--ui-success-soft` | `#DDF7EC` | Positive status pill |
| `--ui-warning` | `#8A5800` | Warning text on light surface |
| `--ui-warning-soft` | `#FFF3CD` | Provisional/error guidance |
| `--ui-danger` | `#BC2539` | Error text and destructive action |
| `--ui-team-red` / `--ui-team-blue` | `#C93645` / `#246BFD` | Team indicators with labels |
| `--ui-radius-card` | `16px` | Main cards |
| `--ui-radius-control` | `10px` | Buttons, inputs, segmented controls |
| `--ui-shadow-card` | `0 6px 24px rgba(32,65,110,.06)` | Low-elevation separation |

Spacing scale: 4, 8, 12, 16, 20, 24, 32 px. System sans-serif stack by default; no external font download required. Brand 22/28 semibold; card title 18/24 semibold; body 14/20; metadata 12/18. Use tabular numerals for clocks and telemetry. Do not copy the picture's tiny low-contrast labels where they conflict with accessibility.

Every palette use must pass actual contrast checks. Target body text contrast ≥4.5:1 and control boundaries/focus cues ≥3:1 where applicable. Set a 44×44 CSS px product minimum for pointer controls; this is a project target, not a claim that every WCAG AA target must be 44 px. [S22](https://www.w3.org/TR/WCAG22/)

## 3. Header and navigation

Brand mark should be a simple locally authored robot outline with text Robocon Arena Lab. Preserve brand consistently across all screens. Navigation is Practice, Robot Builder, Load Script, Replay. Practice is blue on a pale-blue pill when active. Start Match is an explicit primary action separate from navigation. Gear opens UI Preferences. Replace the apparent account menu with a local-session label/menu; do not imply sign-in.

On tablet, abbreviate secondary labels only when accessible names remain complete. On phone, preserve brand, active view and overflow menu; never squeeze eight toolbar buttons into one clipped row.

## 4. Left controls

**Robot cards:** actual name/role/team with small robot silhouette. Selected card has blue treatment and `aria-pressed=true`; team uses a labeled badge independent of selection color. A status dot is always accompanied by a word. No made-up online indicator.

**Direction pad:** up/down are forward/back. Left/right are turn left/right on all drive types, matching arrow-key rotation. Add separately labeled Strafe left/right controls for holonomic drives; disable/omit them for differential drive. W/S move, Q/E rotate, A/D strafe when supported. A central Stop driving button clears manual movement and allows physical deceleration; do not call it a safety-certified emergency stop.

**Throttle:** range 0–100%, default 50%, step 5%. Normal and Precision are mutually exclusive. Display effective multiplier when Precision is active. The pointer and keyboard follow the same scaling pipeline.

**Autonomy:** state pill, brief status, selected script name where available, primary Run or Stop. Expanded editor is a real dialog/workspace. Warning remains accessible without scrolling: trusted scripts only; Worker isolation is not a security sandbox.

**Quick actions:** Reset selected robot, Grab/Release, Reset View. Omit lift controls. Tooltips explain recording/match locks. Reset selected robot asks confirmation when it will release a held object; never reset the opponent.

## 5. Central arena

Card title Arena Simulation. Subtitle uses actual arena name and a provisional badge if required. Show a fixed-height toolbar, then a flexing canvas container with a stable preferred ratio; letterbox when needed instead of distorting the field. Maintain equal world scale in both planar axes.

Top View/3D is a segmented control reflecting actual camera state. Follow, Measure and Reset View can be secondary buttons. Fullscreen maximizes the arena card, not a second renderer. Exiting fullscreen preserves active slot and match state. Unsupported/denied fullscreen shows a non-blocking message.

Legend is generated from real slot teams, zones and objects, not invented field features. Render-side light background/material polish must leave colliders and config hashes unchanged. No new official logos or claims are required.

## 6. Right inspector

**Session Status:** mode, phase, match clock or practice elapsed simulation time, fixed-step display if useful, arena name/provenance. A label such as Requested simulation rate 1× is allowed only if it describes actual fixed configuration; it is not an adjustable speed control. Omit Weather.

**Telemetry:** Position (X, Z), Orientation, Linear speed, Yaw rate, Gripper, Control source. Optional speed sparkline with text equivalent. Battery is omitted. Gripper shows Holding `<id>`, Empty or Not installed, not Closed/Open without evidence.

**Replay:** no file → empty explanatory state with Load replay and Record actions. Loaded → metadata, Play, Export and Copy Link. Recording → owner-specific Stop & Export. Playback → read-only progress and Stop, with other mutations disabled. Results → compatibility and verification clearly separated.

**Tips:** concise help based on current mode; dismissible and restorable. During setup/recording, replace generic tips with the reason an action is locked.

## 7. Responsive rules

| Width | Arrangement | Required behavior |
|---|---|---|
| ≥1280 px | Three columns | Reference hierarchy; full label set, no overlays obscuring canvas |
| 1024–1279 px | Control column + arena; inspector drawer | Drawer has one active focus owner; closing does not restart simulation |
| 768–1023 px | Arena above lower control/status grid | Navigation compacts; quick actions remain reachable |
| 360–767 px | Single column; arena first; Controls/Status/Replay sections | 44 px controls; page scroll; compact header; no horizontal overflow |

Canonical snapshots: 1672×941, 1440×900, 1024×768, 768×1024, 390×844, 360×800. Test short desktop height as well as width. Touch driving and page scrolling need separate hit regions; use `touch-action` only where interaction requires it. [S23](https://www.w3.org/TR/pointerevents3/)

## 8. State styling

Every control has default, hover, focus-visible, pressed, disabled and pending styles. Do not infer command success merely from pressed styling. Disabled action reasons appear in adjacent text or an accessible explanation. Pending parser/clipboard operations cannot launch duplicate requests.

Information, warning and error states use icon + heading + text. `aria-live=polite` announces transitions, not every telemetry frame. Destructive confirmation uses cancel as initial focus where appropriate.

## 9. Deliberate differences from the reference

Position uses X/Z, not X/Y, because this repository's ground plane is X/Z. The arena remains configured placeholder geometry. R1/R2 carry data-derived Red/Blue badges. No battery, weather, lift or account fiction. Replay progress is not draggable until seeking has its own implementation. These are approved planning deviations needed for truthfulness, not unfinished CSS.

## 10. Visual review method

Approve the shell against the supplied image, then approve application screenshots as baselines. Do not pixel-diff the live app directly against the generated picture: geometry, copy and anti-aliasing differ deliberately. Use deterministic scene fixtures, fixed viewport/DPR and captured DOM after fonts and layout settle. Maintain both a canvas-masked UI snapshot and a small unmasked scene check. Manual review records any intentional deviations.
