# cf-transport-ship 手机端适配计划（2026-09-30）

## 范围与基线

- 范围：仅 `cf-transport-ship/`（沙漠灰 / 运输船双地图，含 offline / y8 / gamemonetize 三个构建目标）。`pelican-bike/`、`qq-speed/` 不在本计划内（用户 2026-09-30：当前只处理 cf）。
- 基线：`perf-integration-20260929` 的 `bc8e3e1`（cf 的最新集成代码：对战大厅、设置迁移、触屏多语言、性能优化）。`main` 上的 cf 仍是最初的 one-shot 版本，与最新代码相差约 3 万行，不能作为基线。
- 工作方式：独立 worktree `.claude/worktrees/mobile-adaptation-plan`，分支 `claude/cf-mobile-adaptation-plan`。**用户明确确认之前不得合并**，也不得推送到共享分支。
- 用户原话「当前只支持 pc」与代码不符：cf 已有触屏控件（`src/touch.js`）、`pointer:coarse` 检测、触屏默认低画质、大厅小屏媒体查询和手机横屏冒烟。真实问题是**触屏能进入游戏，但不能完整地玩**，见下方评估。

<a id="US-M06"></a>
## 不影响性能优化任务（硬约束）

用户 2026-09-30：不能影响性能优化任务。性能任务（`.ultra/specs/performance-20260929.md`）正在按“同机、同质量、同种子、同场景”对比帧耗时，且规定浏览器/GPU 由集成者串行占用。本计划据此设定以下规则，它们同时是验收条件：

1. **文件白名单**：移动端改动只允许落在
   `src/touch.js`、`src/mobile/*.js`（新建，仅由 `touch.js` 导入）、`src/i18n/catalogs.js`（只增键）、`src/style.css`、`src/index.html`、`tests/**`、`scripts/accept-mobile.mjs`（新建）、`scripts/check-mobile-isolation.mjs`（新建）、`README.md` 触屏章节，以及本计划自己的 `.ultra/mobile-adaptation/`、`.ultra/specs/mobile-adaptation-*.md`。
2. **禁区（性能任务的热路径与归属文件）**：`src/hud.js`、`src/effects.js`、`src/physics.js`、`src/game.js`、`src/render.js`、`src/env.js`、`src/player.js`、`src/actor.js`、`src/weapons.js`、`src/bots.js`、`src/ai/`、`src/combat/`，以及 `.ultra/tasks/`、`.ultra/specs/performance-*.md`。需要触碰其中任何一个文件时，先停下来问用户，不得自行放宽。
   现状已验证可以做到零改动：暂停用 `game.pause()`/`resume()`（`game.js:574/579`）；记分板/配装/检视/换枪用向 `player.keys`/`player.pressed` 注入 `Tab`/`KeyB`/`KeyF`/`Digit1-4`（与 `touch.js:54` 的 E 键做法相同）；状态清零直接写 `player.touch.*`。
3. **桌面路径逐字不变**：所有新行为仅在 `TouchControls.enabled` 为真时注册；新增 CSS 一律限定在 `html.is-touch` 或 `@media (pointer:coarse)` 之内，桌面渲染与帧循环零变化。由单元测试证明桌面下不注册任何监听、不访问 DOM。
4. **不改画质与渲染**：不改分辨率、阴影、后处理、AI 数量、物理与操作反馈（与性能规格同款约束）。移动端渲染策略见排除项 US-M07。
5. **不占用共享资源**：计划与实现期间不启动浏览器/GPU 渲染、不构建产物、不运行 `bench-*`、`accept-*`、`e2e*`。只允许小范围 Node 单测，且降优先级串行：`nice -n 19 node --test --test-concurrency=1 <文件>`。浏览器验收（任务 9）须等集成者释放浏览器/GPU 且用户同意。
6. **提交与合并顺序**：性能任务落地后再基于其结果 rebase（任务 10）；红测试不得单独进入任何被性能任务拉取的分支；性能实测所用提交不得包含移动端改动。

## 现状评估（读码证据，基线 bc8e3e1，未做任何渲染）

✅ = 读码直接核实；⚠️ = 由代码推断，需真机/浏览器验证。

