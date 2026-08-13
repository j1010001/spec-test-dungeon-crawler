<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: N/A (initial ratification from template)
  - [PRINCIPLE_1_NAME] → I. Library-First
  - [PRINCIPLE_2_NAME] → II. Test-First (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Integration Testing
  - [PRINCIPLE_4_NAME] → IV. Observability
  - [PRINCIPLE_5_NAME] → V. Versioning & Breaking Changes
- Added sections:
  - Core Principles (5 principles)
  - Additional Constraints (technology stack, simplicity/complexity justification, scope boundaries)
  - Development Workflow (TDD cycle, review gates, constitution compliance)
  - Governance (supremacy, amendment procedure, versioning policy, compliance review)
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no change needed (Constitution Check gate + Complexity Tracking already align)
  - .specify/templates/spec-template.md — ✅ no change needed (user scenarios + requirements align with Test-First and Integration Testing)
  - .specify/templates/tasks-template.md — ✅ no change needed (test-first ordering + contract/integration test categories align)
  - .specify/templates/checklist-template.md — ✅ no change needed (generic)
  - .specify/templates/commands/*.md — ✅ no command files present; no agent-specific references found
- Follow-up TODOs: none
- Notes: Simplicity/YAGNI theme folded into Additional Constraints as complexity-justification rule (mirrors plan-template Complexity Tracking gate). CLI/text-IO theme not selected by user; omitted deliberately.
-->

# spec-drift-test-1 Constitution

SpecKit spec-drift detection testbed. This constitution is the supreme governance
document for the project; it supersedes any conflicting practice, convention, or
ad-hoc decision.

## Core Principles

### I. Library-First

Every feature MUST originate as a standalone library before any application,
CLI, or service wrapper is built on top of it.

- Libraries MUST be self-contained: independently importable, independently
  testable, and documented with their own purpose and boundaries.
- A library MUST have a single, clear purpose. Organizational-only libraries
  (existing solely to group unrelated code) are forbidden.
- Application code MAY depend on libraries; libraries MUST NOT depend on
  application code.

Rationale: isolating logic in libraries forces clear boundaries, enables reuse,
and makes contract and integration testing tractable.

### II. Test-First (NON-NEGOTIABLE)

Test-Driven Development is mandatory and not subject to per-feature waiver.

- Tests MUST be written and user-approved BEFORE implementation begins.
- Tests MUST fail (red) against the not-yet-implemented code before any
  implementation is written.
- The Red-Green-Refactor cycle MUST be strictly enforced: red → green → refactor,
  with a green suite committed at each cycle's end.
- No implementation PR MAY merge without a corresponding passing test that
  exercises the changed behavior.

Rationale: specifying behavior first eliminates ambiguity and makes spec drift
detectable — the project's core purpose.

### III. Integration Testing

Unit tests are necessary but insufficient; integration tests MUST guard the
seams between libraries and services.

- New library contracts MUST ship with contract tests in `tests/contract/`.
- Any change to an existing contract MUST update or add contract tests in the
  same change.
- Inter-service communication and shared schema changes MUST be covered by
  integration tests in `tests/integration/`.
- A change with no updated integration test where one is required MUST fail
  review.

Rationale: contract and integration tests are the mechanism by which spec drift
is caught at boundaries — the highest-risk area for silent divergence.

### IV. Observability

All runtime behavior MUST be observable through structured, machine-parseable
output.

- Structured logging MUST be emitted for every significant operation; free-form
  print statements are forbidden in library code.
- Log events MUST include at minimum: timestamp, level, component, and a
  correlation identifier where the operation spans components.
- Errors MUST propagate to stderr with stable, documented exit codes; stdout
  is reserved for successful payload output.
- Text I/O is the primary debuggability surface: any feature MUST be
  inspectable via its textual output without a debugger attached.

Rationale: a spec-drift testbed requires deterministic, queryable evidence of
what the system did and why; unobservable behavior is unverifiable behavior.

### V. Versioning & Breaking Changes

All published libraries and contracts MUST follow semantic versioning
(`MAJOR.MINOR.PATCH`).

- `MAJOR` increments on any backward-incompatible change to a public contract,
  library API, or documented behavior.
- `MINOR` increments on additive, backward-compatible changes.
- `PATCH` increments on internal fixes and clarifications that do not alter
  public behavior.
- Every breaking change MUST be accompanied by: a migration note, the previous
  behavior it replaces, and the version in which the deprecation was announced.
- Undocumented behavior is not a public contract; relying on it is at the
  consumer's risk.

Rationale: explicit versioning makes drift visible across consumers and time,
which is the measurement this project exists to perform.

## Additional Constraints

### Technology Stack

- The project's concrete language, framework, storage, and test runner are
  defined per-feature in `plan.md` under "Technical Context". The constitution
  does not hard-pin a stack; the plan MUST record the chosen stack before Phase 0
  research begins.
- Where `plan.md` marks a stack field `NEEDS CLARIFICATION`, that field MUST be
  resolved and recorded before any implementation task is scheduled.

### Simplicity & Complexity Justification

- Start with the simplest design that satisfies the current spec. YAGNI applies:
  do not build for speculative future requirements.
- Any deviation from the simplest viable design MUST be justified in the plan's
  Complexity Tracking table, including the simpler alternative rejected and why
  it was insufficient.
- Constitutional complexity gates (e.g., project count, architectural pattern
  choice) MUST be re-checked after Phase 1 design, not only at plan creation.

### Scope Boundaries

- Out-of-scope assumptions from `spec.md` MUST be respected; scope creep
  requires a spec amendment, not a quiet code change.
- Mobile support, external auth providers, and deployment targets are scoped
  per-feature in `spec.md`'s Assumptions section unless stated otherwise.

## Development Workflow

### TDD Cycle Enforcement

- Every task in `tasks.md` that involves implementation MUST be preceded by its
  test task, and the test task MUST be marked complete (red) before the
  implementation task starts.
- Tests are OPTIONAL only when the feature specification explicitly declares no
  tests; otherwise the Test-First principle governs.

### Review Gates

- Constitution Check MUST pass before Phase 0 research and MUST be re-checked
  after Phase 1 design.
- Code review MUST verify: presence of failing-then-passing tests, updated
  contract tests for any changed boundary, structured logging for new
  operations, and correct version bump for the change type.
- No PR MAY merge with an unresolved constitution violation unless the
  Complexity Tracking table documents an approved justification.

### Compliance Review

- The constitution is reviewed at minimum once per feature plan creation and
  amended per the Governance procedure below.
- Drift between this constitution and actual practice is itself a finding and
  MUST be recorded, not silently absorbed.

## Governance

This constitution is the supreme governance document for spec-drift-test-1. It
supersedes all other practices, conventions, and ad-hoc decisions. Where a
template, plan, spec, or task list conflicts with this document, this document
prevails and the conflicting artifact MUST be reconciled.

### Amendment Procedure

- Amendments MUST be documented as a change to this file with an incremented
  version, an updated `Last Amended` date, and a Sync Impact Report prepended
  as an HTML comment.
- Amendments require: the proposed diff, a recorded rationale, and (where the
  change alters principles) a migration plan for in-flight features.
- Ratification of an amendment is the act of committing the updated
  `constitution.md`; no separate approval artifact is required for this
  single-maintainer testbed.

### Versioning Policy

Constitution versions follow semantic versioning:
- `MAJOR`: removal or redefinition of an existing principle, or a
  backward-incompatible governance change.
- `MINOR`: addition of a new principle or materially expanded guidance.
- `PATCH`: clarifications, wording, typo fixes, and non-semantic refinements.

### Compliance Review

- Every feature plan MUST run a Constitution Check before Phase 0 and re-check
  after Phase 1 design.
- Reviewers MUST reject plans and PRs that violate a non-negotiable principle
  (currently: II. Test-First) without an explicit, recorded waiver.
- Use `AGENTS.md` and the current `plan.md` for runtime development guidance;
  this file governs principles, not day-to-day mechanics.

**Version**: 1.0.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-06-25
