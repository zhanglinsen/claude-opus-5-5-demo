# 独立审核（新上下文，只读）— cf 手机端适配

你是**独立审核者**。你没有参与实现，请带着怀疑读代码。**你不能修改任何文件**（没有写权限）；你的产出就是最终回复里的审核报告。

## 背景
当前目录是一个 git worktree，分支基于 `claude/cf-mobile-adaptation-plan`，包含 cf-transport-ship 手机端适配的全部实现。请依次阅读：
1. `.ultra/specs/mobile-adaptation-20260930.md`（现状评估与硬约束 **US-M06：不能影响性能优化任务**）
2. `.ultra/mobile-adaptation/dispatch/contract.md`（模块契约）
3. `.ultra/mobile-adaptation/reports/L8-report.md`（HUD 部分的已知局限）

## 审核对象
`git diff perf-integration-20260929...HEAD -- cf-transport-ship/`（只看 `cf-transport-ship/` 下的改动；`.ultra/` 是计划文档）。用 `git diff --stat` 先看全貌，再逐文件读。重点文件：
- `src/touch.js`（输入层，被重写）
- `src/mobile/{layout,index,menu,lifecycle,orientation,fullscreen}.js`
- `src/style.css` 末尾的 `mobile:begin … mobile:end` 块，`src/index.html`，`src/i18n/catalogs.js` 的 `touch.*` 新增键
- `scripts/check-mobile-isolation.mjs`
- `tests/unit/mobile/`（全部）

## 你要回答的问题（按重要性）
1. **桌面路径是否真的零变化？**（性能任务在同机比较帧耗时，任何桌面回归都不可接受）逐一核对：`touch.js` 在 `enabled` 为假时是否早返回且不访问 DOM；`style.css` 块内每条规则是否都以 `html.is-touch` 开头或位于 `@media (pointer:coarse)` 内；`index.html` 与 `catalogs.js` 的改动是否只影响移动端；是否有任何改动落在性能任务的禁区文件（`hud.js effects.js physics.js game.js render.js env.js player.js actor.js weapons.js bots.js audio.js`、`ai/`、`combat/`）。
2. **正确性缺陷**：触摸追踪（摇杆/视角/按钮）的竞态；`touchcancel`/`blur`/`orientationchange` 后是否仍有状态残留；`requestPause` 与广告暂停（`adPaused`）、玩家暂停的交互；`lifecycle.js` 的音频挂起/恢复顺序；`orientation.js` 的定时器与遮罩是否有泄漏；事件监听是否会重复注册或泄漏；`destroy/detach` 是否幂等。
3. **测试质量（重点）**：这个项目里已经两次发现“测试自己会静默失效或被绕过”（例如跳过条件永远为真、正则只看行首被同行夹带绕过）。请专门找**假绿**：永远为真的断言、被吞掉的异常、`skip` 条件恒真、断言过宽、只测了桩而没测真实路径、mock 掉了被测逻辑本身、测试之间有共享状态。指出具体测试与理由。
4. **平台与浏览器陷阱**：iOS Safari / Android Chrome 上可能与桌面 Node 桩不一致的行为（`touch-action`、`passive`、合成鼠标事件、`env(safe-area-inset-*)`、`100dvh`、Fullscreen API、`orientationchange`、`visibilitychange` 与 `pagehide`、AudioContext 的 `interrupted`）。区分“代码上确定有问题”与“需要真机确认”。
5. **契约与所有权**：各模块是否遵守契约（导入无副作用、特性检测、`detach` 幂等、不覆盖广告暂停、不自动继续）。
6. **i18n**：zh/en 键是否对等；新按钮文案是否随语言切换更新。

## 允许的命令
`git diff`、`git log`、`git show`、`git status`；`nice -n 19 node --test --test-concurrency=1 cf-transport-ship/tests/unit/<文件>`（只能跑测试，不能改文件）；`ls`、`cat`、`Read`/`Glob`/`Grep`。**不要**运行构建、浏览器、playwright、`accept-*`、`e2e*`、`bench-*` 脚本（性能任务在独占 GPU），不联网，不安装依赖。

## 输出格式（最终回复，中文）
1. **结论**：一句话——可否作为合并候选，有几条阻断项。
2. **发现列表**，按严重程度排序（阻断 / 重要 / 建议），每条包含：`文件:行号`、问题一句话、具体触发场景（输入→错误行为）、你如何确认的（读了哪段代码或跑了哪条命令）、建议修法。
3. **需要真机/浏览器确认的项**（与“代码确定有问题”分开）。
4. **你检查过且认为没问题的重点**（简短，说明依据），避免重复劳动。
5. **对测试的评价**：哪些测试可信、哪些可能假绿。

不要编造：没读过的文件不要评价；没运行过的命令不要说“测试通过”。发现不确定时写“不确定”并说明还需要什么信息。