| # | 结论 | 证据 |
|---|---|---|
| E1 | ✅ **触屏无法暂停、退出到大厅**。暂停只由“指针锁定丢失”触发，触屏模式下 `locked` 恒为真，该事件永不发生 | `game.js:558`（触屏直接 `locked=true`）、`game.js:571`（`pause()` 唯一调用点）；`touch.js` 无菜单按钮 |
| E2 | ✅ 记分板（按住 Tab）、配装（B）、检视（F）、换枪槽 1–4 在触屏上够不着；触屏只暴露开火/跳/蹲/R/切(Q)/镜/C4/E/G | `game.js:1258`、`player.js:171/197/204`、`touch.js:40-55` |
| E3 | ✅ **开火键可能卡住**：按钮只监听 `touchend`，没有 `touchcancel`，系统手势/来电/通知打断后 `touch.fire` 一直为真 | `touch.js:31`；全局 `touchcancel` 只处理摇杆与视角（`touch.js:86`） |
| E4 | ✅ **切后台/失焦不清触屏状态**：`blur` 只清键盘与鼠标，不清 `touch.fire/mx/mz/crouch`；全库没有 `visibilitychange`/`pagehide`，后台不暂停、不静音 | `player.js:95`；grep：src 内 0 处 |
| E5 | ✅ **旋转后副开火键错位**：位置用构造时的 `W()-250` 一次性计算，`resize` 只重排摇杆底座 | `touch.js:41`、`touch.js:26` |
| E6 | ✅ 摇杆不是浮动的：按下点只判 `clientX<0.4W`，位移却相对固定底座中心计算，落点偏离底座就会一开始就“推满” | `touch.js:60/66` |
| E7 | ✅ 页面壳缺失：0 处 `touch-action`、`overscroll-behavior`、`env(safe-area-inset-*)`、`viewport-fit`、`gesturestart`、全屏、`apple-mobile-web-app`、`orientationchange`；viewport 仅靠 `user-scalable=no`。⚠️ iOS Safari 10+ 忽略该值，双击/捏合缩放与下拉刷新是否发生需真机确认 | `index.html:5`、`style.css`；grep：src 内均 0 处 |
| E8 | ✅ 触屏“镜”只发一次性 `rp` 脉冲，近战重击依赖按住的 `alt` 无法触发；死亡观战切队友只认 `mouse.lp`/滚轮，触屏开火走 `firePressed`，无法切换 | `touch.js:46`、`actor.js:191`、`player.js:127` |
| E9 | ⚠️ 游戏内 HUD 只有一组 `@media (max-width:760px)` 收缩规则（按宽度而非触屏）；手机横屏宽度普遍 >760（844×390、932×430）不命中，仍用桌面尺寸，是否遮挡中央视野与触控区需布局验证 | `style.css:304-309` |
| E10 | ✅ 大厅已有 3 组小屏规则（760px、横屏 max-height:520、竖屏 700px）；`accept-lobby.mjs` 已验证 844×390 无溢出 | `style.css:304-343`、`scripts/accept-lobby.mjs` |
| E11 | ✅ 已有手机横屏冒烟：`accept-workflows.mjs` 第 5 段（844×390、iPhone UA、`hasTouch`，点“开火”“跳”）。**未覆盖**：竖屏、更小横屏（如 667×375）、`touchcancel`、暂停入口、旋转、后台、HUD 包围盒 | `scripts/accept-workflows.mjs:64-100` |
| E12 | ✅ 触屏默认低画质已存在，无需再做 | `settings.js:60`、`hud.js:192` |
| E13 | ✅ 单元测试可复用的 DOM 桩已存在 | `tests/unit/touch-i18n.test.mjs`、`tests/unit/bomb-input.test.mjs` |
| E14 | ⚠️ **点按视角区可能误开火**：`mousedown` 挂在 `canvas`（`#ui` 为 `pointer-events:none`），触屏模式下不受 `locked` 判断拦截；而 `touch.js` 的全局 `touchstart` 是 passive，无法 `preventDefault`，浏览器对快速点按合成的 `mousedown` 会走 `mouse.l/lp`。这是浏览器标准的触摸兼容行为，但**尚未在真机/浏览器观察到**（现有冒烟用 `dispatchEvent(TouchEvent)`，不产生合成鼠标事件） | `player.js:97-100`、`touch.js:58`、`accept-workflows.mjs:82-95` |

## 用户故事

<a id="US-M01"></a>
### US-M01 触屏可以完整地玩一局（P0）

作为手机玩家，我能在对局中随时暂停/继续/退出到大厅，查看记分板，打开配装，检视武器，直接选 1–4 号槽，死亡后切换观战队友，并能对近战使用重击。
- 验收：触屏点“菜单”按钮后出现现有暂停界面（`#pause`），“继续”恢复对局、“退出”回到大厅；点记分板按钮显示/隐藏记分板；其余动作与键盘等价。
- 边界：暂停期间 `touch.*` 全部为零；爆破模式的 C4/E/G 按钮显示逻辑不变；新增按钮文案走 `touch.*` 稳定键，中英文即时切换。

<a id="US-M02"></a>
### US-M02 触屏输入稳健且随屏幕自适应（P0）

