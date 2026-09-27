# BombMatch inSite 严格契约修复

日期：2026-09-26
范围：仅 `cf-transport-ship/src/modes/bomb.js`、`cf-transport-ship/tests/unit/bomb-core.test.mjs`。
本修复是提前收紧核心输入边界，**不是阶段 3 整体完成**。

## 问题（独立复核确认）

`plantAt` 原实现：

```js
const site = (this.tickFacts[plant.actorId] || {}).inSite || true;
```

真值兜底会把布尔 `true` 存为 `bomb.site` / `plantedSite` / `bombPlanted.site`。同时
`startPlant`、`startDefuse`、`actionInvalidReason`、`plantable`、`defusable` 均用真值判断
`inSite`，导致集成方误传布尔区域判定（如 `inSite: true`）时：

- 布尔 `true` 能开始并完成安包，`bomb.site` 变成 `true`，产生非法 planted 状态；
- 目标型 AI 读 `snapshot().bomb.site` 做守包/回防目标时会拿到未知 site 而崩溃。

## 修复后的契约

`inSite` 必须是**非空包点 ID 字符串**（当前 'A'/'B'）：

- 布尔 `true`、空串或其他非法值一律视为**不在包点/拆包范围**：
  - `startPlant` / `startDefuse` 命令直接拒绝（不开始、无事件）；
  - 安/拆包进行中失去合法 `inSite` → `plantCancelled` / `defuseCancelled`，reason `leftSite`，进度重置；
  - `plantable()` / `defusable()` 提示与命令门一致返回 false；
  - `plantAt` 内防御兜底：site 非法时按 `leftSite` 中断，绝不生成 `bombPlanted`。
- 原有合法字符串 'A'/'B' 行为与时序（5s 安包 / 7s 拆包 / 40s 引爆、同时刻平手判引爆）完全不变。
- 引擎**不校验** site ID 是否存在于地图（BombMatch 不依赖地图元数据，如 'C' 也会被接受）；
  由 Game 集成方负责提供真实包点 ID。

代码层面：新增模块级 `isSite = (v) => typeof v === 'string' && v.length > 0`，替换上述六处真值判断；
`bomb.js` 顶部 facts 契约说明同步更新。

## 红绿证据

命令（仅聚焦用例，未跑全量构建/浏览器套件）：

```
cd cf-transport-ship
node --test tests/unit/bomb-core.test.mjs
```

红态（新增 2 条契约用例后、修复前）：

```
✖ inSite 契约：布尔 true 或空串不算在包点，不得开始安包也不产生 planted 事件
    （plantStarted 被意外发出，bomb.site = true）
✖ inSite 契约：安包中失去合法 site（变布尔 true）中断并重置进度
    （未触发 plantCancelled/leftSite，反而完成安包）
其余 16 条既有用例全部通过
```

绿态（修复后）：

```
✔ 18/18 全部通过（16 条既有边界用例 + 2 条新增 inSite 契约用例）
  其中既有用例覆盖：默认参数、prep/live 流转、安/拆/爆时序、
  超时与灭队判定、同时刻平手判引爆、死亡掉包/拾取、打断重置、暂停/重开纯净性
```

无需重构：`isSite` 一次抽取即覆盖全部判断点，改动为最小形态。

## 对 Game 集成方的要求

- `facts.actors[].inSite` 请传该角色当前所处的**真实包点 ID 字符串**（'A'/'B'），不在任何包点时传 `false`/`undefined`；
- 不要用布尔化的区域命中结果直接填充 `inSite`。

## 遗留（归属后续集成，非本次范围）

- Game 侧按此契约接线（区域判定 → 包点 ID 映射）；
- 观战/装备切换、HUD 展示、AI 目标选择对 `bomb.site` 的消费仍待阶段 3 集成验证。
