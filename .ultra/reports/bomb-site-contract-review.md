**APPROVE**

All three verification channels agree, and I found no remaining defect in the targeted change.

**Fix correctness (source).** The `isSite` predicate (`typeof v === 'string' && v.length > 0`) replaces every former truthy check — no truthy `inSite` usage remains in the file:
- `startPlant` guard `cf-transport-ship/src/modes/bomb.js:125` and `startDefuse` guard `bomb.js:140` — boolean `true`/empty string now rejected before any `plantStarted`/`defuseStarted`.
- `actionInvalidReason` `bomb.js:236` — an in-progress action losing a valid site cancels with `leftSite` (kind-agnostic, so the defuse path gets `defuseCancelled leftSite` through the same already-tested `progressAction` code path).
- `plantAt` defensive fallback `bomb.js:243-247` — unreachable in normal flow (`progressAction` cancels first in the same frame, so facts can't change between the check and the plant), and if ever hit it emits `plantCancelled leftSite` without touching bomb/phase state.
- `plantable`/`defusable` `bomb.js:299,305` — hints now agree with the command gates.
- `plantedSite`/`bomb.site` are only assigned from an `isSite`-passed value (`bomb.js:249-250`), so boolean `true` can never propagate into `bombPlanted`, `bombExploded`, or `snapshot().bomb`. Header contract doc updated (`bomb.js:6-8`).

**Behavior preservation.** The diff touches only the site predicate — `advance` timing, the strictly-earlier defuse vs. fuse tie rule, and all constants are byte-identical to the previously approved core. All 16 pre-existing boundary tests pass unchanged; my own independent run of `node --test cf-transport-ship/tests/unit/bomb-core.test.mjs` gives **18 pass / 0 fail**.

**Strict RED chronology (verified from raw log, not the report).** In `/private/tmp/cf-desert-grey-run/bomb-site-contract-fix.jsonl`: the test-file Edit lands at line 2563; the RED run (lines 2565–2570, timestamp 15:39:13Z) shows exactly the 2 new contract tests ✖ and the other 16 ✔; the seven source Edits, all to `bomb.js` (including the literal `inSite || true` and `!f.inSite` old_strings), land at lines 2685–2697; the GREEN 18/18 run is at lines 2699–2700 (15:39:51Z); the report is written last at line 2749. This is genuine red→green, unlike the batch pattern flagged in the earlier review.

**Scope discipline.** Nothing in `src/` imports `modes/bomb.js` yet — stage3 integration is indeed still pending, and the report correctly self-scopes. The two new tests are targeted; the untested defuse-side `leftSite` cancel shares the exact code path tested for plant, so I demand no additional tests. Accepting any non-empty string as a site ID (e.g. `'C'`, `' '`) is an explicitly documented integrator responsibility (`bomb.js:8`, report), not a defect in this change.