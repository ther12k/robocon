# Coding Agent Handoff

## Mission

Implement the user-selected light Robocon Arena Lab dashboard in `ther12k/robocon` using this package. The reference image is in `assets/reference-dashboard.png`. Preserve existing simulator behavior; make its capabilities accessible through the new UI rather than rebuild the engine.

## Read order

README → REPOSITORY_REVIEW → PRD → DESIGN_SPEC → STATE_AND_CAPABILITIES → ARCHITECTURE → DATA_CONTRACTS → TASK_INDEX → TEST_PLAN.

The source register pins observations to f5092ff, not an assertion that the working branch must still be there. RUI-001 establishes current reality. The unrelated Bundar material from the conversation is not a basis for this project.

## First iteration

Complete RUI-001–003 before replacing source layout. Record the actual SHA and baseline tests; preserve and cite later landed fixes. Publish the documentation/reference and register issues with stable RUI IDs. Then build integration seams RUI-004–007 before making all cards live.

## Non-negotiable constraints

- Keep one world, renderer, camera rig and simulation loop. UI navigation and resizing are not resets.
- No React/backend/framework migration without a new approved architecture decision.
- UI code dispatches through AppController, never mutates raw bodies or scores.
- Enforce guards in handlers, not just disabled buttons.
- Preserve command, session, replay, validation and trust boundaries from the current baseline.
- Keep explicit role/team, X/Z units, provisional arena and trusted-code copy.
- No fabricated battery/weather/network/account/official status or nonfunctional lift/seek controls.
- No new physics/collider geometry inferred from the image.
- No duplicated IDs/listeners while supporting the legacy flag.
- Tests must exercise visible controls for browser UX acceptance.

## Working protocol

Use one branch/PR per issue or a small dependency-coherent group. Identify the RUI planning IDs and real GitHub issue numbers in each PR. List existing files touched and newly introduced files. Do not refactor unrelated engine code while changing CSS.

Before implementation, read the actual target file. A path described as proposed in this package may not exist yet. If an issue is already satisfied, attach evidence and mark it superseded/implemented instead of manufacturing redundant code changes.

Run the issue-level tests and the appropriate regression suite. Record commands and results truthfully. For a blocked test environment, report blocked status and reason; do not substitute a successful source inspection for an execution result.

## PR evidence template

```text
Planning issue(s):
GitHub issue(s):
Base SHA / candidate SHA:
Behavior implemented:
State/ownership changes:
Source files and docs changed:
Tests actually run and output artifacts:
Browser screenshots/download evidence:
Reference-image differences:
Known limitations:
Rollback:
```

## Safe parallelism

After RUI-004/005/009 merge, independent card work can proceed in parallel if view-model contracts are stable. Coordinate all edits to `src/main.ts`, InputArbiter and PanelManager through one owner. Replay tasks are ordered 022 → 023 → 024 → 025. Quality tasks may begin early, but their final evidence must be regenerated after integration.

## Finish line

RUI-038 is the UI release decision, not a declaration that optional RUI-039–042 are complete. Do not describe a trusted-code preview as safe for arbitrary scripts or a provisional arena as official. Do not end work with only “tests passed”; provide the specific evidence and the actual rendered light screens.
