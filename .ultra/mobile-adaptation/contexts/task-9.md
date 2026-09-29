# Task 9: 移动端浏览器验收脚本（GPU 空闲后执行）

Status source: `../tasks.json`, task `9`. Do not maintain another status field here.

## Context
What: 新增 `scripts/accept-mobile.mjs`，在 Playwright（本机 Chrome、触屏与移动 UA）下覆盖前面所有任务的浏览器可验证部分，包括 E14 的合成鼠标事件、旋转、后台、HUD 包围盒。
Why: 前面任务只有 Node 桩单测；HUD 是否遮挡、点按是否误开火、旋转是否重排都必须在真实页面里确认。现有冒烟只覆盖 844×390 的开火/跳（`accept-workflows.mjs:64-100`）与大厅溢出（`accept-lobby.mjs`）。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06) 第 5 条。**编写脚本本身不占 GPU，运行才占**。运行前必须同时满足：① 用户同意；② 性能任务的集成者已释放浏览器/GPU；③ 设置 `MOBILE_E2E_GPU_FREE=1`。**不改现有 `accept-*`/`e2e*` 脚本**（性能任务也在使用它们）。

## Implementation
Target files:
- 新建 `cf-transport-ship/scripts/accept-mobile.mjs`
- 新建 `cf-transport-ship/tests/unit/mobile/accept-mobile-gate.test.mjs`

Existing pattern: `scripts/accept-lobby.mjs`（`ok()` 断言、串行单浏览器、`startServer`、`CHROME_PATH`、`--out`）、`scripts/accept-workflows.mjs:64-100`（移动上下文与等待模拟时间）。

Technical notes:
- **机械化的门**：脚本启动即检查 `MOBILE_E2E_GPU_FREE==='1'`，否则打印原因并以退出码 3 结束。该拒绝路径不启动浏览器，可以现在用单测验证（`accept-mobile-gate.test.mjs` 用 `child_process` 启动脚本并断言退出码 3，CPU 极轻）。
- 只跑离线目标（`npm run build:offline` → `dist/`，已被忽略）；一次一个页面，`q=low`，`?touch=1&autostart=1`；软渲染帧率低，等待条件沿用“模拟时间越过 `readyAt`”。构建也算占用 CPU，同属该门。
- 视口矩阵：横屏 844×390、932×430、667×375、800×360；竖屏 390×844（大厅 + 对局遮罩）。
- 断言：
  - 每个视口：无 `pageerror`/`console.error`；`scrollWidth ≤ innerWidth`；触屏按钮与摇杆底座在视口内、≥44px、互不重叠；`#radarWrap/#feed/#ammo/#score` 等 HUD 包围盒与触控区、屏幕中央准星区不相交。
  - 行为：菜单按钮 → `#pause` 可见且 `game.paused`；继续 → 恢复；开火按钮 `touchcancel` 后 `touch.fire===false`；`setViewportSize` 旋转后按钮重排；`visibilitychange`（覆盖 `document.hidden` 后派发）→ 已暂停且 `audio.ctx.state==='suspended'`；记分板切换显示/隐藏。
  - **E14**：用 CDP `Input.dispatchTouchEvent`（Chromium 会生成兼容鼠标事件）在视角区点按，断言 `player.stats.shots` 不变；同时点“开火”按钮，断言 `shots` 增加。
  - 触屏按钮在大厅/结算界面的可见性（任务 4 的待确认项）。
- 输出：`artifacts/mobile/`（该目录已被 `cf-transport-ship/.gitignore` 忽略，截图不入库）。
- **无法在此验证的项**：iOS Safari 的双击/捏合缩放、下拉刷新、刘海遮挡、`interrupted` 音频、全屏行为——headless Chromium 不能代替，明确列入任务 10 的真机清单，脚本输出里也要标注“未覆盖”。

Effort/complexity rationale: 0.8–1.5 天编写与调试（不含等待 GPU 空闲的时间）；假设 Playwright 能在本机 Chrome 下用 `hasTouch/isMobile` 与 CDP 触摸；复杂度 6。

## Acceptance
- 现在即可验证：`cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/accept-mobile-gate.test.mjs` 全绿；`node scripts/accept-mobile.mjs`（无环境变量）退出码 3，且未启动任何浏览器进程。
- 获准后验证：`MOBILE_E2E_GPU_FREE=1 node scripts/accept-mobile.mjs --out artifacts/mobile` 全部 `ok`；失败项逐条对应到任务 3–8，不允许通过放宽断言来变绿。
- 若 E14 在真实浏览器里**没有**复现（点按不会开火），在此记录并把任务 3 的对应实现降级为“防御性保留”，不得因此删除该用例的历史记录。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M01`
Story IDs: US-M01, US-M02, US-M03, US-M04, US-M05
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格验证策略；用户“不能影响性能优化任务”。

## Completion
完成于 2026-09-30（脚本已写好；**脚本主体尚未运行**）。GLM 首次执行 21 轮后撞 `400 [1005] exceed quota limit`，无产出，改由协调者完成。
- 证据：`accept-mobile-gate.test.mjs` 13 项通过——没有 `MOBILE_E2E_GPU_FREE=1`（或值不是恰好 `1`）时退出码 3、给出三个前置条件、5 秒内返回、不创建产物目录；未知参数也先按门拒绝；静态检查 playwright 与 serve.mjs 只能动态导入且在门之后；`checkLayout` 等纯函数（含出屏/过小/重叠/进入准星区各失败路径）；脚本引用的 `data-act` 都属于 `layout.js` 的 `ACTS`、引用的元素 id 在 `hud.js`/`orientation.js`/`game.js`/`actor.js` 里真实存在（防止选择器与实现漂移）。`node --check` 语法检查通过。
- **没有做的**：以 `MOBILE_E2E_GPU_FREE=1` 启动脚本——测试里刻意不做（`dist/` 若存在会真的拉起浏览器，占用性能任务的 GPU）。所以 Playwright 部分的选择器、等待条件、`touchscreen.tap` 在软渲染下的时序等**全部未经运行验证**，首次真实运行很可能需要调试。
- 覆盖内容（运行后才有结果）：4 个横屏 + 1 个竖屏视口；触控件与 HUD 真实包围盒；菜单暂停/继续；记分板；touchcancel；E14 及其正对照；旋转遮罩；切后台；竖屏大厅点开始被拦。无法在 headless Chromium 验证的项在脚本末尾与 `device-checklist.md` 里列出。
