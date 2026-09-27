# 阶段 4 / C 波定向修复报告（响应 phase-4-review-combat-practice.md，REQUEST_CHANGES）

日期：2026-09-27 · 分支：codex/desert-grey · 未提交。

改动文件（仅限本 lane 授权范围）：
- `src/modes/practice-runtime.js`（P2-1 修复）
- `src/combat/projectile.js`（P3-2 / P3-3 / 建议 4）
- `tests/unit/practice-runtime.test.mjs`（P2-1 红用例）
- `tests/unit/combat-throwables.test.mjs`（建议 2）
- `tests/unit/combat-projectile.test.mjs`（建议 1，顺手）

未动：game / HUD / maps / textures / env（视觉 lane 并行中）/ `practice-targets.js`（见建议 3 处置）。

## P2-1（必改）：换枪校验走原型链 — 已修复，TDD 红→绿

红（修复前，新增用例先行）：
```
✖ 任意换枪：合法目录枪械全可选（含近战/投掷物），slot 3 投掷物轮换替换
  AssertionError: canSelectWeapon('toString') 期望 false 实为 true
ℹ pass 6  ℹ fail 1
```
修复：`practice-runtime.js` `canSelectWeapon` 由 `!!WEAPONS[id]` 改为 `Object.hasOwn(WEAPONS, id)`（自有键查找，不触原型链）。

绿（修复后）：
```
node --test practice-runtime → ℹ tests 7 ℹ pass 7 ℹ fail 0
```
新增断言：`'toString'`/`'constructor'` 的 `canSelectWeapon` 为 false；三者的 `selectWeapon` 为 false 且 `current` 不变、不进入任何槽位（复核审核探针的 `slots[undefined]` 路径已封死）。

## P3-2：构造参数 radius 从未读取 — 选删除（非占位注释）

`GrenadeProjectile` 构造不再接收/存储 `radius`。理由：全仓 grep 证实零调用方传入、类内零读取；本模块碰撞由注入的 `raycast` + `skin` 贴面间距隐式决定，不存在"碰撞球"概念——`WEAPONS` 里的 `radius` 是爆炸效果半径，属 Game 侧结算（grenade-effects），与本运动核心无关。保留只会误导调用方以为传它能膨胀碰撞体。构造处已留注释说明。D 波契约（combat 报告 API 表 `new GrenadeProjectile({pos, vel, fuse})`）本就未含 radius，无契约破坏。

## P3-3：rested 后每子步仍发 bounce — 选注释强调（保持行为与现役逐位一致）

选方案 A：头注释加粗契约，不改行为。理由：现役 `updateNades` 同样每子步重命中、仅音效有 `|vn|>2` 闸门；本模块与现役的 240 帧逐位等价是审核实证的核心价值，抑制事件会破坏等价性且收益（省几个对象）微不足道。头注释新增：**bounce 音效必须由 Game 用 |impactSpeed| > 2 闸门过滤；贴地静止后每子步仍发 bounce（impactSpeed 为浮点尘埃级），漏闸门会出现持续弹跳音**。

## P3-4：hitScan 接线契约修正（修正版，取代 phase-4-practice.md §2 的 `weapon.range` 写法）

> **修正**：`hitScan(origin, dir, maxDist)` 的 `maxDist` 不要直接传 `weapon.range`。Game 侧必须先对同一 `origin/dir` 做墙面 raycast（`world.raycast(..., 'move')`），取 `maxDist = min(weapon.range, 墙面射线距离 - skin)` 后再调 `hitScan`。
>
> **隔墙命中风险**：`hitScan` 是纯射线-球判定，对墙体零感知。若照原写法直传 `weapon.range`，隔墙的靶子会被穿墙登记命中（尤其 awm range 400m）。靶子通常贴墙摆放，此风险为常态而非边角。

## 审核建议处置

- **建议 1（PROJECTILE_DEFAULTS 无回归网）— 已做**：`combat-projectile.test.mjs` 新增 `deepEqual` 锁定全部 9 个常数（gravity 14 / substeps 3 / skin 0.07 / bounceNormal 0.2475 / bounceTangent 0.55 / restNormalY 0.7 / restVy 1.2 / rollFriction 0.8 / sleepSpeed 0.05），改动任一即显式失败，提醒同步 game.js 等价性。
- **建议 2（effect 分发键仅靠源码保证）— 已做**：`combat-throwables.test.mjs` 新增断言 `WEAPONS[id].effect === id`（id ∈ he/flash/smoke）。
- **建议 3（pickTarget 对非数组 states 无防御）— 未做，越界**：该修复在 `practice-targets.js`，不在本次授权编辑清单内。留给下一 lane / D 波前顺手修（一行 `Array.isArray` 守卫，与同文件 `createTargetStates` 对齐）。
- **建议 4（atRest `vel.y === 0` 严格相等脆弱）— 已做**：改为 `Math.abs(this.vel.y) < 1e-9`，防 rest 分支置零后一次未命中子步留下尘埃级负值导致误判运动中。运动数学未动。

## 验证证据

```
node --test practice-runtime practice-core combat-projectile combat-throwables
→ ℹ tests 27 ℹ pass 27 ℹ fail 0
npm test → ℹ tests 186 ℹ pass 186 ℹ fail 0
npm run build → built dist/index.html 917.4 KB
```

## 结论

P2-1 已按 TDD 修复并补继承名用例；P3-2/3/4 按报告处置；建议 1/2/4 顺手完成、建议 3 越界未动。审核报告的放行条件（"P2-1 一行修复 + 补两个继承名测试用例后达 APPROVE"）已满足，可放行 D 波接线（接线时注意 P3-4 修正后的 maxDist 契约与 P3-3 的音效闸门）。
