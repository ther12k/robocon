# Requirement, Issue and Evidence Traceability

This is a planning coverage map, not a pass report. Every reference to a test is a required execution or review on the eventual implementation candidate. Scenario definitions are in [Screen Scenarios](SCREEN_SCENARIOS.md); B01–B13 are defined in [Test Plan](TEST_PLAN.md).

| Requirement | Launch issue(s) | Required evidence |
|---|---|---|
| FR-01 — Light shell and navigation | [RUI-003](issues/RUI-003.md), [RUI-006](issues/RUI-006.md), [RUI-007](issues/RUI-007.md), [RUI-008](issues/RUI-008.md), [RUI-009](issues/RUI-009.md), [RUI-033](issues/RUI-033.md), [RUI-035](issues/RUI-035.md), [RUI-038](issues/RUI-038.md) | SC-01/02; B01; visual desktop approval |
| FR-02 — Loading and failure states | [RUI-008](issues/RUI-008.md) | SC-01/21; B01 |
| FR-03 — Robot selection | [RUI-010](issues/RUI-010.md) | SC-02/03/04; B02/B03 |
| FR-04 — Manual controls | [RUI-011](issues/RUI-011.md), [RUI-013](issues/RUI-013.md), [RUI-032](issues/RUI-032.md) | SC-03/04; B02/B03/B12 |
| FR-05 — Throttle and precision | [RUI-012](issues/RUI-012.md), [RUI-028](issues/RUI-028.md) | SC-03; B03 |
| FR-06 — Arena/camera | [RUI-007](issues/RUI-007.md), [RUI-015](issues/RUI-015.md) | SC-05; B04 |
| FR-07 — Telemetry | [RUI-003](issues/RUI-003.md), [RUI-004](issues/RUI-004.md), [RUI-017](issues/RUI-017.md) | SC-02/03; B02 and projection unit tests |
| FR-08 — Session, match and provenance | [RUI-004](issues/RUI-004.md), [RUI-018](issues/RUI-018.md), [RUI-019](issues/RUI-019.md) | SC-10/11/12; B07 |
| FR-09 — Quick actions | [RUI-003](issues/RUI-003.md), [RUI-005](issues/RUI-005.md), [RUI-014](issues/RUI-014.md) | SC-03/04; B02 and selected-reset integration |
| FR-10 — Autonomy | [RUI-005](issues/RUI-005.md), [RUI-006](issues/RUI-006.md), [RUI-011](issues/RUI-011.md), [RUI-013](issues/RUI-013.md), [RUI-020](issues/RUI-020.md), [RUI-021](issues/RUI-021.md), [RUI-032](issues/RUI-032.md) | SC-06/07; B06 |
| FR-11 — Record/export | [RUI-005](issues/RUI-005.md), [RUI-022](issues/RUI-022.md), [RUI-032](issues/RUI-032.md) | SC-13/14; B08/B09 |
| FR-12 — Replay playback and verification | [RUI-005](issues/RUI-005.md), [RUI-019](issues/RUI-019.md), [RUI-023](issues/RUI-023.md), [RUI-024](issues/RUI-024.md), [RUI-032](issues/RUI-032.md) | SC-12/15/16/17; B07/B11 |
| FR-13 — Share/import | [RUI-023](issues/RUI-023.md), [RUI-025](issues/RUI-025.md), [RUI-032](issues/RUI-032.md), [RUI-035](issues/RUI-035.md) | SC-14/15/17/18; B10/B11 |
| FR-14 — Builder | [RUI-005](issues/RUI-005.md), [RUI-006](issues/RUI-006.md), [RUI-026](issues/RUI-026.md), [RUI-032](issues/RUI-032.md) | SC-08/09; B05 |
| FR-15 — Responsive layout | [RUI-007](issues/RUI-007.md), [RUI-008](issues/RUI-008.md), [RUI-029](issues/RUI-029.md), [RUI-033](issues/RUI-033.md), [RUI-038](issues/RUI-038.md) | SC-19/20; B12 |
| FR-16 — Accessibility | [RUI-006](issues/RUI-006.md), [RUI-009](issues/RUI-009.md), [RUI-011](issues/RUI-011.md), [RUI-015](issues/RUI-015.md), [RUI-020](issues/RUI-020.md), [RUI-026](issues/RUI-026.md), [RUI-029](issues/RUI-029.md), [RUI-030](issues/RUI-030.md), [RUI-038](issues/RUI-038.md) | All scenarios; B12 and manual assistive-technology review |
| FR-17 — Local preferences and tips | [RUI-012](issues/RUI-012.md), [RUI-027](issues/RUI-027.md), [RUI-028](issues/RUI-028.md), [RUI-036](issues/RUI-036.md) | SC-02/22; B13 |
| FR-18 — Visual arena fidelity and provenance | [RUI-001](issues/RUI-001.md), [RUI-003](issues/RUI-003.md), [RUI-007](issues/RUI-007.md), [RUI-008](issues/RUI-008.md), [RUI-016](issues/RUI-016.md), [RUI-018](issues/RUI-018.md), [RUI-033](issues/RUI-033.md), [RUI-036](issues/RUI-036.md) | SC-02/05; rendering, asset and provenance review |
| FR-19 — State/ownership safety | [RUI-002](issues/RUI-002.md), [RUI-004](issues/RUI-004.md), [RUI-005](issues/RUI-005.md), [RUI-006](issues/RUI-006.md), [RUI-010](issues/RUI-010.md), [RUI-011](issues/RUI-011.md), [RUI-013](issues/RUI-013.md), [RUI-014](issues/RUI-014.md), [RUI-019](issues/RUI-019.md), [RUI-021](issues/RUI-021.md), [RUI-022](issues/RUI-022.md), [RUI-024](issues/RUI-024.md), [RUI-026](issues/RUI-026.md), [RUI-029](issues/RUI-029.md), [RUI-031](issues/RUI-031.md), [RUI-032](issues/RUI-032.md), [RUI-034](issues/RUI-034.md), [RUI-037](issues/RUI-037.md), [RUI-038](issues/RUI-038.md) | SC-04/07/10/12/14/17; B02/B07/B09/B11 |
| FR-20 — Errors and safe output | [RUI-002](issues/RUI-002.md), [RUI-003](issues/RUI-003.md), [RUI-005](issues/RUI-005.md), [RUI-009](issues/RUI-009.md), [RUI-014](issues/RUI-014.md), [RUI-020](issues/RUI-020.md), [RUI-021](issues/RUI-021.md), [RUI-022](issues/RUI-022.md), [RUI-023](issues/RUI-023.md), [RUI-025](issues/RUI-025.md), [RUI-026](issues/RUI-026.md), [RUI-027](issues/RUI-027.md), [RUI-028](issues/RUI-028.md), [RUI-030](issues/RUI-030.md), [RUI-032](issues/RUI-032.md), [RUI-034](issues/RUI-034.md), [RUI-036](issues/RUI-036.md), [RUI-038](issues/RUI-038.md) | SC-07/08/12/17/21; bounded-error, safe-text and non-destructive rejection tests |
| NFR-01 — Performance/resource bounds | [RUI-004](issues/RUI-004.md), [RUI-007](issues/RUI-007.md), [RUI-017](issues/RUI-017.md), [RUI-031](issues/RUI-031.md), [RUI-038](issues/RUI-038.md) | B13; RUI-031 frame-time/resource report |
| NFR-02 — Determinism/compatibility | [RUI-001](issues/RUI-001.md), [RUI-002](issues/RUI-002.md), [RUI-012](issues/RUI-012.md), [RUI-013](issues/RUI-013.md), [RUI-016](issues/RUI-016.md), [RUI-021](issues/RUI-021.md), [RUI-024](issues/RUI-024.md), [RUI-034](issues/RUI-034.md), [RUI-038](issues/RUI-038.md) | B06/B07/B08/B11; same-build golden fixtures |
| NFR-03 — Security/privacy/trust | [RUI-002](issues/RUI-002.md), [RUI-003](issues/RUI-003.md), [RUI-016](issues/RUI-016.md), [RUI-018](issues/RUI-018.md), [RUI-028](issues/RUI-028.md), [RUI-036](issues/RUI-036.md), [RUI-038](issues/RUI-038.md) | B05/B06/B10/B11/B13; bounded input and trust-copy checks |
| NFR-04 — Maintainability/deployment | [RUI-001](issues/RUI-001.md), [RUI-035](issues/RUI-035.md), [RUI-036](issues/RUI-036.md), [RUI-037](issues/RUI-037.md), [RUI-038](issues/RUI-038.md) | B13; root/subpath builds, source-pinned CI and rollback evidence |

