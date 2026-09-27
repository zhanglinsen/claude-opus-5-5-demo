# Local profile architecture contract (Astra planning)

This addresses the user's additional rank/equipment/persistence request. It is a contract for the GLM implementer, not a claim that the feature exists yet.

## Dependency direction

`profile/rank.js` and `profile/equipment.js` are pure domain modules. `profile/service.js` applies profile commands and finished match result events using the domain functions; it depends on an injected repository interface. `profile/repository.js` adapts localStorage with versioning, normalization and memory fallback. `Game` sends result events, applies active loadout at mode-approved points and never accesses the storage key. `HUD` displays a read-only profile view model and issues profile commands. No domain module imports Game, HUD, Three, DOM or localStorage. No circular imports.

## Stable public behavior

- The local key is `cf_profile_v1`; profile version is 1 and separate from `cf_opts_v2` controls/map settings. On first creation only, copy legacy `primary` as preset 1 primary. Never overwrite an existing profile with later setting changes.
- Profile contains cumulative XP, named tier derived from monotonic thresholds, per-mode completed match/round statistics, three loadout presets, active preset index, and a bounded ledger of awarded result IDs. Persist command results promptly; after reload the same profile is returned. Invalid records recover to normalized defaults. If storage is inaccessible, use a memory repository and report nonpersistent status in UI.
- Preset fields: primary, secondary, melee, ordered grenade choices, armor choice. Validate against catalog and actual runtime support, do not show inert choices. Begin with existing weapons; add flash/smoke/armor choices when combat systems provide them. All existing guns are selectable without unlock grind. Rank is progression and display, not a paywall.
- Completed competitive bomb round and completed TDM match send unique result IDs; practice sends none. XP formula is documented and capped, includes meaningful kills/objectives and team win; same ID produces zero additional XP even after reload. Round score is distinct from profile XP. Do not award on every render frame or on abandoned/restarted matches.
- `applyActivePreset(actor, context)` obeys mode timing: bomb prep immediate, bomb live next round; TDM spawn zone immediate, elsewhere at respawn. Profile is source of selection, actor inventory is a runtime copy. On actual application, selected weapon/armor/grenades match preset.

## TDD seams and evidence

First demonstrate red for fresh or legacy load via repository public API; implement it, green, refactor while green. Next a red→green slice for save/reload preset; next for completed result awarded once and rank boundary. Tests use known expected values from this spec/formula and public API, not private helper snapshots. Final integration browser workflow: select preset, play an eligible result, reload, inspect rank and gear; include a second load that does not duplicate XP. Keep tests few and necessary.

## Known current gaps

As of phase2 work, only primary weapon preference is saved in `cf_opts_v2`; `Actor.giveLoadout` hardcodes deagle, knife, HE and 100 armor; no XP/rank/profile service exists. Stage2 workers began before the user's TDD request, so only later new slices can honestly claim test-first discipline.
