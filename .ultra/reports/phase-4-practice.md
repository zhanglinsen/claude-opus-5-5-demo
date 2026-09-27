# 阶段 4 / C 波 lane 2：自由练习运行时 — 交付报告

日期：2026-09-27 · 分支：codex/desert-grey · 范围内新文件（未提交）：
- `cf-transport-ship/src/modes/practice-runtime.js`（新增，PracticeRuntime）
- `cf-transport-ship/src/modes/practice-targets.js`（新增，靶体组件）
- `cf-transport-ship/tests/unit/practice-runtime.test.mjs`（新增，7 个聚焦用例）

范围内未动：`game.js` / `hud.js` / `bots.js` / `player.js` / `modes/practice.js`（仅 import）/ `modes/index.js` / maps。

## 注入契约（Game 侧需要提供什么）

### 1. 靶点布局元数据（地图文件负责，本 lane 只定义接口）
```js
spot = { id: 非空字符串, pos: { x, y, z } 数值米制, radius?: 正数(缺省 0.55m), visible?: 布尔(缺省 true) }
```
- 校验失败的条目（重复 ID 取首个、非法 ID / 非数值 pos / 缺 pos / null）整体丢弃，不产生半残靶体。
- `visible: false` 为隐蔽靶：仍计入会话靶子列表，但射线不可选中（供地图做隐藏彩蛋靶或预告位）。
- 构造：`new PracticeRuntime({ spots })` → 内部 `createTargetStates(spots)` 生成靶体，再以 `{ id, pos }` 注入 `PracticeSession`（会话对 pos 保持不透明透传，核心契约不变）。

### 2. 命中登记（两条接缝，Game 按弹道形态二选一）
- 即时弹道（hitscan 枪械）：`rt.hitScan(origin, dir, maxDist)` — 射线-球判定最近可见靶并登记，返回 `{ id, dist, point }` 或 `null`（落空/无效射线）。dir 无需预归一化；`maxDist` 建议传武器射程。
- 自管弹道（投射物/延迟结算）：Game 自己判定命中后调 `rt.registerHit(id)` — 透传核心语义：未知/非法 ID 返回 `false` 且零状态新增。
- 时间：每帧 `rt.update(dt)`；**暂停 = 不调用 update 即冻结**（无隐藏墙钟）。

### 3. 任意换枪（纯校验，无 UI）
- `rt.selectWeapon(id)` / `rt.canSelectWeapon(id)`：只读 `src/weapons.js` 公开目录 `WEAPONS`，不做任何练习模式额外限制——合法目录枪械全部可选，含近战（knife, slot 2）与投掷物（he/flash/smoke, slot 3）。
- 投掷物槽位语义：slot 3 三选一，后选替换先选（与实战背包一致），被替换者不残留。
- 非法输入（目录外/空串/非字符串）返回 `false` 且不改变当前选择。

### 4. 输出
- `rt.snapshot()` = 会话快照透传（`now` / `totalHits` / `targets[{id,pos,hits,flash}]`）+ `weapon: { slots, current }`，整体可 JSON 序列化，供 HUD 消费。
- `rt.reset()`：清空命中统计与模拟时间，保留靶子结构；换枪选择属玩家偏好，重开一局**保留**。

## 红→绿证据

红（实现前，模块不存在导入失败）：
```
✖ tests/unit/practice-runtime.test.mjs (169.97371ms)
ℹ tests 1  ℹ pass 0  ℹ fail 1
```
绿（实现后）：
```
node --test tests/unit/practice-runtime.test.mjs tests/unit/practice-core.test.mjs
ℹ tests 12  ℹ pass 12  ℹ fail 0
npm run build → built dist/index.html 916.9 KB
```
过程注：红转绿期间修了两处**测试自身的几何错误**（SPOTS 中 t1 不在测试射线的轴上；斜向用例的球心偏离射线垂直距离 4m），实现代码未因此改动语义。

## 用例覆盖（7 项）
1. createTargetStates 校验/去重/缺省值/可序列化
2. raySphere：正交/斜向命中、脱靶、球在射线背后、原点在球内、零向量
3. pickTarget：最近可见靶、maxDist 截断、隐蔽靶不可选、非法射线安全
4. Runtime 端到端：布局→靶体→hitScan 登记→registerHit 已知/未知 ID→update/暂停冻结
5. 换枪：合法（含近战）、非法、slot 3 投掷物轮换替换、canSelectWeapon 只读
6. reset：统计/时间清零、结构保留、换枪保留、重置后可继续统计
7. 坏输入：非法 spots、无参构造、无幽灵靶

## 给 D 波接线的清单
1. **模式注册**：练习开局时构造 `new PracticeRuntime({ spots: <地图靶点元数据> })`；两幅地图各自提供 spots（本 lane 未定义任何坐标）。
2. **命中调用点**：枪械即时弹道命中判定处调 `hitScan(origin, dir, weapon.range)`（或 Game 自有弹道后调 `registerHit(id)`）；投掷物若需计靶命中走 `registerHit`。
3. **每帧推进**：Game 主循环非暂停分支调 `rt.update(dt)`；暂停菜单期间跳过调用即冻结。
4. **HUD 消费**：读 `rt.snapshot()` 渲染命中数/总命中/受击闪烁（`targets[].flash` > 0 时高亮）与当前武器（`weapon.current` / `weapon.slots`）；换枪输入接 `selectWeapon(id)`。
5. **重开一局**：练习重开按钮接 `rt.reset()`（不要重建 runtime，除非需要重载地图靶点）。
6. 无敌军主动攻击 / 全图探索属 Game 侧生成规则（bot 禁用、无边界锁），本 lane 不涉及。