## Deferred capability trace

| Capability | Issue | Launch treatment |
|---|---|---|
| Pause/seek/rate | [RUI-039](issues/RUI-039.md) | Read-only progress, Play from start and Stop |
| Lift mechanics | [RUI-040](issues/RUI-040.md) | No Lift Up/Lower Down controls |
| Battery and environmental models | [RUI-041](issues/RUI-041.md) | No invented battery or weather values; feasibility review only |
| Untrusted-script isolation | [RUI-042](issues/RUI-042.md) | Explicit trusted-code execution, no claim of a security sandbox |

## Historical-regression protection

RUI-002 inventories the tests and invariants actually present in the implementation checkout. RUI-034 revalidates them after migration. They include recorder ownership, real export/share reachability, compatible replay from ended, incompatible replay preserving results, parser limits, tick/session provenance, script errors, reset/neutralization semantics, authoritative hash verification and input-lock ownership. This package does not assert that every old audit finding is still open or that every related test already exists.

## Completion discipline

A checked issue without candidate evidence is not a passed requirement. A screenshot cannot prove input cancellation; a fake-host unit test cannot prove an actual Worker protocol path; an export probe returning an object cannot prove browser download. Record the specific evidence type and actual source SHA. The final reviewer signs [Release Gates](RELEASE_GATES.md), with residual scope limitations intact.
