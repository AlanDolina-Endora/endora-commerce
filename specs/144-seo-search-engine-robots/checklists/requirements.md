# Specification Quality Checklist: Search engine robots — default page robots, `robots.txt` instructions and `llms.txt`

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- First validated on 2026-10-11 with three `[NEEDS CLARIFICATION]` markers left for the owner
  (Q1 — is the `llms.txt` base generated; Q2 — how far a non-indexable default reaches beyond the
  storefront's own address; Q3 — which robots variants the dropdown offers).
- **Re-validated the same day after the owner's rulings.** All three were answered as
  recommended and are recorded in the spec's *Owner rulings* as R1 – R3, each with the rejected
  alternative; no marker remains. Two further rulings changed requirements: R4 makes a preview of
  the resulting `robots.txt` in the Admin UI mandatory (FR-038 – FR-045, overturning the original
  assumption A9), and R5 rewrites FR-017 so that a page is never failed because the default could
  not be read.
- **Re-validated again the same day after the owner's second answer** ("Do it with the
  recommendations", on the five decisions `plan.md` raised). They are R6 – R10 in the spec:
  R6 rewords FR-009 (the palette entry is offered to administrators who may see settings), R7
  rewords FR-033 (the switch-off warning is English at the switch and English and Polish on the
  Settings screen), R8 rewords FR-008 and SC-008 (the dropdown's choices are untranslated
  directive tokens), R9 puts the outdated-storefront notice on the *Default robots* row, and R10
  turns assumption A15 (the `llms.txt` preview) into a ruling. Each reworded requirement says in
  its own text what the ruling changed. All checklist items still pass.
- **One choice is a recommendation, not a ruling, and is not a marker**: which of the two preview
  shapes the owner offered. The spec applies "a preview beside the field" and rejects "a field
  pre-filled with the system rules", with the reasons in A9 and the list of requirements that
  would change if the owner prefers the other. `/speckit.plan` can proceed on it.
- Every other decision the feature description left open is recorded under *Assumptions* (A1 –
  A16) with the alternative rejected; the owner accepted them as written on 2026-10-11 and may
  still overturn any of them. A15 is the exception: it is now ruling R10.
- The spec names files in three places only — the *What the product does today* table, the
  provenance of each fact, and the one citation in A9 that the rejection of the pre-filled field
  rests on — following `specs/141-module-block-renderers/spec.md`. The requirements themselves
  name platform concepts (settings, sales channels, the command palette, the audit trail, the
  module activation control) and three public artefacts whose names are the feature
  (`robots.txt`, `llms.txt`, the robots directive); they name no library, table, endpoint or
  file.
- `X-Robots-Tag` is deliberately not named in a requirement: FR-014 says "a response header"
  carrying the directive, and the header's name is the plan's. Likewise FR-041 says the preview
  shows the storefront's own rules and leaves how the Admin UI obtains them to the plan.
