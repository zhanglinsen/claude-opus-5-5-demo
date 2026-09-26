# Task 2: 沙漠灰白模、碰撞和导航

Status source: ../tasks.json task 2.

## Context
Read .ultra/specs/desert-grey.md in full. User authorized implementation and sequential automated phase gates. This is phase 2 of 6. You are GLM-5.3-Flash, the IMPLEMENTER. All source/test changes must be made by you; do not invoke other models or agents. Do not invoke Astra, Codex, or delegate. User's role restrictions take precedence over any skill recommendations. No push/deploy/global config changes. Work only in cf-transport-ship, its README/provenance docs, and task evidence. Do not edit .ultra/specs or task scope/status. Use existing code as reference; inspect before editing. Avoid exposing credentials.

## Implementation
Implement full Desert Grey playable layout from same-version references, all required landmarks, multi-height geometry and ramps, shared physics/nav adapters, real route connectivity and map selection. Existing ship remains playable. Add independent landmark/route and collision tests, browser overview and per-landmark screenshots. Ensure geometry is enclosed/plausible and not an empty plane with scattered cover. Bomb UI/mode defaults become enabled only after phase 3; make desert TDM/practice playable now. Do not implement later bomb/combat/polish work.
Keep source small and modular. Do not prematurely implement future phases. Use real browser tests with installed Chrome at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome and playwright-core where available, CLI npm/node is authorized. Fix necessary bugs revealed within scope. You have read/write/Bash tools and permission to install project's declared npm dependencies. At most one implementation process edits this tree. Evidence files go under cf-transport-ship/artifacts (gitignored), textual report in .ultra/reports/phase-2-implementation.md. Tests must prove user-visible behavior, not duplicate constants. No tests may silently skip required acceptance and report success.

## Acceptance
- Layout planning convention: +X is east/right (A side), -X is west/left (B side), -Z is north (GR/A/B end), +Z is south (BL end). Record the overhead reference orientation and estimated scale before construction. Separate structural solids, playable floor surfaces, visual decoration, and off-map bounds. A platform and its lower connection/bridge region, and upper/lower B tunnels, must be real separate elevations with valid transitions.
- Do not keep transport-ship's AI mirroring assumption: Desert Grey teams have asymmetric spawns/routes. Define per-team goals and map-based path selection. Every path point needs elevation so overlapping XZ floors cannot mix.
- Existing phase-1 settings/map interfaces are the integration contract; extend them for map-specific environment/height/navigation rather than bypassing them with game.js map-id conditionals everywhere. Read .ultra/reports/environment-note.md to avoid repeating dependency troubleshooting.
- Implement the phase scope above and check its actual browser integration.
- Run npm build and targeted tests inside cf-transport-ship; record exact commands and results.
- Preserve transport-ship functionality with minimum smoke regression.
- Provide changed files, limitations, screenshot paths and objective evidence for independent Sol review.

## Trace
Source: .ultra/specs/desert-grey.md#map

## Completion
To be supplied by implementer report. Do not claim unrun validation.

## User workflow update — 2026-09-26

User has changed reviewer allocation to conserve Codex quota. Complete the currently running phase-1 Sol rereview (same thread resumed after brief interruption). All SUBSEQUENT independent reviews/rereviews use fresh GLM-5.3-Flash CLI sessions with --effort max instead of Sol. Implementer remains GLM-5.3-Flash (--effort high unless user changes it); Astra only planning/orchestration. All work remains CLI dispatched. Independent read-only review domains may run concurrently against frozen source; implementation of dependent stages stays sequential and only one product writer at a time unless explicit disjoint-file ownership is planned. No self-review: reviewer must use fresh isolated context. Existing historical Sol reports remain valid evidence. This update supersedes old Sol-only language below/above.

## Latest user testing constraint — necessary tests only

User explicitly requests reducing excessive testing. Keep meaningful build, critical gameplay/rules/navigation checks, actual user startup, and targeted regression for changed behavior. Do not rerun an unchanged full suite, duplicate assertions, add implementation-mirroring tests, or broaden audits without a concrete remaining risk. Prefer a targeted case and stop once the relevant risk is resolved. Preserve required final acceptance (20 seeded bomb rounds, >=600 seconds actual rendering, dual-map HTTP/file workflows); run these once on the final candidate and repeat only affected evidence after fixes. Tests must remain honest and non-vacuous.
