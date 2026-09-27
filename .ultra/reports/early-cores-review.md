All evidence is in. The review is complete — sources, tests, spec, reports, session logs, and independent test reruns are done. As the report is the deliverable, here it is in full.

---

# Independent GLM MAX review — completed pure cores: bomb rules, profile, objective AI

Reviewer: fresh isolated GLM-5.3-Flash MAX session, not the implementer. Date: 2026-09-26. Scope: the three frozen early cores + focused tests + prep reports only. Map/grenade worker files ignored; nothing edited, nothing committed.

## Evidence base (inspected vs independently rerun)

**Inspected (read):** `src/modes/bomb.js`, `src/profile/{rank,equipment,repository,service}.js`, `src/ai/objective-planner.js`, the three test files, `.ultra/specs/desert-grey.md` (Rules/Combat/Profile), the three prep reports, task contexts (`phase-3-bomb-core-early.md`, `phase-7-profile-core-early.md`, `phase-3-objective-ai-early.md`), `.ultra/reports/execution-state.md`, plus support contracts: `src/weapons.js` (catalog source), `src/settings.js` (`loadOpts().primary`), `src/navigation.js` (`findPath` seam), `src/modes/index.js` (tdm only — bomb not registered).

**Independently rerun (my own runs, all green):**
- `node --test tests/unit/bomb-core.test.mjs` → 16 pass / 0 fail
- `node --test tests/unit/profile-core.test.mjs` → 8 pass / 0 fail
- `node --test tests/unit/objective-planner.test.mjs` → 11 pass / 0 fail

**Chronology verified from session logs** (`/private/tmp/cf-desert-grey-run/*.jsonl`, ordered by event line), not taken from the reports on faith — details per core below.

**Not run:** full suite, build, browser, integration. No completeness claims are made about bomb gameplay, rank UI, or AI movement — all three reports correctly scope themselves to un-integrated cores, and nothing in `src/` imports any of the three yet (verified).

## TDD honesty check

- **Bomb core — claim overstated, call it out.** The report says “TDD：先红后绿”， but the log shows exactly one red (`pass 0`, module-not-found) for the whole 16-test batch written in advance, then 16 green (`phase-3-bomb-core-early-retry.jsonl:18696→18717`). This is batch test-after, not strict TDD; `execution-state.md` already flags it. The 16 tests are nonetheless real public-behavior tests and now pass independently — **no rewrite demanded of verified code**; later slices must not repeat this pattern.
- **Profile core — VERIFIED.** Log shows four genuine sequential cycles: red (module-not-found `service.js`, tests 1 fail) → mid-cycle real assertion failure (`actual: 'awm', expected: 'ak47'`, the design slip the report admits) → green 2 → red (`switchPreset is not a function`) → green 3 → red (module-not-found `repository.js`) → green 6 → red (module-not-found `rank.js`) → green 8. Matches the report; satisfies the ≥3-cycles requirement.
- **Objective AI — VERIFIED.** Four slices in the log: red tests 1/0 → green 2/2 → red 4/2 (assertion failures, not module-not-found) → green 4/4 → red 6/4 → green 6/6 → red 11/10 → green 11/11 → refactor re-run 11/11. Matches the report.

## Findings (severity-ranked; fixes authorized through GLM implementer)

### P2-1 — AI planner silently degrades when planted/dropped C4 has no position (cross-core blocker)
`src/ai/objective-planner.js:88` (`c4.state === 'planted' && c4.position`), `:92` (dropped), `:113` (defender planted). **Trigger:** `BombMatch` legitimately emits `pos: null` — `src/modes/bomb.js:102,149,239` take `pos` from optional facts (`this.pos[actor] || null`), and the bomb-core test itself plants with no `pos` in facts. **Impact:** with `position: null` and `state: 'planted'`, attackers skip the guard branch and split to attack sites; defenders skip defuser/cover and anchor at their per-round site — the two most important endgame behaviors silently vanish at integration. **Fix:** in the planner, treat `state === 'planted'` as sufficient and resolve `goal = c4.position || sitePoint(siteOfC4(c4))`; integration must feed `pos` in facts for the carrier at all times (dropped-bomb position genuinely requires it). Add one targeted red test: planted with `site` but no `position` still yields guard/defuse at the site.

### P2-2 — AI planner site/role assignment is array-order-dependent and churns on deaths
`src/ai/objective-planner.js:103-108` (escort/flank split via `others.indexOf(self.id)` on the filtered alive array) and `:122-125` (defender anchor split via `ids.indexOf`, `ceil(n/2)`). **Trigger:** the team array order is the integrator's choice; any reorder or a death shifts indexes (e.g., two primary-side defenders die → a secondary holder's index crosses `ceil(n/2)` and swaps sites mid-round; attacker flank flips to escort). Only the *primary site* is cached per round (`:47-59`), not member assignments. **Impact:** mid-round site swaps and role flips — bot told to hold B starts walking to A — violating the context requirement “回合内不振荡 / keep site assignment stable enough to prevent oscillation”. **Fix:** assign per-member sites once per `(team, round)` from a stable ordering (roster order or sorted-by-id) and cache them alongside `roundAssign`, so deaths/reorders don't reshuffle survivors. Add one red test that shuffles `obs.team` order and one that kills a member mid-round, asserting unchanged site per member.

