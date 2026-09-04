# Test and Evidence Plan

**Status:** proposed tests and release criteria. This package does not claim that the application or new tests were executed locally. First establish actual baseline results under RUI-001.

## 1. Keep the existing pipeline

The baseline exposes `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`. CI uses a Node 22 environment and headless Chrome/SwiftShader for browser smoke. Retain these gates and the lockfile. Adding browser test files requires updating discovery/exclusions so they do not silently run in the wrong environment or get skipped. [S04](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/package.json) [S18](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/tests/smoke.browser.test.ts) [S19](https://github.com/ther12k/robocon/blob/f5092ffa5aa8eeb9aaab016dfa4b8a303c14c12a/.github/workflows/ci.yml)

## 2. Levels of evidence

| Evidence | What it proves | What it does not prove |
|---|---|---|
| Source inspection | Implementation path and proposed integration point | Successful browser execution |
| Unit test with mocks | Pure projection/admission/formatting or failure handling | Actual Worker/download/fullscreen behavior |
| Integration with real core | State/tick/ownership/recording invariants | Keyboard, touch, layout or focus behavior |
| Real browser interaction | Reachable controls and browser behavior | Mobile-device support on hardware not exercised |
| Actual candidate screenshot | Rendered visual state at declared size | Correct hidden state transitions |
| Manual usability/accessibility review | Named participant/environment journey | Universal conformance or all-user success |

Every issue must cite the level appropriate to its acceptance criteria. A test count is not a coverage map.

## 3. Fixtures

Use committed, bounded test arenas/specs and a short deterministic match fixture. Declare which fixtures are non-official. Snapshot tests use fixed viewport, DPR, camera, script source and animation policy. Manual control tests step at controlled boundaries; browser tests may use a probe to prepare a fixture or read state but not to replace the user action under test.

Keep a pair of valid recordings: idle practice with drive/grab/release and a short recorded match with score/retry/result. Generate both at the candidate build identity. Malformed fixtures include oversized arrays, long/unknown metadata, nonfinite numbers, wrong-build/config, unsupported versions and malicious HTML strings. Avoid allocating huge payloads in every CI test; one bounded adversarial test is enough to cover early-rejection logic.

## 4. Unit suites (proposed)

`uiProjection.test.ts`: correct X/Z mapping, speed/yaw rate units, missing slot, stable rounding and no raw mutable handles.

`uiCapabilities.test.ts`: parameterized matrix for each command across boot/match/replay/source/panel states; identical denial reason to UI; no mutation on rejection.

`inputArbiter.test.ts`: key and pointer combination, opposing input normalization, differential strafe absence, source priority, throttle once, fresh-press re-arm and bounded command submissions.

`panelManager.test.ts`: focus ownership, nested closure, repeated mount/unmount and draft preservation.

`preferences.test.ts`: corrupt JSON, unknown version, out-of-range values, long names, denied storage and reset; no script/replay persistence.

`uiDomainParity.test.ts`: equivalent accepted command streams and authoritative final state under old/new shell fixtures; view-only actions do not alter domain state. Existing replay hash/session/protocol/parser tests stay in place.

These names are suggested new files, not claims about present repository contents.

## 5. Mandatory browser acceptance

### B01 — Reference composition and boot

Open an actual build at 1672×941. Observe loading then ready. Assert exactly one viewport and the three intended regions. Sidebars must not cover the arena. Capture a screenshot. Repeat invalid-config and renderer-failure fixtures; actions remain disabled with readable explanations. Covers SC-01/02/21.

### B02 — Selection and manual input

Click robot cards, not internal slot probes. Hold and release every direction on a pointer pad. Use keyboard driving only while the driving region owns focus. Confirm active spec/team, movement and displayed telemetry refer to the same slot. Release outside the pad, cancel pointer, blur, change slot and open a dialog. Verify neutral input by the next admitted fixed step and no opponent/source leakage. Covers SC-03/04.

### B03 — Throttle and source arbitration

Use slider keyboard and pointer interactions. Assert expected normalized effective axes at Normal/Precision settings. Run actual Worker autonomy and ensure idle manual sampling does not overwrite it. Take Manual Control, require a fresh press, and inspect a recording of the handoff. Covers SC-03/07.

### B04 — Camera and resize

Use visible Top/3D/Follow/Reset/Measure controls. Change layout by opening the inspector, not only by firing a window resize. Verify camera aspect, pointer measurement and canvas buffer size. Exercise denied fullscreen and exit. Confirm view operations do not rebuild the world. Covers SC-05.

### B05 — Builder flow

Open Builder, import a draft, make it invalid/overweight, Validate, and assert Apply cannot mutate the live spec. Correct it and Apply once. Change slots with unsaved draft, verify discard policy. Try forbidden Apply during match/recording/playback via UI and controller. Covers SC-08/09.

### B06 — Actual Worker behavior

Use a real browser Worker for a valid synchronous script, a Promise-returning callback, deliberate stale tick command, throw and recover scenario. Keep unit fake-host tests too, but do not claim real Worker behavior from fake hosts. Test session reset while an earlier response is in flight. Covers SC-06/07.

### B07 — Match progression and final result

Start a short fixture through the visible button. Observe setup/countdown/playing/ended, lock states, score and configured retries. Drive at final whistle and verify actuators/velocities obey domain neutralization. Try replay incompatible with that finished match; score/winner/log must remain. Play a compatible recording from ended. Covers SC-10/11/12.

### B08 — Actual file download and round trip

Click Record Practice, drive, then click visible Stop & Export. Configure the test browser to save downloads to a temporary directory or observe a real browser download completion. Read the resulting JSON bytes, parse using the real parser, import through file input, Play, and assert final verification. Instrumented `URL.createObjectURL`/anchor tests are supplemental evidence of dispatch; they alone do not prove a browser-saved file. Repeat for Record Match and wrong-owner buttons. Covers SC-13/14/15/16.

### B09 — Capture boundaries

Stop immediately after Record: require either a valid meaningful file or explicit no-data outcome. Deliver a command between completed step and next frame, then stop: exported command ticks and final state must be internally consistent. Exercise panel close while recording; ownership must remain visible and unchanged. Covers SC-13/14.

### B10 — Share and new-page load

Click Copy Link, assert real enabled/disabled state, capture copied text or accessible fallback, then open it in a fresh page. Wait for actual bootstrap and import; no auto script execution. Confirm navigation does not overwrite #r=. Covers SC-18.

### B11 — Malformed data and safe rendering

Load invalid JSON, over-limit file, too many commands/checkpoints, wrong identity and HTML payload fields. Assert bounded error count/text and preservation of previous file/results. No inserted HTML/event handler may execute. Async request A finishing after newer request B must not replace B. Covers SC-17.

### B12 — Responsive/touch/accessibility

Run the canonical viewport matrix. Check horizontal overflow, actual control hitboxes, virtual keyboard/editor usability, focus order and readable labels. Complete manual and replay flows using keyboard only. Automated touch emulation is followed by a recorded real-device smoke before claiming that device is supported. Covers SC-19/20.

### B13 — Preferences, repeated lifecycle and deployment

Test local settings save/reload/reset and storage-denied fallback. Open/close panels 50 times, switch layouts and source state; count expected renderer/Worker/subscription instances. Serve from root and /robocon/ and load a shared replay directly. Covers SC-22 and deployment resilience.

## 6. Visual tests

Approve screenshots for Practice idle/moving, Builder error/valid, Autonomy error, match countdown/result, replay loaded/failed and compact layouts. Fixed CSS animation preferences are allowed in tests; physics must not be faked in all screenshots. Use canvas masking only to compare shell styling and keep an unmasked fixture screenshot to detect missing scene rendering.

A failed visual diff must be reviewed. Do not auto-accept new baselines in the same step as a test failure. Color/team/card hierarchy must match the chosen light direction, not previous unrelated dark mockups.

## 7. Performance and reliability targets

Proposed measurement: 30 seconds after warm-up on the same declared hardware/browser/scene. Compare baseline and candidate p50/p95 frame time; target ≤15% p95 regression. Bound telemetry to 10 Hz/120 samples, visible logs to 100 rows, validation errors to the existing bounded contract. Verify stable resource counts after 50 panel cycles. Record absolute timings as evidence, not promises for all devices.

No claims about Firefox/WebKit/mobile support based solely on headless Chrome. Add manual smoke evidence for intended browsers and capability fallbacks before broadening the support statement. Accessibility target is evaluated against WCAG 2.2; automated checks alone do not establish conformance. [S22](https://www.w3.org/TR/WCAG22/)

## 8. Evidence record template

```text
Issue/scenario IDs:
Source SHA and dirty-tree status:
Runtime/browser/OS/GPU or software renderer:
Commands actually run:
Test report/log artifact:
Screenshot/downloaded replay artifact:
Expected / observed:
Pass, fail or blocked:
Known limitations and reviewer:
```

Never write “all tests pass” from a source diff, a prior conversation summary, or an unrelated CI run.
