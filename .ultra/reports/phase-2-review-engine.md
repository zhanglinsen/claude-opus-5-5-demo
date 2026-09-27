All verification is complete. Here is my final review report.

---

# Independent GLM MAX Review — Phase 2 Movement / Integration Domain (desert-grey)

**Verdict: APPROVE**

Baseline c935ace. Scope: movement/navigation/game integration and ship regression (map authenticity/topology excluded — covered by the parallel reviewer). No files were written; no builds or browser suites were rerun.

## TL;DR

The ramp physics, height-aware navigation, and integration seams are real and correct. I independently reproduced the load-bearing claims: all 50 spawn→team-goal paths resolve against the real collision world (max 23 ms), the wedge ray-caster agrees with brute-force point classification on 800/800 random rays, actors walk the real pit ramps glued to the surface in both directions with no tunneling or false support, stacked floors separate correctly by `maxY`, and the ship path is bit-for-bit preserved by explicit defaults. All findings are Low/informational; none block the phase gate.

## What I verified (and how)

**Ramp collision/support/rays (`src/physics.js`).**
- `Ramp` (`physics.js:31-96`): top-plane math (`planeA/planeB`), `topAt` clamping, and the local-axis transforms in `rayWedge` (u/v basis for both `axis: 'x'|'z'`) are algebraically correct, including the convex half-space clipping (parallel-plane reject, start-inside `t=0`, normalized slope normal).
- I cross-validated `raycastAll` against an independent brute-force point-classification march for 800 random rays across both real pit ramps: **800/800 consistent** entry points. Above-wedge rays pass (no bounding-box blockage), wedge-interior starts report `t=0`.
- `World.support` (`physics.js:291-308`) honors `maxY` for ramps — probed at the real B-tunnel stack: `maxY=1 → y=0`, `maxY=3 → y=2.6`, so upper floors cannot give false support to lower actors.
- `World.move` ramp branch (`physics.js:329-342`): step-up-vs-push-out mirrors the box branch; `blocked()` (`physics.js:273-288`) treats the wedge as true occupancy so standing on the slope doesn't self-block. Physical probes on the real layout geometry: pit→ground and ground→pit walks stay glued (frame-traced y follows the 0.45 slope exactly, never airborne), lateral exit at the ramp's low end works, a gravity drop lands exactly on the ramp surface (`y=-1.35` at `z=7.00` = analytic surf height), and jumping into the pit lands on the floor without wedge tunneling.

**Navigation (`src/navigation.js`).**
- `straightWalk` (`navigation.js:78-105`) validates edges against the *real* world (`support` + `blocked` with climb/drop/gap tolerances aligned to `Actor.stepHeight` 0.42); the clearance window foot+0.5 → foot+1.8 fully covers the 1.75 m standing height. Cross-layer fake edges, wall-crossing edges, and endpoint layer mixing are all rejected (fixture tests + my probes agree).
- Endpoints snap to genuinely standable surfaces with honest `[]` failure — no teleport fallback. Ship adapter (`createGridNav`, `navigation.js:275-292`) preserves NavGrid `y=0` semantics and the legacy `NavGrid` signature is pinned by test.
- With the bot's real agent profile (`radius 0.36` — matches `Actor` at `actor.js:13`), **all 20 spawns × own-team goals path successfully (50/50)**, cross-team paths resolve, and warm `findPath` latency peaks at 23 ms — safe for per-think replanning.

**Bots (`src/bots.js`).**
- All movement goes through `Actor.move → World.move`; path points are consumed as horizontal wish directions only (`bots.js:286-298`) — there is no code path that sets position or y directly, so "no teleporting to goal heights" holds structurally. `requires: 'crouch'/'jump'` consumption (`bots.js:293-294`) matches the documented incoming-edge semantics.
- Asymmetric goals come from map data: `pickGraphNode` uses `map.teamGoals` (present on the built map, `desert-grey.js:204`) with flank-deepening and hold-facing toward enemy goal nodes; hold arrival additionally requires `|Δy| < 2` (`bots.js:195`). Ship keeps the mirror-AI branch via `mapDesc.ai`; maps with neither fall back to bounds roaming. Stuck detection → `pickGoal` replan retained (`bots.js:216-224`).

