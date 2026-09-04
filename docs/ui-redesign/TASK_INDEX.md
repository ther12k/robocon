# Task Index — GitHub-Ready Backlog

**42 issue bodies: 38 launch tasks and 4 explicitly deferred tasks.** No real GitHub issue numbers have been assigned by this package.

The launch track is RUI-001–038. Deferred RUI-039–042 are deliberately excluded from default registration. Every issue file includes source grounding, integration points, implementation tasks, acceptance criteria, test evidence, labels, milestone and dependencies.

## Scheduling conventions

Priority is a proposed **delivery priority**, not a claim that the current repository has a vulnerability. P0 = preserve critical state/input/replay/release guarantees; P1 = launch feature; P2 = supporting presentation/documentation; P3 = future capability. Estimates S/M/L are relative effort, not person-day promises. RUI-001 produces a real baseline; re-estimate after it.

Dependencies are planning IDs. Import in ascending ID order; [GitHub Import](GITHUB_IMPORT.md) can replace dependency IDs with real issue references. It does not configure GitHub Projects or native dependency fields. [Traceability](TRACEABILITY.md) maps requirements to this backlog.

## M0 - Baseline and design

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-001](issues/RUI-001.md) | Pin the implementation baseline and publish reference evidence | P1 | S | None |
| [RUI-002](issues/RUI-002.md) | Preserve simulator and previous audit regression contracts | P0 | M | RUI-001 |
| [RUI-003](issues/RUI-003.md) | Approve light tokens, component hierarchy and capability-safe copy | P1 | M | RUI-001 |

## M1 - Shell and integration seams

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-004](issues/RUI-004.md) | Create read-only UI projections and an immutable store | P1 | M | RUI-002 |
| [RUI-005](issues/RUI-005.md) | Centralize UI intents and capability admission | P0 | L | RUI-002, RUI-004 |
| [RUI-006](issues/RUI-006.md) | Implement panel lifetime and accessible focus ownership | P1 | M | RUI-003, RUI-005 |
| [RUI-007](issues/RUI-007.md) | Move the canvas into a resize-aware arena card | P1 | L | RUI-003, RUI-004 |
| [RUI-008](issues/RUI-008.md) | Build the light shell, navigation and three-column workspace | P1 | L | RUI-003, RUI-006, RUI-007 |
| [RUI-009](issues/RUI-009.md) | Create accessible control and status primitives | P1 | M | RUI-003, RUI-008 |

## M2 - Live practice and match workspace

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-010](issues/RUI-010.md) | Implement data-driven robot selection cards | P1 | M | RUI-004, RUI-005, RUI-009 |
| [RUI-011](issues/RUI-011.md) | Unify keyboard and pointer driving through an input arbiter | P0 | L | RUI-005, RUI-006, RUI-010 |
| [RUI-012](issues/RUI-012.md) | Add manual throttle and Normal/Precision modes | P1 | S | RUI-011 |
| [RUI-013](issues/RUI-013.md) | Make Stop driving and control handoff safe and reproducible | P0 | L | RUI-005, RUI-011 |
| [RUI-014](issues/RUI-014.md) | Add honest gripper actions and an idle-only selected-robot reset | P1 | M | RUI-005, RUI-010, RUI-013 |
| [RUI-015](issues/RUI-015.md) | Integrate camera tools, measurement and fullscreen | P1 | M | RUI-007, RUI-009, RUI-010 |
| [RUI-016](issues/RUI-016.md) | Polish arena presentation without changing physics or provenance | P2 | M | RUI-003, RUI-007, RUI-015 |
| [RUI-017](issues/RUI-017.md) | Build live telemetry and bounded speed history | P1 | M | RUI-004, RUI-009, RUI-010 |
| [RUI-018](issues/RUI-018.md) | Present session status and explicit arena provenance | P1 | M | RUI-004, RUI-009 |
| [RUI-019](issues/RUI-019.md) | Build light match scoreboard and results review | P1 | M | RUI-005, RUI-009, RUI-018 |
| [RUI-020](issues/RUI-020.md) | Create the light autonomy card and script workspace | P1 | M | RUI-005, RUI-006, RUI-009, RUI-010, RUI-013 |
| [RUI-021](issues/RUI-021.md) | Preserve autonomy session, visibility and error recovery behavior | P1 | M | RUI-002, RUI-013, RUI-020 |

