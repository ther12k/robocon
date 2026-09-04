# Decisions, Risks and Open Questions

## Decisions already proposed by this pack

| ID | Decision | Reason |
|---|---|---|
| D01 | Retain TypeScript/Vite/Three.js/Rapier and DOM UI | Match existing architecture; avoid an unrelated framework migration |
| D02 | The light Practice screenshot is the visual source of truth | The user explicitly selected it over other mockups |
| D03 | Keep the same light language across other scenarios | Match/results are states of one product, not a second esports-style app |
| D04 | Keep real configured arena, visibly provisional | A generated picture is not rulebook or geometry evidence |
| D05 | Omit battery/weather/lift controls at launch | No verified backing model; no decorative false telemetry |
| D06 | Use read-only replay progress, no seeking at launch | Seeking requires separate deterministic transport work |
| D07 | Use actual role/team and X/Z coordinates | Avoid confusing selection color, robot role and team identity |
| D08 | Replace account appearance with local-session preferences | No authentication/backend expansion is required |
| D09 | Manual throttle affects effective commands only | It is not simulation time scaling or a config mutation |
| D10 | One engine and one renderer through all layouts | Preserve session/replay safety and avoid duplicate work |
| D11 | Default Tab navigates the document | Preserve keyboard accessibility; drive shortcuts are focus-scoped |
| D12 | Preserve existing replay schema and validation | Visual change is not permission to relax determinism checks |

These are implementation defaults. A maintainer may change them explicitly, with updated scope, tests and linked decision—not by silently adding placeholders.

## Risks and mitigation

| Risk | Consequence | Mitigation / owner issue |
|---|---|---|
| Public source has advanced beyond the planning SHA | Duplicate fixes or wrong integration points | RUI-001 re-baseline and revise evidence |
| Multiple UI mounts attach listeners/controllers | Double commands, leaks, timing changes | RUI-006/008/031 lifecycle ownership |
| Manual zero sampling fights autonomy | Robot appears broken or nondeterministic | RUI-011/013 source arbitration |
| Lost pointer/focus events | Continued unintended movement | RUI-011/013/029 cancellation and re-arm |
| Camera sizing uses the window instead of card | Distortion and bad measurement hits | RUI-007/015 container observation |
| Mockup field is copied into arena config | Invalid competition claims and changed replays | RUI-016/018 provenance and render-only scope |
| UI marks imported file as verified | False result confidence | RUI-023/024 distinct compatibility/completion states |
| Incompatible attempt resets finished match | Result/data loss | RUI-005/019/023 non-destructive admission |
| Build identity changes across UI commits | Old replay fixture incompatibility | RUI-002/034 deliberate fixture/build policy |
| Pretty buttons bypass domain guards | Illegal reset/spec change in match | RUI-005/014/026 handler-level enforcement |
| Tests call only probes | Actual controls/downloads remain broken | RUI-032 real-browser actions |
| New accessibility behavior breaks old shortcut assumptions | Keyboard regressions | RUI-006/011/030 documented migration |
| Too many UI updates/large logs | Frame-time regression or memory growth | RUI-004/017/031 sampling/bounds |
| Script trust warning disappears during restyling | Users assume arbitrary JS is safe | RUI-020/036/042 separate trust gate |

## Questions to resolve during baseline/design approval

1. Should the displayed product name become Robocon Arena Lab everywhere, or only in the redesigned shell? Default: update visible shell/title, retain package/replay identity.
2. Should the initial view be Top View as in the selected image, or preserve a saved local preference? Default: Top View for a new user, saved preference thereafter.
3. Should an unrecorded finished match clear a previous replay from the card? Default: retain the artifact but label it clearly as a previous recording.
4. Which mobile/browser devices will be claimed as supported? Default: make responsive behavior a target; claim only tested combinations.
5. How long should the legacy-shell rollback remain? Default: a maintainer-approved short stabilization window, removed by a separate cleanup.
6. Does exact reference fidelity outweigh every field mismatch? Default: visual hierarchy yes, false functionality no; unsupported items remain omitted.

## No silent expansion

Accounts, authentication, cloud storage, multiplayer, analysis dashboards, video export, richer robot CAD and official field reconstruction are outside launch. Do not add skeleton routes or disabled navigation for them solely because earlier generated mockups showed them.
