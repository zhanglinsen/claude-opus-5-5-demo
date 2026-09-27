# Phase-4 练习模式纯核心（前置并行任务）报告

- 日期：2026-09-26
- 执行者：GLM-5.3-Flash（early parallel task，独立文件所有权，CLI 直做，未调用子代理/模型）
- 任务来源：`.ultra/tasks/contexts/phase-4-practice-core-early.md`（自由练习：探索、武器切换、静态靶）
- 规格依据：`.ultra/specs/desert-grey.md` 分层架构与 TDD 约束；对齐 `src/modes/bomb.js` 既有纯核心风格

## 交付文件（均为本次新建，未改动任何既有文件）

1. `cf-transport-ship/src/modes/practice.js` — 练习模式纯核心（`PracticeSession`）
2. `cf-transport-ship/tests/unit/practice-core.test.mjs` — 公开行为测试（5 例）
3. 本报告

`git status` 复核：新增仅上述两个代码文件与本报告；未触碰 Game/modes/index/maps/HUD/AI/player/物理/渲染/设置及任何既有测试，未提交、未推送。

## 公开 API（供 stage4 Game/HUD 集成的最小接缝）

- `new PracticeSession({ targets })`：`targets` 为 Game 注入的合法靶点数组 `[{ id, pos? }]`。`id` 必须是非空字符串，重复 ID 取首个，非法条目（`null`、空串、非字符串 ID、缺 id 的对象）一律忽略；`pos` 为 Game 提供的**不透明数据**，原样透传，引擎内不含任何固定地图坐标。无参构造安全（空靶集）。
- `hit(id)` → `boolean`：命中登记。只认已注入靶子 ID；对应靶子 `hits++`、会话 `totalHits++`、`flash` 置为受击反应时长（默认 0.35 秒模拟时间）。未知/非法 ID 返回 `false`，**绝不新增状态**（靶集大小在构造后恒定，避免无限增长）。
- `update(dt)`：唯一时间入口。按模拟 dt 衰减每面靶子的 `flash`（下限 0）并累计 `now`；非法 dt（非有限数、≤0）安全忽略。**暂停 = 不调用 update 即冻结**，无隐藏墙钟。
- `reset()`：清空统计——各靶 `hits`/`flash` 归零、`totalHits`/`now` 归零；靶子结构（ID/pos）原样保留，重置后可继续统计。
- `snapshot()` → 可序列化纯对象 `{ now, totalHits, targets: [{ id, pos, hits, flash }] }`，每次返回全新数组，供后续 Game/HUD 渲染与调试。
- 约束兑现：无 DOM/Three/存储/音频/全局时钟/随机数/外部副作用；无玩家 XP、无赛果、无计时胜负；刻意**不做**通用模式框架——单类约 60 行，武器切换属于 Game/Profile 侧职责，本核心不感知。

## TDD 过程（真实 red→green，实际输出摘录）

运行命令：`node --test tests/unit/practice-core.test.mjs`（未跑共享全套/浏览器/e2e）。先建立最小导出（构造器空、`snapshot` 返回空骨架），保证首个红是行为断言失败而非模块缺失。

- 切片 1（靶点初始化）red：`AssertionError ... actual: [], expected: ['t1','t2']` → 实现注入过滤/去重 → green `pass 1, fail 0`。
- 切片 2（命中）red：`TypeError: session.hit is not a function` → 最小实现 `hit` → green `pass 2, fail 0`。
- 切片 3（衰减/冻结）red：`session.update is not a function` → 实现 `update` → 1 例失败，为**测试自身断言写反**（把暂停者期望成已衰减值），修正测试语义（暂停者 flash 保持初始 0.35 不变）→ green `pass 3, fail 0`。实现未改动。
- 切片 4（reset）red：`TypeError: session.reset is not a function` → 实现 `reset` → green `pass 4, fail 0`。
- 切片 5（坏输入）green 直达：该切片是切片 1/2 已内建校验（非法条目过滤、未知 ID 忽略、非法 dt 忽略）的守护性用例，未驱动新代码、未改实现 → green `pass 5, fail 0`。
- 绿态重构审视：`hitFlash` 常量化注释、`byId` Map 命中查找；无进一步重复可提，未做投机性可配置项（如可调 hitFlash 参数），留待集成期按真实需求再加。

断言均为公开行为样例（注入→快照、命中→计数/反应、dt 累计一致性、暂停冻结、重置后继续统计、坏输入不增状态），无实现公式复刻。

## 集成待办（stage4 才做，本次未连接）

- **如实声明**：本核心当前未被任何 Game 代码引用，游戏中不存在练习模式入口，现役对局行为完全不变。
- 接线时：Game 侧从地图元数据挑选静态靶点（带真实 `pos`）注入构造；射击命中判定走现有弹道/射线后调 `hit(id)`；每帧 `update(dt)` 与主循环共用 dt，暂停菜单期间停止调用即冻结；武器切换复用 Profile/WEAPONS 既有链路，与本核心解耦；HUD 只消费 `snapshot()`（命中数、受击闪光）渲染。
- 双地图：本核心对地图零依赖，两图各自注入各自靶点数组即可，无需本核心感知地图差异。

## 验证证据

- 最终状态：`node --test tests/unit/practice-core.test.mjs` → `tests 5, pass 5, fail 0`（与当前代码版本绑定）。
- 遵守约束：只编辑 3 个新文件；未运行 build/浏览器/e2e；未做任何提交/推送/全局配置改动；与其他并行审核会话保持文件隔离。
