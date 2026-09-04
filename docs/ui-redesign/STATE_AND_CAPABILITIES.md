# State, Capabilities and Input Ownership

## Existing sources of truth

Match state is owned by MatchController. Replay orchestration currently lives in `src/main.ts`, while capture/playback and verification live in SimulationCore. Autonomy owns Worker state. Preserve those domains when extracting the UI. [S05](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/main.ts) [S09](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/SimulationCore.ts) [S10](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/match.ts) [S16](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/src/core/autonomy.ts)

The following is a proposed presentation contract. Do not replace the existing domain state machine with decorative UI booleans.

## Orthogonal dimensions

| Dimension | Values |
|---|---|
| Boot | loading, ready, failed |
| Match | idle, setup, countdown, playing, ended |
| Replay transport | idle, recording-practice, recording-match, playing |
| Replay artifact | none, valid-loaded, incompatible, invalid, completed-verified, completed-failed |
| Active panel | none, builder, script, replay-detail, preferences, inspector |
| Per-slot command source | manual, autonomy, replay, locked |
| Manual focus | outside controls, driving region, form/dialog |

Derived state is immutable and tagged with the current session generation. A delayed render update from an old generation is discarded. A panel being visible never implies that a match or replay has stopped.

## Capability precedence

Compute permissions in this order: boot readiness → replay ownership → match phase → active slot/module capability → source ownership → panel/focus → pending operation. Return a Boolean **and a reason code**. Use the same predicate in both UI and domain-facing handler.

Suggested result type:

```ts
type Admission = { allowed: true } | { allowed: false; reason: string };
```

No action handler reads button `.disabled` as its authority. No component removes another subsystem's input lock.

## Default action matrix

`Allow` is still subject to boot ready, valid active slot and no conflicting dialog/pending operation. `Owner` means only the recording owner may stop. `Validate` means non-destructive compatibility check precedes reset.

| Action | Idle practice | Setup/countdown | Live match | Ended match | Recording | Playback |
|---|---|---|---|---|---|---|
| View/select robot | Allow | Allow | Allow | Allow | Allow | Allow for inspection only |
| Manual move/grab | Allow when manual owner | No | Allow when manual owner | No | Practice/live-match phase only | No |
| Start Match | Allow | No | No | Confirm new match | No | No |
| Record Practice | Allow, reset disclosed | No | No | Return to Practice first | No | No |
| Record Match | Allow, atomic start/capture | No | No | Confirm/reset first | No | No |
| Stop & Export | No | Owner only if recording | Owner only if recording | Owner if still recording | Owner | No |
| Apply robot spec | Allow | No | No | Return to Practice first | No | No |
| Reset selected robot | Allow, script stopped | No | No | Return to Practice first | No | No |
| Load replay file | Allow | No | No | Allow non-destructively | No | No |
| Play loaded replay | Validate | No | No | Validate then prepare | No | No |
| Copy/export loaded file | Allow if file exists | Read-only artifact only | Read-only artifact only | Allow | No | No |
| Run/edit script | Allow on stopped slot | No | Stop remains available; starting new script disallowed | Return to Practice first | Starting/editing disallowed | No |
| Stop script | Allow if active | Allow | Allow | Allow | Allow, neutral command recorded | No active live source |
| Camera/measure | Allow | Allow | Allow | Allow | Allow | Allow |
| UI preferences/help | Allow | Allow | Allow | Allow | Allow; throttle/source mutations locked | Allow; replay unaffected |

A recording is an overlay on a match phase, so both permissions apply. Example: recording-match during setup does not permit movement. During capture, throttle is allowed only when manual control is allowed; changing source/editor settings is not. Read-only preferences may always open.

## Command path

```text
keyboard / pointer state
  -> focused manual source
  -> drive-type normalization
  -> throttle and precision scaling
  -> control ownership + capability admission
  -> existing command bus
  -> accepted fixed-step delivery
  -> physics + recording
```

One authoritative source submits movement for a slot. A manual zero sample must not fight a running Worker. On Take Manual Control: detach the selected Worker, invalidate pending messages from its generation, cancel its undelivered commands, clear held keys/pointers, and enqueue neutral manual axes at a documented fixed-step boundary. Re-arm only after a fresh user press.

UI components never call `setTranslation`, `setLinvel`, `world.step` or body disposal. Those operations belong inside existing or narrowly extended core operations. A safe selected-slot reset must not reuse a whole-world reset.

## Stop behavior

**Release key/pointer / Stop driving:** clear manual held inputs and enqueue zero axes for that slot. Robot deceleration remains governed by physics. Preserve other slots and captured commands. This is not a hardware emergency-stop guarantee.

**Stop script / protocol failure:** terminate the selected source and clear its pending work. Apply the agreed neutral-command policy; don't silently clear all robots or rewrite recording history. A killed script cannot resurrect itself through late UI updates.

**Operator stop replay:** stop replay injection, preserve verification/abort reason, then apply explicit neutralization policy. It must not clear match lock ownership accidentally. Natural playback completion must first save the verification result and expected final hash; cleanup changes are not retroactive replay divergence.

**End match:** retain the existing neutralization/lifecycle semantics and verify they survive the extraction. A cosmetic status update is not a substitute for domain braking.

## Panel focus ownership

Use a single PanelManager or a stack with unique owner tokens. Opening a dialog cancels held manual input and suspends drive shortcuts. Closing restores focus to its invoker and removes only its UI focus token. Opening Preferences from a script panel must not re-enable driving when Preferences closes and the script panel remains open.

Tab navigates controls normally. A driving-region hint can expose an explicit robot-cycle shortcut, but never trap the whole document. Enter/Space activates the focused UI control; Start Match is not bound globally over buttons/forms. Native slider arrows change the slider, not robot orientation.

## Invalid transitions and atomicity

Before destructive work, validate data and admission. Use a pending token for asynchronous file reads, parsing and clipboard operations. An old request completing after a newer request cannot overwrite the new selected file or error message.

Record Match must either establish a matching initial world and capture together, or leave the old state unchanged with an error. Apply Builder validates a complete draft and proposed team mass before touching live robots. Playback validates the parsed file and compatibility before resetting an ended match.

## Required test invariant

For every rejected mutation, compare before/after applied spec, core tick at an equivalent controlled boundary, score, winner, ownership, capture owner and loaded artifact. Cosmetic view changes may change camera/UI preferences only. See SC-04, SC-07, SC-08, SC-12, SC-17 and RUI-034.
