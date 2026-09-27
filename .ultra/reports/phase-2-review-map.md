All evidence is in. The registry metadata is consistent with the layout (radar overlays use corner semantics matching real extents; bounds match). I have everything needed for the verdict — writing the final report.

---

# Independent GLM MAX review — Phase 2 map/layout domain (desert-grey)

## Verdict: **APPROVE**

Phase-2 playable whitebox scope is met: all required landmarks exist as real, coherent geometry (not labels), the classic attack/retake topology is present and physically traversable, height-separated spaces genuinely coexist with working transitions, and the evidence chain is honest and current. Findings below are non-blocking (P3); no fixes are required for this gate.

## Scope and method (evidence inspected)

- Reports/spec/contract: `.ultra/reports/phase-2-map.md`, `.ultra/reports/phase-2-map-route-fix.md`, `.ultra/specs/desert-grey.md`, `.ultra/tasks/contexts/phase-2-parallel-contract.md`, `.ultra/tasks/contexts/phase-2-map-prompt.md`, `.ultra/reports/execution-state.md` (lines 68–73 for workflow state).
- Source read in full: `cf-transport-ship/src/maps/desert-grey-layout.js` (379 lines), `src/maps/desert-grey.js`, `src/navigation.js`, `scripts/e2e-desert.mjs`, `tests/unit/desert-layout.test.mjs`; targeted reads of `src/physics.js` (Ramp/World.support/blocked/move), `src/game.js` regionAt, `src/actor.js` yaw, `src/maps/registry.js`.
- Evidence artifacts: `artifacts/e2e-desert-results.json` (23:39:31 run, 34/34, 0 console/page errors), 13 `desert-*.png` screenshots (23:38–23:39), reference images `artifacts/dg-ref/overhead.jpg`, `fp.png`, `map3.png`.
- Read-only verification probes I ran myself (no writes, no builds): (1) in-process `World.move` walks of routes the e2e did not cover; (2) collision probes of the bridge gap, mid-door seam, and B-window sill; (3) data counts. I did not rerun test suites, per the necessary-tests constraint.

## Evidence currency (checked, not assumed)

The layout was edited at 23:37:45 — after the earlier 23:28 e2e. Per `execution-state.md:73` this was the integrator adjusting **screenshot camera metadata only** (`landmarkViews`; the file now has 19 views vs the 17 the test requires). `dist/index.html` was rebuilt 23:37:56 and the desert e2e **re-ran at 23:39:31 on the current source: 34/34 pass**. Current source counts (97 nodes / 124 edges / 26 regions / 10+10 spawns / 139 solids) exactly match the fresh run's details. All screenshots I viewed are from the 23:38–23:39 run and clearly show the new build (sand whitebox, A/B site decals, desert HUD, radar overlays; `ship-smoke.png` is separate). My analysis is of the current file, so the frozen-source caveat is closed.

## Topology vs reference — verified

All 17 required landmarks exist as regions with geometry and nav nodes (`desert-grey-layout.js:193-220`, unique ids asserted in tests), and the arrangement matches the reference overhead (A north-east, B west, mid center with doors, BL south / GR north, asymmetric spawns ~70m apart):

- **A long / pit / door**: east street x[24,34] walled west (`aLongWallW`), 1.6m ledge strip bypassing the pit (wall face 24.2 → pit wall face 25.8), pit x[26,34] z[-6,10] floor −1.8 with two contract ramps (`pitRampS/N`) — the e2e BL→A leg physically walked blSpawn→aLongEnt→aLong→aPit→aDoor→aSite→aPlatform (110.9m, ended y=2.60).
- **A short / stairs / ledge / platform**: mid east stairs x[6,10] (10×0.26m steps) → catwalk x[10,26] top 2.6 with south parapet → lintel opening at x=26 → ledge x[26,32] → down-stairs to A site → platform south stairs. Top steps of all five staircases sit flush at y=2.60 against their decks (verified numerically and by walked legs).
- **Mid / mid doors**: 1.4m center seam between door panels is genuinely passable — collision probe: `blocked(0,0.1,-24,r=0.36)=false`, panels block at ±1.7. GR→中门北 leg walked it.
- **Underpass / bridge**: ceiling is continuous at y=2.3 across x[-38,-6] (`upRoofE` + bridge slab `upFloor` + `lowRoof`), i.e., the B-upper-tunnel deck truly bridges a passable underpass; BL→B leg walked mid→underpass→bTunnelLower→bSite (97.8m).
- **B upper/lower, doors, window, site**: upper (2.6) and lower (0) tunnels share the x=−32 wall with the intentional z[2,6] opening **at underpass level only** — I probed `blocked(-32, 2.7…4.2, z=4)=true` because `lowRoofMass` (y2.6–5.5) seals the upper level; the suspected "walkable roof leak" from the wall-gap fix does **not** exist. B window: two openings sill 3.6 / head 4.8 (probe: blocked below sill, clear inside opening, blocked above) — a real vantage, not a walk-through. B door z[-35,-32] with the stairs pulled back to z=−32.2 leaves the documented ≥1.9m yard strip (`bd1`/`bc1` walked by GR legs).
- **Layering**: true same-XZ stacking exists (bridge deck over underpass; platform/window-room slabs over ground; pit below grade), asserted by test and confirmed by walked upper-level arrivals at y=2.60 with maxUp=0.26/frame (one stair step — no teleports; `maxStep` 0.095 ≈ 5.7m/s ÷ 60Hz).

