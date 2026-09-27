# Profile 结果修复 — applyResult 拒绝缺失/未知 mode

**执行者**：GLM-5.3-Flash HIGH（实现流）
**日期**：2026-09-26
**来源**：`.ultra/reports/early-cores-review.md` Profile 发现（P3-2，任务下发中称 Profile P3-1）：
`src/profile/service.js:66` 只排除 `mode === 'practice'`，缺失/空串/未知 mode 的结果事件只要带 `key` 就发 XP 并产生 `stats["undefined"]` 桶，违背 `rank.js`「残缺结果一律 0」的契约。
**范围**：仅 `cf-transport-ship/src/profile/service.js` 与 `cf-transport-ship/tests/unit/profile-core.test.mjs`（文件所有权内），未触碰 Game/e2e/AI，未运行全量测试或构建。

## TDD 循环（1 轮）

1. **红**：在 `tests/unit/profile-core.test.mjs` 新增测试
   「缺失/未知/空串 mode：一律不发 XP、不记统计、不加账本」，仅断言服务公开 API
   （`applyResult` 返回值 + `svc.profile` 快照）。
   执行 `node --test tests/unit/profile-core.test.mjs`：
   `AssertionError: true !== false` at `profile-core.test.mjs:104`
   （缺失 mode 的结果 `awarded` 为 `true`）→ 缺陷确实可观察复现。8 旧测试仍绿。
2. **绿**：最小实现——
   - 新增模块级常量 `AWARDABLE_MODES = ['tdm', 'bomb']`（带注释，呼应 rank.js 契约）；
   - `applyResult` 守卫改为 `competitive = ev !== null && AWARDABLE_MODES.includes(ev.mode)`。
   复跑：**9 pass / 0 fail**。
3. **重构**：无需。改动即终态——白名单常量提升内聚（可奖励模式定义在一处），守卫保持单行，未引入新依赖或新分支。

## 行为语义（修复后）

- 只有 `mode` 为 `'tdm'` 或 `'bomb'` 的已完结结果可发 XP/统计/账本。
- `practice`、缺失、空串及其他任何未知 mode：`awarded: false, xp: 0, rankUp: false`，
  不产生 `stats` 桶、不占用结果键（账本不变）、不触发持久化写入。
- 去重语义不变：竞技模式同键只发一次，账本随档案持久化。

## 限制与说明

- 白名单为本地常量而非从 `src/modes` 引入：profile 层契约禁止依赖 game/modes（避免循环依赖），
  新增可奖励模式时需同步此数组（已注释标明）。
- 未扩散处理评审中的 P3-3（profile getter 可变性）、P3-4（账本/版本硬化）等其他建议。
- 未提交/推送。
