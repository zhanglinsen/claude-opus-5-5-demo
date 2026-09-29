# 通用规则（每个 lane 工作者必读）

你是 cf-transport-ship 手机端适配计划的一个并发 lane 工作者。**当前目录是你独占的 git worktree**，分支已经建好；其它 lane 在各自的 worktree 里并行工作。

## 开工前必读（按顺序）
1. `.ultra/specs/mobile-adaptation-20260930.md`：重点是「不影响性能优化任务（US-M06）」和「现状评估」。
2. `.ultra/mobile-adaptation/dispatch/contract.md`：**文件所有权、`touch` API、模块规范、测试规范**。这是你与其它 lane 的唯一接口。
3. 你的任务上下文与本 lane 提示词（见你的启动提示）。

## 硬规则
1. **只改你名下的文件**（契约 §1）。需要改别人的文件：不要改，写 `.ultra/mobile-adaptation/reports/<lane>-BLOCKED.md`（症状、要改的文件、原因）后停止。
2. **禁区，永不修改**：`cf-transport-ship/src/` 下的 `hud.js effects.js physics.js game.js render.js env.js player.js actor.js weapons.js bots.js audio.js`、`ai/`、`combat/`；`.ultra/tasks/`、`.ultra/specs/performance-*`；`pelican-bike/`、`qq-speed/`。
3. **桌面路径不得变化**：新增行为只在触屏模式下生效，CSS 遵守契约 §6。
4. **只允许运行的命令**：
   - `nice -n 19 node --test --test-concurrency=1 cf-transport-ship/tests/unit/<文件>`（在仓库根目录运行）
   - `node cf-transport-ship/scripts/check-mobile-isolation.mjs`（该脚本存在时）
   - `git status` / `git diff` / `git log` / `git add <你名下的文件>` / `git commit`
   - `ls`、`cat`、`mkdir`
   **禁止**：`npm`、`npx`、任何构建、浏览器、playwright、`accept-*`、`e2e*`、`bench-*` 脚本、联网、安装依赖。原因：性能优化任务正在独占浏览器/GPU 做实测，你的任何占用都会污染它的数据。
5. **TDD**：能先写失败测试就先写（确认红），再实现（确认绿）。测试只放 `cf-transport-ship/tests/unit/mobile/`，文件名用你名下的那个。
6. **现有测试是兼容契约，不得修改**：`touch-i18n`、`i18n`、`game-i18n`、`hud-i18n`、`ad-session` 的测试。完成前运行它们，确认仍然通过。
7. **提交**：只 `git add` 你名下的文件；提交信息用简洁中文；**不要** push、不要切换分支、不要 rebase / merge / reset / stash。
8. **汇报**：结束前写 `.ultra/mobile-adaptation/reports/<lane>-report.md`（格式见契约 §9）。据实记录命令与结果；**不要声称“已在浏览器/真机验证”**——你没有运行过它们。
9. 遇到范围内无法解决的问题：写 BLOCKED 报告并停止，不要绕过任何约束，也不要为了让测试变绿而放宽断言。

## 代码风格
- 与 `cf-transport-ship/src/` 现有代码一致：ES 模块、2 空格缩进、单引号、分号；注释用简体中文，只解释“为什么”。
- 不新增依赖，不引入构建步骤。
