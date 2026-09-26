# Task 4: 战斗完善、投掷物与练习模式

Status source: ../tasks.json task 4.

## Context
Read .ultra/specs/desert-grey.md in full. User authorized implementation and sequential automated phase gates. This is phase 4 of 6. You are GLM-5.3-Flash, the IMPLEMENTER. All source/test changes must be made by you; do not invoke other models or agents. Do not invoke Astra, Codex, or delegate. User's role restrictions take precedence over any skill recommendations. No push/deploy/global config changes. Work only in cf-transport-ship, its README/provenance docs, and task evidence. Do not edit .ultra/specs or task scope/status. Use existing code as reference; inspect before editing. Avoid exposing credentials.

## Implementation
Complete shared HE/flash/smoke with geometry/AI occlusion, weapon drop/pickup and slot cycles, classic controls, TDM modes and static-target free practice on both maps. Verify existing weapons/reload/scope/armor/penetration and modes boundary. Add meaningful tests and real browser workflows.
Keep source small and modular. Do not prematurely implement future phases. Use real browser tests with installed Chrome at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome and playwright-core where available, CLI npm/node is authorized. Fix necessary bugs revealed within scope. You have read/write/Bash tools and permission to install project's declared npm dependencies. At most one implementation process edits this tree. Evidence files go under cf-transport-ship/artifacts (gitignored), textual report in .ultra/reports/phase-4-implementation.md. Tests must prove user-visible behavior, not duplicate constants. No tests may silently skip required acceptance and report success.

## Acceptance
- Implement the phase scope above and check its actual browser integration.
- Run npm build and targeted tests inside cf-transport-ship; record exact commands and results.
- Preserve transport-ship functionality with minimum smoke regression.
- Provide changed files, limitations, screenshot paths and objective evidence for independent Sol review.

## Trace
Source: .ultra/specs/desert-grey.md#combat

## Completion
To be supplied by implementer report. Do not claim unrun validation.


## User workflow update — 2026-09-26

User has changed reviewer allocation to conserve Codex quota. Complete the currently running phase-1 Sol rereview (same thread resumed after brief interruption). All SUBSEQUENT independent reviews/rereviews use fresh GLM-5.3-Flash CLI sessions with --effort max instead of Sol. Implementer remains GLM-5.3-Flash (--effort high unless user changes it); Astra only planning/orchestration. All work remains CLI dispatched. Independent read-only review domains may run concurrently against frozen source; implementation of dependent stages stays sequential and only one product writer at a time unless explicit disjoint-file ownership is planned. No self-review: reviewer must use fresh isolated context. Existing historical Sol reports remain valid evidence. This update supersedes old Sol-only language below/above.

## Latest user testing constraint — necessary tests only

User explicitly requests reducing excessive testing. Keep meaningful build, critical gameplay/rules/navigation checks, actual user startup, and targeted regression for changed behavior. Do not rerun an unchanged full suite, duplicate assertions, add implementation-mirroring tests, or broaden audits without a concrete remaining risk. Prefer a targeted case and stop once the relevant risk is resolved. Preserve required final acceptance (20 seeded bomb rounds, >=600 seconds actual rendering, dual-map HTTP/file workflows); run these once on the final candidate and repeat only affected evidence after fixes. Tests must remain honest and non-vacuous.