- 验收：任一触屏按钮被 `touchcancel` 打断后对应状态释放；窗口 `blur`/`visibilitychange`/`orientationchange` 时 `touch.fire/mx/mz/crouch` 清零；旋转或调整窗口后所有按钮按新尺寸重排且不出屏；摇杆改为浮动（以按下点为原点）。
- 边界：多指同时使用摇杆 + 视角 + 开火互不抢占；按钮命中面积 ≥44×44 CSS px；视角灵敏度仍乘 `g.opts.sens`。

<a id="US-M03"></a>
### US-M03 中断与后台生命周期（P0）

- 验收：对局中切到后台、锁屏、来电、页面 `pagehide` 时自动暂停并挂起音频；返回后停留在暂停界面，由玩家点“继续”，音频经用户手势恢复（`audio.js:1197 _resume` 已处理 `interrupted`）。
- 边界：与广告暂停（`adPaused`）互不覆盖；玩家原本已暂停则保持；大厅/结算界面不触发；桌面不注册这些监听。

<a id="US-M04"></a>
### US-M04 视口与页面壳（P1）

- 验收：对局内禁止双击/捏合缩放、下拉刷新、长按菜单、点击高亮；使用 `100dvh` 与安全区（刘海/横条）使控件与 HUD 不被遮挡；竖屏对局时自动暂停并显示“请横屏”遮罩，横屏后由玩家继续；支持全屏的浏览器（Android Chrome、iPadOS）提供全屏按钮，不支持的（iPhone Safari、无 `allowfullscreen` 的 y8/gamemonetize iframe）不显示，并给出“添加到主屏幕”文案；补充 `theme-color`、`apple-mobile-web-app-capable`。
- 边界：`viewport-fit=cover` 是否启用属于需用户确认的决策（见下）；桌面浏览器渲染不受影响。

<a id="US-M05"></a>
### US-M05 小屏 HUD 与大厅补充尺寸（P1）

- 验收：在 844×390、932×430、667×375、800×360（横屏）与 390×844、360×740（竖屏大厅）下，游戏内 HUD（雷达、血量、弹药、击杀信息、准星提示、比分）不与触控区重叠、不遮挡准星附近视野，且无横向溢出；英文文案不出界。规则仅在 `html.is-touch` 下生效。
- 边界：不改桌面 HUD 尺寸；不改 `hud.js`。

## 排除项（不做，原因如下）

<a id="US-M07"></a>
### US-M07 移动端渲染性能与画质策略（排除）

动态分辨率、按设备降低阴影/后处理、减少 AI 数量等。原因：触及 `render.js`/`env.js`/渲染热路径与画质，属于性能优化任务的范围，且性能规格明确禁止用降画质证明优化。需在性能任务结束、用户明确同意后单独立项，并以真机帧率数据为依据。

<a id="US-M08"></a>
### US-M08 个性化触控（排除）

左右手布局、可拖拽/缩放按钮、陀螺仪瞄准、独立触屏灵敏度设置。属于增强项，需要改 `settings.js` 迁移与大厅设置页，先把 P0/P1 做扎实。

<a id="US-M09"></a>
### US-M09 鹈鹕骑自行车 / QQ 飞车的移动端（排除）

用户 2026-09-30 明确“当前只处理 cf”。

## 需要用户确认的决策

1. **基线与合并目标**：本计划以 `perf-integration-20260929@bc8e3e1` 为基线（规划者假设，未经确认）。性能任务落地后 rebase 到其结果；最终合并到哪个分支、何时合并由用户决定。
2. **`viewport-fit=cover`**：启用则铺满刘海屏（需处理安全区，观感更沉浸），不启用则 Safari 自动留出安全区（更稳但有黑边）。建议启用，并在任务 6 内做安全区处理。
3. **竖屏策略**：对局强制横屏（遮罩 + 自动暂停）还是允许竖屏游玩。建议强制横屏，大厅保留竖屏可用。
4. **US-M07 何时启动**：等性能任务结束后由用户决定。

## 验证策略

- **随时可跑（CPU 轻）**：Node 单测，降优先级串行；桌面等价与隔离守卫（任务 1）。
- **需等 GPU 空闲 + 用户同意**：`scripts/accept-mobile.mjs`（任务 9），复用 `serve.mjs` 与 `playwright-core`，沿用 `accept-lobby.mjs` 的 `ok()`/串行单浏览器约定；不改现有 `accept-*` 脚本，避免与性能任务冲突。软渲染帧率低，等待条件沿用 `accept-workflows.mjs` 的模拟时间判断。
- **真机**：iOS Safari 与 Android Chrome 手工清单（任务 10）。本机 `xcrun simctl` 不可用（未装完整 Xcode），无法用 iOS 模拟器；Playwright 的 WebKit 与 Chromium 触屏模拟不能代替真机对 E7 各项的验证。
