# Phase 1 targeted fix round 2

You are GLM-5.3-Flash implementer. Resume your prior phase1 implementation. Read .ultra/reports/phase-1-rereview-1.md. Five findings closed, only storage PROPERTY GETTER SecurityError remains. User changed subsequent independent reviews to GLM MAX in fresh contexts; do not invoke reviewers yourself.

Fix only this remaining defect and its direct validation. Guard acquisition of window.localStorage itself, including load/save and any other production direct property accesses. Existing safeGet only guards methods and does not address argument evaluation before loadOpts/saveOpts. Use a safe storage provider or equivalent small robust design. Do not expand into later phases.

Add meaningful unit test and targeted real-browser startup fixture that defines a throwing window.localStorage getter before page code, verifies menu, clicks Start and verifies playable state without page exceptions. Existing method-throwing test must remain. Rebuild final HTML, run unit tests and TARGETED browser fixture; avoid rerunning all expensive browser scenarios unchanged. Make target selection available if useful. Existing 20/20 evidence remains prior evidence, label new targeted results separately and don't overwrite passing full-run evidence with a partial total. Do not fabricate pointer-lock tests. Preserve user source outside this fix.

Report .ultra/reports/phase-1-fix-2.md with exact changed files, commands/results and evidence paths. Stop after fix and validation; coordinator dispatches independent review. You may use read/write/edit and node/npm/Chrome as in previous run. No Codex, no subagents, no push/deploy/global settings changes.