**Game integration (`src/game.js`, `src/actor.js`, `src/env.js`, `src/maps/*`).**
- `createNavigation(world, mapDesc, map)` replaces the direct `NavGrid` construct (`game.js:66-70`); `navNodes` index built from `map.navGraph`. No map-id conditionals were added outside the builder table — the contract's "extend interfaces, don't bypass" is honored.
- Target-only environment init is correct: desert `env.ocean:false` → `Environment` never creates the ocean (`env.js:216-217`, update guarded), `ambientKey:null` → `fx.initAmbient` never called (`game.js:71-74`); ship gets explicit `shadowBox` in the registry so its shadow volume and funnel smoke are preserved exactly, while land maps derive `shadowBox` from bounds. Sun/fog/ground-color overrides default to original ship values.
- Selection priority verified: `resolveMapId` URL > stored > `NEW_PLAYER_DEFAULT_MAP` (`registry.js:104-109`); legacy `cf_ship_opts` migration pins transport-ship (`settings.js:58-65`); new players get desert-grey. `inSpawnZone` axis-z matches the actual spawn z-ranges; registry bounds (±44/±38) equal layout bounds; spawnActor filters by them.
- Radar/menu/loadout/spawns: `buildRadar` consumes the generic collider fields (Ramp provides them; pit ramps are correctly filtered out by `top > 0.3`), desert radar extents/offsets cover the bounds, TDM labels render (`defaultMode:'tdm'`, `getMode` falls back safely). The frozen phase-3+ modules (`modes/bomb.js`, `src/ai/`, `src/combat/`, `src/profile/`) are **not imported by the runtime** — correct staging, no premature wiring.

**Tests and evidence.**
- I ran the three movement-domain suites myself: `height-navigation` **10/10**, `desert-layout` **14/14**, `registry` **8/8** — all pass. The tests are genuine behavior tests (real `World` fixtures, physical walkers, route reachability), not constant-mirroring tautologies.
- Recorded browser artifacts inspected (not rerun): `e2e-desert-results.json` 34/34 and `e2e-results.json` 21/21, both dated today with zero page/console errors, internally consistent with the reports (route legs with region traces, 0 rejected /124 edges, 97/97 reachable, 11/11 bots moved in-bounds). Screenshots confirm a real enclosed town layout with a 2.6 m A-platform and covered underpass/lower-tunnel geometry, region label in the radar, **no ocean/smoke in desert**, and an intact ship scene (`ship-smoke.png`).

## Findings

**F1 — Low, latent.** `resolveEndpoint` second fallback can snap an endpoint *up* to 2 m (`navigation.js:147-148` accepts `sup.y` up to `p.y + 2.0`; only the downward difference is checked). Trigger: a bot transiently airborne (y > 0.6) hugging a 1.1–1.4 m crate gets its start resolved onto the crate-top layer; floor nodes are then unreachable under walk drop limits, so that think tick (~0.13 s) gets `[]`. Self-heals on landing (first branch ±0.6/±1.0 then resolves the true floor). Not observed as a stuck loop in the recorded 12 s bot run. If fixed: add a node test that a start at `y:0.7` beside a 1.2 m crate still paths, or bound branch two to `sup.y <= p.y + 1.0`.

**F2 — Low, API wart.** Graph `randomFree` returns a raw, unvalidated node after 10 failed attempts (`navigation.js:256-257`), contradicting the module's documented "无可站位置返回 null". Currently unreachable from production call sites (bots only call `randomFree` on the legacy-AI branch). Return `null` for consistency.

**F3 — Info.** `e2e-desert.mjs:184` no-teleport bounds (≤0.35 m/frame horizontal) are ~3.7× the physical maximum (5.7 m/s ÷ 60 = 0.095 m; measured 0.096). Tightening to ≤0.12 would make the assertion sharper; the vertical 0.55 vs measured 0.26 (one 10-step riser) is similarly loose but acceptable given the conjunction with reach + region checks.

