# Epics and Delivery Milestones

These are grouping definitions, not additional tickets. The issue count remains 42. The last group is a deferred capability pool and is excluded from the first release.

| Group | Outcome | Entry condition | Exit evidence |
|---|---|---|---|
| M0 — Baseline and design | Verified checkout, regression inventory, approved honest light design | Maintainer selects the image and implementation scope | Baseline SHA/results, actual screenshot, reference hash, capability deviations |
| M1 — Shell and integration seams | One renderer in a light, accessible shell with safe domain adapters | M0 evidence available | Light shell screenshot, immutable projections, centralized capabilities, resize/focus tests |
| M2 — Live practice and match | Working controls, camera, gripper/reset, telemetry, autonomy and match cards | Relevant M1 adapters/primitives merged | Visible journeys, input cancellation/handoff, match lifecycle and read-only telemetry tests |
| M3 — Replay, builder and preferences | File-based iteration workflow within the same light design | Domain-facing controller available | Actual download/import/play/share round trips; Builder validation; local preference tests |
| M4 — Quality, rollout and acceptance | Responsive, tested, documented release on one candidate SHA | All mandatory features integrated | Browser/visual/accessibility/parity/performance/deployment evidence; maintainer approval and rollback |
| M5 — Deferred capabilities | Independently justified richer simulator or security features | Separate product/security decision | Capability-specific contracts and evidence; never assumed complete by the UI release |

## Workstream ownership

**Product/design owner:** reference fidelity, truthful capability labeling, copy, usability results and scope decisions.

**Application/UI owner:** shell, navigation, projection store, component lifecycle, local preferences, responsive layout.

**Simulation/control owner:** command admission, source arbitration, neutralization/reset semantics and replay determinism. Changes are narrow and reviewed; no engine rewrite.

**Quality/release owner:** source-pinned test evidence, real browser actions/downloads, accessibility, performance, deployment and rollback.

Roles may be held by one maintainer/agent, but critical state/security decisions require an explicit review record. An implementation agent should not silently grant itself acceptance or substitute source inspection for execution evidence.

## Milestone boundaries

M1 is not “all features redesigned”; it proves that the new shell can be integrated without duplicate loops or controllers. M2 includes manual controls that are real behavior changes and deserve the same rigor as the existing engine. M3 does not add a seekable timeline, video export or cloud storage. M4 approves a UI release in the stated trusted-code/provisional-arena scope, not arbitrary-script safety or official competition certification.

## Estimation and scheduling

The backlog uses relative S/M/L estimates. Do not derive a calendar commitment by summing them: testing and main-entry integration have dependencies, and some work can be parallelized. Re-estimate after the actual baseline and adapter spike. No external provider contract, paid dependency or backend service is assumed.

See [Task Index](TASK_INDEX.md) for exact issue membership and dependency order, and [Release Gates](RELEASE_GATES.md) for the final decision.
