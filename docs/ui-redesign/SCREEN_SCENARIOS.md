# Screen Scenarios and Interaction Acceptance

These are proposed screens/states, not claims that the reference renders from the repository today. All use the same light design system. Test identifiers `SC-*` are stable acceptance IDs.

| ID | Scenario | Required presentation | Primary interaction | Exit/evidence |
|---|---|---|---|---|
| SC-01 | Cold boot | Light shell skeleton; arena loading; controls unavailable | Wait or inspect startup failure | Ready transition without double canvas |
| SC-02 | Practice idle | Left robot cards/pad, live arena, right status/telemetry/replay empty | Select R1 or R2 | All slot-bound views change together |
| SC-03 | Manual movement | Direction pressed state, live speed/pose, throttle | Hold forward, turn, release; Precision | Recorded effective command matches actual movement |
| SC-04 | Input interruption | No stuck pressed state | Release outside pad, cancel pointer, blur, open drawer | Neutral input by next accepted fixed-step boundary |
| SC-05 | Camera/measurement | Top/3D selection and tool status | Toggle camera, follow, measure two points, resize/fullscreen | Field not stretched; physics state untouched |
| SC-06 | Autonomy editor | Light editor, selected slot, trust warning, Run | Load local script without executing; Run explicitly | State Starting → Running or explained Error |
| SC-07 | Autonomy failure | Status explains watchdog/protocol/sync error | Stop, revise, Run; Take Manual Control | No stale command from old source/session |
| SC-08 | Builder invalid | JSON editor, validation issues, disabled Apply | Enter invalid/overweight spec; Validate | No world or applied-spec mutation |
| SC-09 | Builder valid | Valid state and apply summary | Apply once, return to Practice | Only selected robot changes; controls rebound safely |
| SC-10 | Match setup/countdown | Score strip and phase timer; locked control reasons | Observe phase transitions | Start cannot double-run; timer uses match state |
| SC-11 | Match playing | Score, dynamic retries, arena, event entries | Manual or permitted autonomy control | UI cannot trigger free reset or spec mutation |
| SC-12 | Match ended | Final score/winner, neutral state, result actions | Export if recorded; Play compatible replay | Results survive incompatible attempt |
| SC-13 | Practice recording | REC with owner, elapsed simulation time | Stop & Export via visible button | Actual downloaded JSON parses; non-owner disabled |
| SC-14 | Match recording | Record Match owns timeline throughout match phases | Stop & Export once recording is meaningful | Export has match context; no wrong-owner stop |
| SC-15 | Loaded replay | File details, compatibility status, enabled Play/Copy | Play from beginning | Input gated and progress read-only |
| SC-16 | Replay completed/stopped | Verified/stopped/desync are distinct states | Operator Stop or natural completion | Core verification result retained before cleanup |
| SC-17 | Invalid/incompatible replay | Bounded readable errors and recovery action | Load malformed/oversized/wrong-build file | Existing valid file/results unchanged |
| SC-18 | Share/fresh page | Copy success or selectable fallback | Click Copy; open returned hash in fresh page | Parse/load without script execution or auto match start |
| SC-19 | Tablet/phone driving | Arena-first compact layout and reachable controls | Touch hold, change orientation, open inspector | No hidden controls, double input or reset |
| SC-20 | Keyboard/accessibility | Visible focus and semantic controls | Tab through page, activate button, open/close dialog | No global Tab hijack; no Enter-triggered match accident |
| SC-21 | Renderer/startup failure | Persistent readable failure card | Retry/reload as appropriate | No fake Ready status; input remains safe |
| SC-22 | Local preferences | Gear panel labeled local-only | Change scale/help preference; reload; clear storage | Preference restored; scripts/replays not stored |

## Walkthrough: selected-reference Practice screen

Start at SC-02 with Top View enabled, no script and no replay. Default manual throttle is 50%, Normal mode. The active slot gets a blue selection card; its team badge remains actual Red/Blue. The stage fills the center card and the inspector shows live values, even at rest. The provisional-arena label is visible. Battery and lift fields are absent, not decorative zeros.

Move to SC-03 without opening a modal: hold Up, observe planar speed rise, release and observe deceleration. A/D strafe is available only on the appropriate drive type. Pressing a direction on the pad must not orbit the camera.

Opening Builder/Load Script in SC-06/08 releases held manual input and changes focus owner. Closing the panel restores focus to the invoking button but does not resume a previously held key. No change to replay URL hash occurs.

## Match and replay transition details

Start Match and Record Match are separate intents. Record Match performs match start and capture setup as one operation. Never implement two independent handlers that both reset the world. Match setup and countdown cannot be skipped by navigation or reload of a panel.

SC-12 without a recording must not show active Export/Replay actions for a nonexistent file. Say “This match was not recorded.” A prior unrelated replay may remain available in the Replay library state, but must be labeled as a previous file rather than attributed to the completed match.

For a compatible replay at SC-12, validate first; only then prepare the ended match for playback. For an incompatible file, final score, winner, log and world remain unchanged. A replay that imports successfully is “Loaded”, not “Verified”; verified means the relevant playback checks completed successfully.

## Error copy examples (proposed)

- “Cannot reset a robot during recording. Stop & Export first.”
- “This robot uses differential drive; sideways movement is unavailable.”
- “Replay does not match the current build or configuration. Your match result was kept.”
- “Clipboard access was unavailable. Select and copy the link below.”
- “No battery model is installed.” Only needed in a future capability inspector; omit the battery row in launch.
- “Trusted code only. Scripts run on your device; a Worker is not a security sandbox.”
- “The arena layout is provisional and has not been verified against an official rulebook.”

## Evidence conventions

A scenario is closed only by a link to a test/report at the implementation SHA or a signed manual-review entry. Source review, a mocked callback, or counting test cases does not prove a real browser interaction. See TEST_PLAN for fixture and evidence requirements.
