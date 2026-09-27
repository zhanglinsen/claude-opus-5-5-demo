# Targeted objective AI fixes after independent GLM MAX review

You are original GLM-5.3-Flash objective planner implementer resuming your session. Read `.ultra/reports/early-cores-review.md`. Fix **P2-1** and **P2-2** only within your owned `src/ai/objective-planner.js`, `tests/unit/objective-planner.test.mjs`, plus `.ultra/reports/early-ai-fix.md`. No game/bots/map/physics/bomb/profile/grenade edits, no other model/delegation, no broad suite/build/browser.

P2-1: planted C4 with site but no explicit position must still make BL guard and nearest GR defuse at the site. Dropped bomb with no position should fail honestly or fall back only if team-known site/position exists; no omniscient invented coordinates. Add one targeted public behavior RED assertion before fix, then green.

P2-2: per-member site/role assignment must stay stable within a round when `obs.team` array is reordered or a teammate dies. Use stable identity/roster order and cache full assignment per (team, round), not filtered alive array indices. Do not create mid-round oscillation or ignore new round reset. Add targeted RED tests for reorder/death, green after fix. Refactor while green, keep changes small.

Report commands/results, changed files, API implications, and no extra tests in `.ultra/reports/early-ai-fix.md`. Stop after fixing. Coordinator runs focused independent GLM MAX rereview. Additional P3 findings are nonblocking and should not distract this task.