## M3 - Replay builder and preferences

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-022](issues/RUI-022.md) | Integrate recorder ownership and real JSON export | P0 | M | RUI-005, RUI-009, RUI-019, RUI-021 |
| [RUI-023](issues/RUI-023.md) | Build bounded replay import and non-destructive compatibility UI | P0 | M | RUI-005, RUI-009, RUI-022 |
| [RUI-024](issues/RUI-024.md) | Implement replay transport, read-only progress and result status | P1 | M | RUI-005, RUI-019, RUI-023 |
| [RUI-025](issues/RUI-025.md) | Wire Copy Link and fresh-page shared-replay loading | P1 | M | RUI-006, RUI-023, RUI-024 |
| [RUI-026](issues/RUI-026.md) | Restyle the JSON Builder and preserve validation/apply behavior | P1 | M | RUI-005, RUI-006, RUI-009, RUI-010 |
| [RUI-027](issues/RUI-027.md) | Add contextual tips and a first-use orientation | P2 | S | RUI-009, RUI-010, RUI-018 |
| [RUI-028](issues/RUI-028.md) | Implement local-only settings and session display preferences | P2 | M | RUI-006, RUI-009, RUI-012, RUI-027 |

## M4 - Quality rollout and acceptance

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-029](issues/RUI-029.md) | Implement tablet and phone layouts with safe touch behavior | P1 | L | RUI-008, RUI-010, RUI-011, RUI-015, RUI-017, RUI-018, RUI-019, RUI-020, RUI-024, RUI-026, RUI-028 |
| [RUI-030](issues/RUI-030.md) | Audit keyboard, semantics, contrast and screen-reader flows | P1 | M | RUI-006, RUI-009, RUI-011, RUI-025, RUI-026, RUI-029 |
| [RUI-031](issues/RUI-031.md) | Profile DOM/render overhead and verify lifecycle cleanup | P1 | M | RUI-004, RUI-007, RUI-017, RUI-021, RUI-029 |
| [RUI-032](issues/RUI-032.md) | Add real-browser end-to-end coverage for mandatory journeys | P0 | L | RUI-002, RUI-014, RUI-015, RUI-019, RUI-021, RUI-022, RUI-023, RUI-024, RUI-025, RUI-026, RUI-029, RUI-030 |
| [RUI-033](issues/RUI-033.md) | Establish visual regression baselines for the approved light UI | P1 | M | RUI-003, RUI-008, RUI-016, RUI-019, RUI-024, RUI-026, RUI-029 |
| [RUI-034](issues/RUI-034.md) | Prove deterministic parity and full capability matrix coverage | P0 | L | RUI-002, RUI-005, RUI-013, RUI-014, RUI-021, RUI-022, RUI-023, RUI-024, RUI-026 |
| [RUI-035](issues/RUI-035.md) | Verify build, base-path deployment and share-link routing | P1 | M | RUI-008, RUI-025, RUI-029 |
| [RUI-036](issues/RUI-036.md) | Publish implementation guidance, user help and capability limitations | P2 | S | RUI-019, RUI-021, RUI-025, RUI-026, RUI-028, RUI-030, RUI-035 |
| [RUI-037](issues/RUI-037.md) | Roll out the light shell behind a reversible flag | P1 | M | RUI-031, RUI-032, RUI-033, RUI-034, RUI-035, RUI-036 |
| [RUI-038](issues/RUI-038.md) | Approve the light dashboard release on one exact SHA | P0 | S | RUI-037 |

## M5 - Deferred capabilities

**Deferred — these do not block the light-dashboard release.**

| ID | Issue | Priority | Size | Dependencies |
|---|---|---|---|---|
| [RUI-039](issues/RUI-039.md) | Design and implement richer replay transport only as a separate increment | P3 | L | RUI-038 |
| [RUI-040](issues/RUI-040.md) | Specify a real lift module before exposing lift actions | P3 | L | RUI-001, RUI-038 |
| [RUI-041](issues/RUI-041.md) | Evaluate energy and environment models before adding extra telemetry | P3 | M | RUI-001, RUI-038 |
| [RUI-042](issues/RUI-042.md) | Plan capability isolation for untrusted scripts independently of the UI | P3 | L | RUI-001, RUI-002, RUI-021 |

## Recommended sequence and parallel work

Start with RUI-001–003. Keep RUI-004/005/006 integration contracts stable before mounting all cards. RUI-007 owns renderer/container changes; views consume it rather than each making a new renderer. After primitives and adapters merge, telemetry, status, robot cards and documentation can be developed in parallel, with one owner coordinating `src/main.ts`.

Manual-input work 011 → 012 → 013 must remain ordered because handoff correctness depends on normalization and source provenance. Replay work 022 → 023 → 024 → 025 is ordered to keep artifact ownership, compatibility, playback and sharing coherent. The browser and accessibility tracks may start early with partial fixtures; their final pass must run against the integrated candidate.

The terminal gate is RUI-038. Descendant feature work is not substituted for unresolved critical input/replay defects. Scope changes require a written maintainer decision and updated traceability, not silent issue deletion.

## Registration and handoff

Read [GitHub Import](GITHUB_IMPORT.md) before posting bodies so relative documentation links do not break on GitHub. Give agents [Agent Handoff](AGENT_HANDOFF.md), [Architecture](ARCHITECTURE.md), and the individual issue. Capture candidate evidence under a documented repository path rather than modifying this planning package to imply tests already ran.
