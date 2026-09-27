# Phase-4 投掷物效果规则核心（前置并行任务）报告

- 日期：2026-09-26
- 执行者：GLM-5.3-Flash（early parallel task，独立文件所有权）
- 任务来源：`.ultra/tasks/contexts/phase-4-grenades-core-early.md`
- 规格依据：`.ultra/specs/desert-grey.md` Combat/Controls、Profile（TDD 与分层架构要求）、必要测试约束

## 交付文件（均为本次新建，未改动任何既有文件）

1. `cf-transport-ship/src/combat/grenade-effects.js` — 纯效果规则核心
2. `cf-transport-ship/tests/unit/grenade-effects.test.mjs` — 公开行为边界测试（16 例）
3. 本报告

`git status` 复核：新增仅 `cf-transport-ship/src/combat/`、`tests/unit/grenade-effects.test.mjs`；未触碰 game.js/actor.js/weapons.js/effects.js/bots.js/地图/物理/导航/profile/package 及既有测试，未提交、未推送。

## 公开 API（供 stage4 Game 集成的最小接缝）

- `GRENADE_EFFECT_DEFAULTS`（frozen）：`he`（radius 7.5 / damage 115 / falloff 1.1 / occlusionFactor 0.2 / minDamage 1，与现役 `WEAPONS.he` 与 `Game.explode` 行为对齐，测试有与 `WEAPONS.he` 的一致性断言）；`flash`（radius 16 / maxDuration 3 / facingFullDot 0.5 / behindDot -0.2）；`smoke`（radius 3.5 / duration 12 / fadeStart 7 / denseOpacity 0.5，均为新规则默认值）。
- `computeHeBlast({ origin, target, ownerTeam, isBlocked, rules })` → `{ applies, reason, damage, distance, blocked }`。`target: { pos, team, alive, isOwner }`（pos 传胸口位置）。不结算 reason：`dead | sameTeam | outOfRange | belowThreshold`，优先级与现役 `Game.explode` 一致（存活 → 队伍 → 半径 → 阈值）。队伍规则与现役一致：队友免疫、投掷者自身可受伤、无队伍时无豁免。
- `computeFlashEffect({ origin, observer, isBlocked, rules })` → `{ blinded, intensity(0..1), duration(s) }`。`observer: { pos, viewDir, alive, spectating }`；死亡/观战不受影响；视野锥内满致盲、背对不致盲、之间线性；遮挡（`isBlocked` 回调为 true）完全不致盲；viewDir 缺失/零向量按面朝处理。玩家与 AI 走同一函数。
- `SmokeCloud`：`constructor({ pos, radius, duration, fadeStart, denseOpacity })`、`advance(dt)`（显式推进，暂停 = 不调用，负 dt 忽略）、`opacity()`、`expired()`、`blocksSight(from, to)`（视线段穿入烟团体积且 opacity ≥ denseOpacity 判阻挡）。
- `smokeBlocksSight(from, to, clouds)`：玩家视觉与 AI 视线共用的唯一烟雾视线接缝，任一活烟阻挡即阻挡。
- 约束兑现：无 DOM/Three/音频/全局时钟/随机数；世界遮挡全部通过注入的纯 `isBlocked(start, end)` 回调（Game 侧可用现役 `world.raycast('bullet')` 适配）；只返回伤害值/强度/布尔判定，不扣血、不播音效、不建网格；投掷物运动/音效/网格仍是 Game 侧运行时适配器。

## TDD 过程（每个切片独立 red→green，实际输出摘录）

运行命令：`node --test tests/unit/grenade-effects.test.mjs`（未运行共享全套测试/浏览器套件）。

- HE 切片 red #1（模块无导出）：`SyntaxError: ... does not provide an export named 'GRENADE_EFFECT_DEFAULTS'` → 实现 HE 基础衰减/队伍/阈值后，先故意不含遮挡逻辑。
- HE 切片 red #2（遮挡行为真红）：`✖ 几何遮挡实质减伤… actual: false, expected: true`（covered 未减伤）→ 加入 occlusionFactor 处理 → green：`tests 6, pass 6, fail 0`。
- 闪光切片 red：`does not provide an export named 'computeFlashEffect'` → 实现 → 首轮 2 例失败，均为测试摆位错误（把 8m/16m 半径处当“满强度”、远点观察者 viewDir 背向闪光），修正测试几何而非实现 → green：`tests 12, pass 12, fail 0`。
- 烟雾切片 red：`does not provide an export named 'SmokeCloud'` → 实现 → 1 例失败为测试自身累计时间算错（4+2+2.5=8.5s 而非 9.5s），修正 → green：`tests 16, pass 16, fail 0`。
- 重构（保持 green）：`SmokeCloud` 构造器参数解构清理 → 复跑 `tests 16, pass 16, fail 0`。

断言均为公开 API 上的行为样例（暴露 vs 遮挡、面对 vs 背对/遮挡、穿越 vs 未穿越 vs 消散），无任意魔法常数断言、无实现公式复刻。

## 集成待办（stage4 才做，本次未连接）

- 现役游戏中尚无闪光/烟雾投掷物，HE 尚未迁移：本核心当前未被任何 Game 代码引用，实际对局中的手雷行为不变（仍走 `Game.explode`），直到 stage4 接线。此为如实声明。
- 接线时：`Game.explode` 伤害部分改调 `computeHeBlast`（`isBlocked` 适配 `world.raycast`，target.pos 用 `soldier.chestWorld`）；闪光/烟雾作为新投掷物类型接入 `WEAPONS`/投掷/引信流程；玩家视觉与 `Bot` 视线统一改走 `smokeBlocksSight`；HUD/音频/网格在 Game 侧消费返回值。

## 验证证据

- 最终状态：`node --test tests/unit/grenade-effects.test.mjs` → `tests 16, pass 16, fail 0`（与当前代码版本绑定，未重复跑全套）。
- 遵守约束：未运行 build/浏览器/e2e 套件；未做任何提交/推送/部署/全局配置改动。