## Route evidence — physically walked vs graph-level (distinguished)

The e2e harness is honest: legs are stepped through real `World.move` (radius 0.36 / height 1.8 — identical to `actor.js`), with per-frame displacement caps and a reach criterion at the goal; screenshots are declared camera teleports. Eight legs physically walked: BL→A (via A long/pit/door), BL→B (via underpass/lower), GR→A连接/中门北/B连接, GR retakes→A平台/B窗/B下层. Edge-level acceptance uses real geometry sampling (`navigation.js:78-105` — `world.support` every 0.3m with climb/drop tolerances + `world.blocked` headroom), not graph theory alone; 124/124 edges accepted, 97/97 nodes reachable.

Two documented BL attack routes had no physically-walked leg, so I walked them myself in-process (same World.move method): **mid→A小道→catwalk→ledge→A平台包点** (79.4m, reached, end y=2.60, maxStep 0.095/maxUp 0.260) and **BL spawn→后花园→B上层楼梯→B洞上层→B窗** (82.0m, reached, end y=2.60) — both physically traversable. (Two `canTraverse` rejections in my probe were my own chain typos — those direct edges don't exist in the graph; the real graph paths walk.)

## Non-blocking findings (P3, for GLM fixes backlog — no gate impact)

1. **Region callout inversion on the bridge deck** — `desert-grey-layout.js:206-207`: `underpass` (y-band 0–2.6, index 12) precedes `bTunnelUpper` (index 13) while `regionAt` (`game.js:107-118`) uses a generous +2.6 y-tolerance, so a player standing on the bridge deck (x[-32,-26] z[2,6]) is announced 桥下 instead of B洞上层. 6×4m patch, cosmetic. Fix: order the specific region first or tighten the y band.
2. **B window is vantage-only** — sill 1.0m above the room floor with a 1.2m-tall opening blocks walking agents (probe-verified) and no jump edge exists, so the classic drop from B窗 into B区 is not a route. The map report documents 架点-only honestly; if reference-faithful window-drop behavior is wanted, add it in a later phase (lower sill or a `requires:'jump'` edge). Flagged as an interpretation, not a current-scope defect.
3. **Cosmetic leg-detail artifacts** — `GR→中门北` shows `区域=` and `GR→B连接` shows only `grSpawn` because region labels come from path nodeIds and `findPath`'s direct-shortcut paths carry none; the reach criterion itself was physically verified. Including the endpoint's resolved region in the detail would make future evidence self-explanatory.
4. **Minor doc drift** — `phase-2-map.md` says solids(140); current layout has 139 (post-fix state). Trivial.
5. **bSite landmark camera framing** — `desert-landmark-bSite.png` shows mostly a wall corner; the site is better evidenced by the aerial `desert-overview.png` and data. Polish-phase camera tweak.

## Unverified concerns (labeled, no action required now)

- **Proportions**: 88×76m is a compressed whitebox estimate (documented in `meta.scaleNote`, no false precision). Reference-overhead aspect ≈1.24 vs build ≈1.16; A-long:mid length ratio ~1.3 in build vs ~1.5+ visually in the reference — within acknowledged estimation tolerance; revisit during polish if the original feel matters.
- Whether the original CF 沙漠灰 mid doors permit walking through the center seam (implemented here as a passable 1.4m gap) could not be confirmed from the saved reference stills; the choice is documented and gameplay-reasonable.

**Commands/evidence inspected**: reads of the files listed above; `artifacts/e2e-desert-results.json` (34/34, `consoleErrors=[]`, `pageErrors=[]`); two read-only `node --input-type=module` probes building the real `World` from `DESERT_LAYOUT` (no files written); no builds, no test-suite reruns, no edits.