**F4 — Info.** `e2e.mjs:176-179`: the `?map=nonsense` fallback assertion tolerates either map while the actual contract yields desert-grey (no stored settings → `NEW_PLAYER_DEFAULT_MAP`); the case label says "first available map". Unit tests pin the precise semantics; tighten when convenient.

**F5 — Info, debt.** (a) The ramp branch duplicates the box step-up/push-out tail (`physics.js:335-342` vs `348-354`) and `isRamp` flag-dispatch spans five `World` methods — the OCP pressure point for the next collider shape; worth extracting in a later touched-slice refactor, not now. (b) The wedge *visual* builder ignores `r.yaw` (`desert-grey.js:73-102`) while physics `Ramp` supports it — all current ramps are `yaw:0`, so there is no live mismatch, but add an assertion or yaw support before anyone rotates a ramp.

**F6 — Info.** Desert `supportedModes` advertises `bomb`/`practice` while `modes/index.js` implements only `tdm`. Inert today (no consumer, `defaultMode:'tdm'`); ensure phase 3 wires real adapters rather than advertising ahead.

**F7 — Nit.** `phase-2-implementation.md` records `dist/index.html 880.6 KB`; the on-disk file is 901,798 bytes, mtime 23:37 — i.e. a rebuild after the report's number, before the 23:38-39 evidence capture. Consistent with a final rebuild, no functional impact; reporting nit only.

**F8 — Nit.** README structure block garbled: `navigation.js` was appended onto the `physics.js` line (`README.md:39`) instead of its own line.

## Architecture / SOLID / TDD assessment

The seams are cohesive and coupled through explicit data contracts: pure-data layout (node-testable, no three/DOM) → builder → registry metadata → `createNavigation` strategy seam (graph/grid/none) consumed through one interface by game and bots → env configured by data with ship-preserving defaults. I found no hidden map-id branching, no import cycles, and no duplicated gameplay state across layers. Remaining debt is modest and named above (F5a dispatch duplication, F5b visual yaw gap, the transitional waypoint-shape shims `wp()/goalXZ()/goal3D()` in `bots.js:47-53`, and the dual `map.teamGoals || mapDesc.teamGoals` source). On TDD: the stage-2 modules predate the strict-TDD instruction, and the spec explicitly says not to claim retroactive test-first — I neither certify nor demand that. What exists is meaningful: the map-route-fix round shows a genuine red (11 pass / 3 fail with real-geometry failure messages) → data-layer fix → green 14/14, and the bSite camera defect was fixed with ray-verified evidence plus a targeted rerun. Later slices must show real vertical red→green→refactor; a batch of module-not-found reds will not count.

## Commands actually run

- `node --test tests/unit/height-navigation.test.mjs` → 10 pass / 0 fail
- `node --test tests/unit/desert-layout.test.mjs` → 14 pass / 0 fail
- `node --test tests/unit/registry.test.mjs` → 8 pass / 0 fail
- Two in-memory `node --input-type=module` probes (no file writes): (1) all-spawn→goal pathing, cross-team paths, wedge-ray vs brute-force march; (2) physical walkers on the real pit ramps, stacked-floor `support` separation, underpass/upper-tunnel walks, drop/jump landing — including one instrumentation rerun that disproved my initial "descent failure" (the walker had already crossed the pit and exited the far ramp; the traced descent was perfectly glued).
- `git status/diff` inspection; reads of the reports, contract, source, tests, e2e scripts, both artifact JSONs, and six screenshots.

## Limitations

- I did not run `npm test` (full), `npm run build`, `test:e2e`, or `test:e2e:desert` — browser suites and builds were excluded by the review constraints; recorded artifacts (fresh, internally consistent) plus my node probes stand in.
- The `Bot` class was not executed headlessly (needs the DOM/three/game harness); bot physics behavior rests on code reading plus the recorded bot-activity evidence and my physics walker probes.
- Map authenticity/topology versus the original reference, and long-run acceptance (≥600 s rendering, 20 seeded bomb rounds, phase 6) are explicitly out of scope here.

**Recommendation:** approve phase 2 as the movement/integration gate. F1/F2 are cheap hardening candidates for the next fix worker; F3-F8 can ride along with later touched files.