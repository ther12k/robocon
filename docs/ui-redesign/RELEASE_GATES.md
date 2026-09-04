# Release Gates — Light Dashboard

These gates approve the UI redesign only. They do not certify official competition fidelity or untrusted-script isolation.

## G0 — Baseline and design

- [ ] Actual implementation SHA and baseline commands/results are recorded.
- [ ] Supplied reference and intentional capability-safe deviations are approved.
- [ ] Existing audit regressions are inventoried rather than reopened from old cached source.
- [ ] Source/asset provenance and scope boundaries are explicit.

## G1 — Visible reference implementation

- [ ] Light shell uses left controls, central live arena and right inspector at desktop sizes.
- [ ] Practice, Builder, Autonomy, match/results and replay use one coherent light design.
- [ ] Pointer controls, throttle, camera tools and live telemetry are real and connected.
- [ ] No fictional battery, weather, lift, account, connection or official-field claim is displayed.
- [ ] All included quick actions have precise state and capability rules.

## G2 — Domain and replay safety

- [ ] UI and handlers share admission predicates; illegal actions are non-destructive.
- [ ] Manual and autonomy sources cannot fight over one slot.
- [ ] Pointer/focus/session/source interruption cannot leave movement latched.
- [ ] Recording ownership, capture boundary and real export round trip pass.
- [ ] Incompatible replay leaves ended score/winner/log intact.
- [ ] Compatible ended-match replay plays; verification status remains truthful after cleanup.
- [ ] Tick/session/protocol/parser limits and previous regression suites still pass.
- [ ] Camera, layout, preferences and telemetry do not alter authoritative physics/config.

## G3 — Usability, accessibility and responsive behavior

- [ ] Canonical desktop/tablet/phone screenshots approved.
- [ ] No overflow, clipped controls or accidental world restart during layout changes.
- [ ] Keyboard-only flows work; Tab is not globally hijacked.
- [ ] Dialog focus and Escape/Enter behavior are correct.
- [ ] Contrast, text size, accessible names and live-region behavior reviewed.
- [ ] Real-device/browser support statement matches recorded tests.
- [ ] First-user practice/record/reload evaluation records actual outcomes and sample size.

## G4 — Delivery evidence

- [ ] Typecheck, unit/integration, build and browser jobs pass at the candidate SHA.
- [ ] Actual downloads and fresh-page shared URLs are tested, not only probes.
- [ ] Bounded performance/resource targets have evidence or accepted measured exceptions.
- [ ] Root and subdirectory production deployment works.
- [ ] Documentation matches implemented controls; all links resolve.
- [ ] Feature-flag default switch and rollback path are tested.
- [ ] Maintainer records an explicit GO/NO-GO with known limitations.

## Release decision template

```text
Candidate SHA:
Review date:
Baseline compared:
Mandatory issues: RUI-001 through RUI-038
Passed evidence:
Failed/blocked gates:
Accepted scope differences:
Supported browser/device evidence:
Known trusted-code / provisional-arena limitations:
Rollback procedure and owner:
Decision: GO / NO-GO
Approver:
```

## Residual strategic gates

Untrusted third-party scripts require separate capability-isolation engineering and adversarial/security review. A trusted-code technical preview may be evaluated on a narrower risk basis; do not declare every public UI release automatically secure or insecure solely from its theme.

Official competition positioning requires verified rulebook and arena provenance. The supplied image and this PRD do not supply it. Deferred RUI-039–042 do not prevent the truthful light-dashboard launch; they block only their respective new capabilities.

## Waiver policy

Cosmetic differences may be approved with screenshots and rationale. No visual waiver may silently excuse a stuck-input, lost-result, replay-corruption, unsafe rendering or unbounded parsing regression. A failed core invariant is a NO-GO for the affected release.
