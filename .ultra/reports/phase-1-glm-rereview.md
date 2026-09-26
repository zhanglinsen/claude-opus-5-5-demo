`desert-grey` is `available: false` (registry.js:48), so `resolveMapId` legitimately falls back to transport-ship — the screenshot's 运输船 label is expected behavior, not a fixture defect. All verification is complete; here is my final review report.

---

# Independent GLM MAX gate review — Phase 1 final storage acquisition fix (cf-transport-ship)

**Reviewer:** Independent GLM-5.3-Flash MAX (not the implementer; not a Sol review)
**Date:** 2026-09-26 · **Scope:** the single still-open finding from `.ultra/reports/phase-1-rereview-1.md` (throwing `localStorage` property getter) plus direct regressions. Product source treated as frozen; no writes, builds, or browser reruns performed.

## Code Review Summary

**Files reviewed:** `src/settings.js`, `src/hud.js`, `src/game.js` (save paths), `src/maps/registry.js` (map-fallback check), `tests/unit/settings.test.mjs`, `scripts/e2e-storage-getter.mjs`, `scripts/serve.mjs`, `build.mjs`, `package.json`, `dist/index.html` (bundle), artifacts
**Overall assessment: APPROVE**

The last open defect is fixed at the correct layer. The property read of `localStorage` itself is now the guarded operation, so a throwing getter degrades settings to an in-memory implementation instead of aborting menu construction.

## Findings

### P0 - Critical
(none)

### P1 - High
(none)

### P2 - Medium
(none)

### P3 - Low (non-blocking)
- **[scripts/e2e-storage-getter.mjs:47] Fixture assertion 2 is near-tautological.** It sets `window.__game.opts.map = 'desert-grey'`, calls `hud.saveOpts()`, then reads the same `opts.map` property back — it proves only that `saveOpts()` doesn't throw synchronously, not that the value persists. The genuine round trip is covered where it matters (unit test `tests/unit/settings.test.mjs:153-158` and my probe below), so this does not block. If touched again, read back via `loadOpts(acquireStorage())` inside `page.evaluate`.
- **[.ultra/reports/phase-1-fix-2.md:25] Trivial report discrepancy.** Report quotes `built dist/index.html 845.9 KB`; current `dist/index.html` is 866,303 bytes (~846.0 KB), suggesting one extra rebuild after the quoted output. Immaterial: dist mtime (21:49) postdates the source fix (21:47) and precedes the artifacts (21:50), and the bundle provably contains the fixed code (below).

## Verification performed (what I actually ran vs inspected)

**Actually run by me (read-only):**
1. **`npm test` → 28/28 passed** (includes the 2 new `acquireStorage` tests). Confirmed the new test at `tests/unit/settings.test.mjs:140` really defines a **throwing property getter** on `globalThis.localStorage`, asserts no throw, memory-impl usability, and a full `loadOpts`/`saveOpts`/`loadOpts` round trip; the test at line 164 asserts a healthy storage is returned as-is. Cleanup uses `finally { delete globalThis.localStorage }`.
2. **Independent Node probe** importing the real `src/settings.js` with `Object.defineProperty(globalThis, 'localStorage', { get() { throw new DOMException('denied','SecurityError') } })`: direct access (the old hud.js pattern) throws `SecurityError`; `acquireStorage()` does not throw; memory impl is usable; defaults are complete (`primary:'ak47'`, all key fields defined); save→load round trip returns `map:'desert-grey'`; repeated acquisition returns the same consistent impl.
3. **Bundle inspection:** `grep -o localStorage dist/index.html` yields **exactly one** occurrence, and its context is the minified guarded acquire: `function cu(){try{let s=globalThis.localStorage;…}catch{}return _y}` with `_y` the Map-based fallback and `Jf` the method-level `safeGet`. The pre-fix hud.js direct references are gone from the build.
4. **Timestamp/evidence chain:** `src/settings.js` + `src/hud.js` 21:47 → tests 21:48 → `scripts/e2e-storage-getter.mjs` + `dist/index.html` 21:49 → artifacts 21:50. The targeted artifact was generated from a build containing the fix, and the prior full-e2e evidence (`artifacts/e2e-results.json`, 21:34) was preserved untouched, as the fix report claims.

**Inspected, not rerun:** the browser fixture script and its recorded artifacts. `scripts/e2e-storage-getter.mjs:35-40` installs the throwing getter via `ctx.addInitScript` (runs **before any page script**), loads `/index.html?nolock=1&q=low`, waits for `#menu:not(.hidden)`, **really clicks `#btnStart`** (line 48) and waits for `playing && player.alive` (line 49), with a `pageerror` listener asserted empty (lines 42, 57). `artifacts/e2e-storage-getter-results.json` records 4/4 pass, `driver: "ui"`, `pageErrors: []`; `artifacts/e2e-storage-getter.png` shows a genuine in-match frame (live HUD, timer, AK-47, spawn-protection text). The map label reads 运输船 because the fixture's `opts.map='desert-grey'` is correctly skipped by `resolveMapId` (`src/maps/registry.js:48,66-71`, `available:false`) — expected, not a fixture bug.

## Checklist against the open finding

| Requirement | Status | Evidence |
| --- | --- | --- |
| All production `localStorage` property accesses guarded | **Met** | Only occurrence in `src/` is the guarded `globalThis.localStorage` inside `acquireStorage()` (`src/settings.js:87`); `src/hud.js:30` and `:33` now acquire via `acquireStorage()`; all `game.js` save paths (`game.js:41,264,278-279`) route through `hud.saveOpts()` |
| Load/save work when the getter throws | **Met** | `acquireStorage` (`settings.js:85-91`) try/catches the property read → `MEMORY_STORAGE`; unit test 140/141, my probe, browser fixture |
| Load/save work when methods throw | **Retained (second layer)** | `safeGet` (`settings.js:69-71`) and `saveOpts` catch (`settings.js:107-109`); unit test at line 131; prior-round throwing-method fixture unchanged |
| Default preferences usable after fallback | **Met** | `loadOpts` on memory impl returns complete defaults; asserted in unit tests, my probe, and fixture assertion 1 (`__game.opts.sens` finite, menu initialized) |
| Targeted browser fixture: throwing getter before init, real Start click, no page errors | **Met (inspected)** | `addInitScript` getter at `e2e-storage-getter.mjs:35`, `page.click('#btnStart')` at :48, empty `pageErrors` in artifact JSON; screenshot shows playable match |
| No regressions elsewhere | **Met** | Change surface is exactly settings.js/hud.js wiring plus additive test/script/package entry; per-session persistence loss under memory fallback is the documented, acceptable privacy-mode degradation (`saveOpts` at `game.js:279` + `location.reload()` simply re-defaults, no crash path) |

## Limitations

- I did **not** rerun any browser suite (targeted or full) — the targeted fixture writes artifacts, which was out of bounds for this read-only review. My browser-scoped conclusion rests on script inspection plus the recorded 4/4 JSON and screenshot, cross-validated by the timestamp chain and bundle contents. I make no claim of a browser rerun.
- Pointer-lock exit behavior remains untested (unchanged from the prior report's noted boundary; not part of this fix).
- `npm run build` was not rerun by me; dist was verified by inspection only.

**Decision: APPROVE.** The phase-1 storage work is complete: every path to `localStorage` in production code is guarded at both the property and method layer, defaults remain usable under full interception, and the targeted evidence chain is intact and consistent with the source under review. The two P3 notes are optional polish, not merge blockers.
