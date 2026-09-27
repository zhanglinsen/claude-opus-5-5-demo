# Phase 3 P2 定向修复 — 掉包任意距离拾取（隔空取包）

执行者：GLM-5.3-Flash HIGH（原 RULES/合流会话续跑，CLI，无子代理）。日期：2026-09-27。
来源：`.ultra/reports/phase-3-review-ai-ui.md`（REQUEST_CHANGES，唯一 P2）。
修复在生产方完成：引擎权威校验 + 视图提示镜像；未在输入层加任何客户端守卫。

## 问题复述（审核确认）

- `bomb-session.js` 的 `pickupable` 视图提示对任何存活 BL 恒真（无距离项）。
- `bomb.js` 的 `pickupBomb` 命令分支只校验阵营/存活/相位，无权威距离校验。
- 后果：地图任意位置的 BL 按 E 隔空取包；HUD「找回 C4」分支对存活 BL 不可达；bot 仅因自身 1.7m 门限幸免。

## 修复（生产方）

1. `src/modes/bomb.js`（引擎为准，不依赖视图）：
   - 新增 `export const PICKUP_RADIUS = 2`：拾取交互半径 **2.0 米，3D 距离**。
   - 新增公共方法 `pickupable(actorId)`：掉落态 + 相位（prep/live）+ 存活 BL + **最近一帧事实位置与掉点的 3D 距离 ≤ PICKUP_RADIUS**；任一位置未知一律不可拾（绝不隔空取包）。作为命令与视图共用的唯一权威判定。
   - `applyCommand` 的 `pickupBomb` 分支重构为直接调用 `this.pickupable(c.actorId)`（单一权威，消除两处校验漂移的可能）。
2. `src/modes/bomb-session.js`：view() 的 `pickupable` 改为镜像 `m.pickupable(actorId)`，删除本地手写判定（原判定正是缺陷所在）。

**阈值选择依据**：取 2.0m——(a) bots.js 自身兜底门限 1.7m 在其内，bot 下发的拾取命令不会被引擎弹回（AI lane 行为不变）；(b) 与近身交互尺度一致（刀轻击约 2.2m）；(c) 远小于包点判定半径 5.5m，杜绝远距离与跨楼层拾取（3D 距离含垂直项：高低差 >2m 即不可拾，A 平台上无法隔空拾取地面掉包）。输入层（player.js）未动：远端 BL 按 E 仍可发命令，引擎静默拒绝，无副作用。

## TDD 证据（实际红→绿）

RED（先加聚焦失败用例，真实行为失败而非缺模块）：

```
node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs
✖ 拾取交互半径：远端 BL 不能隔空拾取（pickupable=false 且命令无效），近端 BL 可拾，GR 贴脸也不拾
    AssertionError: true !== false   ← 远端 BL(5m) 的 pickupBomb 隔空拾取成功，bombPickedUp 已触发
✖ view：可序列化快照 + plantable/defusable/pickupable/inSite 提示 + 观战队友
    （视图断言改为新契约：远端 BL pickupable=false / 近端=true）
30 tests, 28 pass, 2 fail
```

新增/调整的用例：
- `bomb-core.test.mjs` 新增「拾取交互半径」用例：掉包于 (1,2,3) → 远端 BL (6,2,3)（5m）命令无效、`pickupable=false`、C4 仍掉落；近端 BL (2,2,4)（1.4m）提示可拾且拾取生效；**GR 站在掉点正上方位不拾取**。
- `bomb-runtime.test.mjs` 视图用例改为新契约：远端 BL `pickupable=false`（HUD 走「找回 C4」分支）、近端 BL（掉点旁 ~1.4m）`pickupable=true`、GR 恒 false。
- 既有用例「携包者死亡掉包；GR 不能拾取，存活 BL 可以」的 fixture 最小修正：b2 拾取时给掉点旁 0.5m 的事实位置（旧用例建立在无距离校验前提上，b2 原本没有事实位置；语义断言本身不变）。

GREEN：

```
node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs \
        tests/unit/bomb-bot.test.mjs tests/unit/bomb-input.test.mjs
→ 47 tests, 47 pass, 0 fail, 0 skipped
```

## 定向回归（实际命令与结果）

```
npm run build                 → built dist/index.html 910.7 KB
node scripts/e2e-bomb.mjs     → 36/36 通过（无用例文案/断言需要修正：e2e 未依赖旧拾取语义，
                                仅校验 pickupable 键存在与安拆/结算边界）
npm test（全量）              → 149 tests, 149 pass, 0 fail, 0 skipped
```

## 对消费方的影响

- **AI lane（bots.js，未改动）**：bot 自身 1.7m 兜底 < 2.0m 引擎半径，bot 下发的拾取命令全部仍有效；其 `view.pickupable !== false` 预检现在语义正确（远端 bot 不再白发命令）。行为完全兼容。
- **UI lane（player.js/hud.js，未改动）**：远端 BL 的 `#objHint` 从不可达的「按 E 拾取 C4」回到「找回 C4」（审核指出的修复目标）；近端提示不变。player.js 远端按 E 发出的命令被引擎拒绝，无客户端守卫、无副作用。
- **Game/e2e**：无需变更；36 项浏览器验收含「玩家走到掉点旁」路径的既有覆盖未受影响。

## 遗留

无新增遗留。审核报告其余项（P3/信息类）不属本次范围。
