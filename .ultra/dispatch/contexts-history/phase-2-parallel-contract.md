# Phase 2 parallel implementation contract (Astra planning)

User explicitly authorized parallel development. This replaces phase2 single-writer scheduling only: three GLM high CLI workers with disjoint ownership implement against this contract, then the integration worker assembles and performs necessary browser validation. Stage2 starts only after stage1 approval. Later reviews are independent GLM MAX CLI sessions. No built-in agents, Codex/Sol, or delegation by workers.

## Ownership

- MAP worker: ONLY new src/maps/desert-grey.js, src/maps/desert-grey-layout.js, optional new src/maps/desert-grey-materials.js, tests/unit/desert-layout.test.mjs, and .ultra/reports/phase-2-map.md. No registry/game/bots/physics/env edits.
- MOVEMENT worker: ONLY src/physics.js, new src/navigation.js, tests/unit/height-navigation.test.mjs, and .ultra/reports/phase-2-movement.md. No map/registry/game/bots/actor/env edits.
- INTEGRATOR runs concurrently, owns shared maps/registry.js and maps/index.js, game.js, bots.js, player.js, actor.js, env.js, hud.js, settings.js, style.css, README and new scripts/e2e-desert.mjs. Implement integration against contract while other workers finish modules. DO NOT edit their map/physics/navigation files while active. After all workers stop, may repair interfaces together with both owned modules. No shared builds or browser checks until coordinator confirms all workers stopped; then resume integration to build/test and capture screenshots. Initial report .ultra/reports/phase-2-integration-prep.md, final .ultra/reports/phase-2-implementation.md.
- Do not modify another worker's files, revert unrecognized changes, commit, or run concurrent shared builds. If contract truly needs changing, report blocker in your report/final response, do not quietly invent an incompatible interface. Node-only focused tests can run independently.

## Data and shared API

Coordinate convention: +X east/A, -X west/B, -Z north/GR, +Z south/BL; feet y is standing-surface height. Units metres, ~1.75m standing actor. Estimate proportions from classic reference and record uncertainty rather than claim exact extracted dimensions.

MAP exports `DESERT_LAYOUT` from desert-grey-layout.js (pure data, no DOM or Three dependency): bounds {x0,x1,z0,z1}; spawns {BL:[{x,y,z,yaw}],GR:[...]}; regions with ids/names and XZ/Y extents; bombSites; navGraph {nodes,edges}; teamGoals {BL:[node ids],GR:[node ids]}; landmarkViews [{id,name,position:{x,y,z},lookAt:{x,y,z}}]; solids and ramps data for reproducible collision geometry. Include all required landmarks and meaningful asymmetric route graph. MAP's desert-grey.js exports `buildDesertGrey(scene,T,world,opts={})` matching existing ship builder style; returns spawns, regions, bombSites, navGraph, bounds, lampSpots (array), and useful landmark/render handles. No ship-only funnel/ocean props. Flat floors/walls/ceilings use existing world.add box contract.

Ramp API implemented by MOVEMENT: `world.addRamp({x,z,sx,sz,y0,y1,axis:'x'|'z',yaw:0,thickness:0.3,mat:'concrete',surface:'stone',tag})`. In local XZ rectangle, top interpolates from y0 at negative end of axis to y1 at positive end; bottom is min(y0,y1)-thickness. Feet stand on sloped top; sides/underside are solid; sight/bullet rays must respect actual wedge (not whole bounding-box blockage). Same orientation convention as Collider. MAP builds visually matching wedge mesh, may use shallow stair decoration atop continuous collision ramp. Do not create collidable tall steps instead of connected slopes. Separate upper/lower floors must truly coexist in XZ and connect via intentional routes with headroom; no global ground snap or teleport.

Nav nodes: `{id,x,y,z,clearance,region}`. Edges: `{from,to,bidirectional:true,width,requires:'walk'|'crouch'|'jump'}`; absent requires=walk, absent bidirectional=true. MOVEMENT exports `createNavigation(world, descriptor, map)` from navigation.js returning shared object:
- `findPath(start,goal,agent={})`: start/goal {x,y,z}; returns [{x,y,z,nodeId?,requires?}] or [] when unreachable. Respect heights, clearance, edge width and traversal requirements; reject blocked edges using actual collision checks. agent {radius,height,canCrouch,canJump}.
- `randomFree(rnd, bounds?)`: returns {x,y,z} on valid navigation surface.
- For map.navGraph, use height-aware graph; for ship, adapt existing NavGrid to same interface and y=0 preserving established navigation.
Do not change legacy NavGrid public behavior; integrator will replace game/bot call sites. MOVEMENT may add helpers to World necessary for correct path validation. Every accepted graph connection must have genuinely traversable geometry, not just graph connectivity.

## Necessary validation only

MAP: a small focused pure-data check for required landmarks, finite/bounded spawn coordinates and meaningful BL/GR-to-A/B graph connectivity, recording that physical traversal is integration responsibility.
MOVEMENT: focused fixtures for ramp ascent/descent, overhead floor/head clearance, separate XZ stacked layers, blocked/clear height-aware graph edges and ship adapter. Test observable movement/path behavior, not every constant.
INTEGRATOR: actual actor walks required attack/retake routes on integrated geometry, landmark screenshots/overview, one ship smoke and real menu start. No broad repeated unchanged suites. Final long-run acceptance belongs phase6.
