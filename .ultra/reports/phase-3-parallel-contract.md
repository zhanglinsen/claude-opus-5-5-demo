# Phase 3 parallel implementation contract (Astra orchestration)

Start only after phase 2 is independently approved and checkpointed. All product edits are made by GLM-5.3-Flash HIGH through CLI; no nested agents. Fresh GLM MAX reviews follow when all writers stop. The current pure `BombMatch` and objective planner are inputs, not evidence of playable bomb mode.

## Shared runtime contract

- `Game.bomb` is a `BombMatch` only during bomb mode; otherwise `null`. `Game.objectiveCommand(type, actorId, pos?)` queues a validated command for the current bomb mode. `Game.objectiveView(actorId?)` returns a serializable snapshot plus `plantable`, `defusable`, `pickupable`, and site/proximity hints; otherwise `null`. UI and bot workers use these methods and must not access private `BombMatch` fields.
- `Game` supplies `HUD.update` an `objective` field from that same view. UI worker renders it without calculating rule outcomes. AI worker builds observations only from sight, sound, public C4 state, own team and timed last-known enemy positions; it uses the shared 3D navigator for actual movement. No direct hidden enemy coordinates.
- Player's virtual slot 5 is C4 only when the player actually carries it. `player.c4Selected` is a runtime input state. Planting is held left mouse; release, movement, damage or leaving site interrupts by `BombMatch` facts/commands. `E` favors defuse over pickup; `G` drops current gun or C4. Bot C4 commands use the same `objectiveCommand` path.
- All round time and results originate from the pure rule engine. Pausing omits simulation updates. Reset creates a new controller/roster, discards prior timers and event handlers, and records each critical result once. Competitive result events later feed ProfileService; do not inline XP math in Game.
- Integration edge found after dispatch: `Game` gives the player numeric id `0`, while current `BombMatch` uses falsy ID checks in carrier/facts/drop paths (`bomb.js:73,97,106`). RULES lane must either use a stable nonfalsy string ID adapter for every roster/fact/command/snapshot boundary or report the need for a narrow BombMatch fix. Do not silently make the player unable to carry C4. A focused player-id-0 behavior must turn red before the fix and green after it.

## Exclusive file ownership while parallel

| Lane | Files | Deliverable |
|---|---|---|
| RULES / runtime coordinator | `src/game.js`, `src/modes/index.js`, new `src/modes/bomb-session.js` (or equivalent), `src/maps/registry.js`, `tests/unit/bomb-runtime.test.mjs`, `scripts/e2e-bomb.mjs`, own report | Default Desert bomb, 5v5 first 7, lifecycle, facts/commands, C4 world representation, scoring/round reset/pause/restart, deterministic test hooks and focused browser acceptance. Keep rule decisions out of Game where the mode controller can own them. |
| AI | `src/bots.js`, `tests/unit/bomb-bot.test.mjs`, own report | Wire approved objective planner to real bot movement/sight/sound and public C4. Distinct carrier/retriever/planter/guard/defuser/recovery behavior, stuck replan. No omniscience or teleport. |
| INPUT / HUD | `src/player.js`, `src/hud.js`, `src/touch.js`, `src/viewmodel.js`, `src/guns.js`, CSS/HTML source under `src/` if needed, `tests/unit/bomb-input.test.mjs`, own report | Slot 5, hold-to-plant, E/G behavior, spectating teammate, loadout timing UI, round/score/alive/C4 HUD and touch target action. Only call the shared Game methods above. |

Nobody edits another lane's files or shared tests. New test/report names must be unique. If the runtime contract proves inadequate, stop and report the exact need to coordinator; do not silently create a second API. Never commit/push from workers.

## TDD and merge gate

For each new behavior slice, show a failing public behavior test **before** its source change, then minimal green, then refactor while green. A missing-module error for a batch of later assertions is insufficient. Keep tests few and meaningful: C4 boundary transitions, one real AI objective route, one user input interaction; add another only for an identified defect. After all lanes finish, RULES lane alone performs integration, build and necessary browser checks; route any lane-specific defects back to that lane. Two fresh GLM MAX reviewers inspect rules/C4 and AI/UI architecture respectively. Confirmed defects go to original lane and receive independent targeted rereview.