### P3-1 — `inSite || true` masks malformed facts
`src/modes/bomb.js:237`. Unreachable through the normal flow (a falsy `inSite` would have cancelled the action), but if it ever fires, `plantedSite` becomes boolean `true` and propagates into events/snapshot. Fix: validate the site value (e.g., against a rules-supplied site list) or plant without a site and let integration resolve geometry. Optional before integration.

### P3-2 — Malformed result events are treated as competitive, contradicting the rank.js doc
`src/profile/service.js:66-67` only excludes `mode === 'practice'`; an event with missing/empty `mode` but a `key` awards XP and creates a `stats["undefined"]` bucket, while `src/profile/rank.js:2,34` documents “残缺结果一律 0”. Fix: require a non-empty string `mode` in `applyResult` (recommended before HUD wiring, with one red test — the only test demand beyond the P2 ones).

### P3-3 — `profile` getter exposes the live internal object
`src/profile/service.js:55`. Consumers can mutate `svc.profile.xp` etc.; the mutation won't persist (persist only happens inside service methods), causing silent divergence between memory and storage. Fix: return a frozen shallow copy or `Object.freeze` the profile tree.

### P3-4 — Ledger not re-capped on load; version not gated
`src/profile/service.js:39` restores an oversized/tampered ledger verbatim (cap applies only on the next `applyResult`); `src/profile/repository.js:19` accepts any numeric `v`, so a future v2 record is silently normalized down to v1 instead of being rejected for migration. Both one-line hardening fixes; cheap now, cheap later — not urgent.

### P3-5 — Persistence flag never recovers
`src/profile/service.js:48-51,58`: one transient quota error downgrades the whole session to `'memory'` even though later saves would succeed. Acceptable if documented; a retry-on-next-mutation is the minimal fix if desired.

### Integration contract notes (not defects in the cores)
- Bomb commands are consumed even when inapplicable (`src/modes/bomb.js:77-80,113-123`): a `startPlant` queued during prep is drained and lost, so Game must re-issue hold-type commands while the key is held. Document this in the API contract.
- `dropIfCarrierDead` (`src/modes/bomb.js:88-104`) only works if dead actors keep appearing in `facts.actors` with `pos`; the header comment should mark `pos` (for carrier/death) and continuous actor reporting as **required**, not optional.
- The suggested per-round result keys (`bomb:<matchId>:r<n>`) will make `stats.bomb.matches` count rounds, not matches — decide the semantics before wiring `applyResult`.

### Test-quality assessment
Tests are behavior-focused across all three cores: planner tests derive expectations from the public `MAP` metadata, profile tests validate via `CATALOG.includes`, and the bomb suite asserts public events/snapshots. The `BOMB_DEFAULTS` deep-equal test (`tests/unit/bomb-core.test.mjs:35`) locks constants, but those numbers are spec-mandated, so it is a spec-conformance lock, not implementation mirroring. Beyond the tests tied to P2-1/P2-2 (and optionally P3-2), I demand no additional tests — the current suites are necessary and non-vacuous.

### Architecture assessment (SOLID/SoC/layering)
Sound. `rank`/`equipment` are pure domain; `repository` is guarded infrastructure with injected storage; `service` is the single application seam and imports nothing from settings/game (no cycles — `equipment → weapons.js` is a pure-data leaf). `bomb.js` is a self-contained rules engine (no imports, no clock/random/DOM) with facts-in/commands-in/events-out — a clean hexagonal contract. The planner is pure strategy over permitted observations with movement correctly deferred to the existing `navigation.findPath` seam. The endgame tie arbitration (defuse must be *strictly* earlier than fuse; plant may land exactly at the round deadline) and the single-resolution `endRound` guard are correct and match the spec's “临界同帧只结算一次，平时刻爆炸优先”.

## Verdicts

| Core | Verdict | Conditions |
|---|---|---|
| Bomb rules core (`src/modes/bomb.js` + test) | **APPROVE** | P3-1 optional; contract notes must reach the integrator |
| Profile core (`src/profile/*` + test) | **APPROVE** | P3-2 recommended before HUD wiring; P3-3..5 opportunistic |
| Objective AI core (`src/ai/objective-planner.js` + test) | **REQUEST_CHANGES** | Fix P2-1 and P2-2 with targeted red→green tests before stage3 integration |
| **Overall early-core gate** | **REQUEST_CHANGES** | Passes once the two P2 AI findings are fixed; bomb/profile cleared for integration planning |

The gate is blocked solely by the AI planner: both P2 findings are concrete pre-integration risks (silent endgame degradation; spec-required stability violated), each with a small, localized fix. Everything else — including the TDD chronology for profile and AI — checks out against the logs, and the bomb core's batch-red history is acknowledged honestly without demanding a rewrite.
