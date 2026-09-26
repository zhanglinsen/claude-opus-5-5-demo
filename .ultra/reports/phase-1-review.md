# Phase 1 independent review

**Gate result: REQUEST_CHANGES.** The transport ship registry and TDM adapter are called by `Game`, and the existing screenshots show a rendered ship match and menu. The gate still has confirmed settings defects and browser assertions that can pass without proving the behavior they name. Desert Grey geometry and bomb mode are outside this review.

## Findings

### P1 — Invalid saved settings can prevent a match from starting

[settings.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/settings.js:44) accepts any object with `v: 2` without restoring defaults or validating fields. For example, `{ "v": 2, "primary": "invalid" }` reaches [Game.startMatch](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/game.js:132); [WeaponState](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/weapons.js:56) then throws while reading `mag`. A read-only Node probe confirmed both the unvalidated output and the constructor error. Missing fields have the same path. Validate and merge saved values against defaults, then test malformed version 2 records through the normal Start action.

### P1 — Storage access failure now aborts initialization

[settings.js:51](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/settings.js:51) reads the legacy key outside its `try` block. When storage access throws, `loadOpts` throws and the menu cannot initialize. A read-only probe using storage methods that throw `SecurityError` reproduced this. Keep both reads within the recovery path and verify startup with unavailable storage. The baseline HUD caught its settings read.

### P1 — Browser tests do not exercise the required Start control

[e2e.mjs:51](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/scripts/e2e.mjs:51) starts the HTTP match with `?autostart=1`; no test clicks `#btnStart`. Source inspection shows the button is wired at [hud.js:84](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/hud.js:84), but the recorded run does not verify that user action. The file URL case stops at a visible menu and canvas. Add a browser test that waits for the menu, clicks Start, and observes a playable match; exercise the relevant pause, resume, quit, and loadout controls as part of the ship regression.

### P1 — Two gameplay assertions can report success without the claimed behavior

At [e2e.mjs:79–91](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/scripts/e2e.mjs:79), “bots produce kills” sums **all** actors after the test has already injected a player kill, so it can pass with zero bot kills. The respawn check passes whenever fewer than all 12 actors are dead, even if no actor respawned. The stored 17/17 result therefore does not establish either claim. Compare bot kills before and after simulation, and observe a specific dead actor becoming alive after the mode’s respawn interval.

### P2 — The Phase 1 map contract lacks required spawn height and bounds

The transport descriptor in [registry.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/maps/registry.js:5) has navigation and radar extents but no map bounds or `xyz + yaw` spawn contract. [map.js:586](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/map.js:586) emits `x, z, yaw`; [Actor.spawn](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/actor.js:43) fixes height at `0.02`. This leaves the approved shared map interface incomplete for elevated spawns. Define and consume the spawn height and bounds contract while preserving ship coordinates; verify ship spawn placement through that contract.

### P2 — An existing empty legacy record is treated as a new player

[migrate](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/settings.js:24) sets the old-user flag only when the parsed object has keys. A read-only probe confirmed `migrate('{}').map === null`, whereas a nonempty legacy object gets `transport-ship`. When Desert Grey becomes available, a user with an empty `cf_ship_opts` record would receive the new-player default, contrary to the approved migration rule. Detect legacy-key presence separately from the number of options it contains and test `{}`.

## Verification and limits

Reviewed the seven tracked changed files and all eleven new source, script, test, and documentation files in `cf-transport-ship`, plus related `map.js`, `actor.js`, `player.js`, `physics.js`, `render.js`, `weapons.js`, and `main.js`. I inspected the existing [result JSON](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/e2e-results.json) and all three screenshots. The match screenshot shows ship geometry, HUD, radar, and a score change; it does not show how Start was activated.

Commands run: `git status -sb`, baseline `git diff --stat`, `git diff`, `git diff --cached --stat`, `git ls-files --others --exclude-standard`, `git diff --check`, source searches and reads, `npm test`, and read-only `node --input-type=module -e` probes for malformed settings, storage failure, weapon construction, and empty legacy migration. **`npm test` passed 19/19; `git diff --check` passed.**

I did not rerun the repository e2e script because it writes screenshots and JSON into the repo. A separate read-only Playwright attempt to click Start failed before Chrome launched: sandbox permission denied creation of Playwright’s temporary directory, including with `TMPDIR=/tmp`. The implementer’s recorded 17/17 browser result and screenshots were inspected, but no browser rerun passed in this review. I did not rerun the build because it writes `dist/index.html`.