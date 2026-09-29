is_error=false terminal_reason=completed num_turns=51 api_error_status=- assistant事件=101 tool_use=50

审核完成。所有证据收集齐了：全部 28 个改动文件已逐一读过，150 项 mobile 单测 + 5 项 touch-i18n + 60 项既有契约测试全部实际运行通过。以下是审核报告。

---

# cf 手机端适配 · 独立审核报告

## 1. 结论

**可作为合并候选：0 条阻断项，2 条重要项、6 条建议项**。桌面路径零变化与禁区零触碰有可信的机械证据；两条重要项都属于低概率边角（广告期间输入穿透、`mouse.lp` 残留），一行级修法。浏览器/真机验收（任务 9/10）尚未执行，合并前仍须按计划补齐。

## 2. 发现列表

### 重要

**A1. `isPlaying()` 在广告暂停期间为真，触屏输入可穿透到“已冻结”的对局**
- 位置：`cf-transport-ship/src/touch.js:105`（`isPlaying` 不含 `!g.adPaused`）；依据是 `game.js:129` `enterAdPause()` 只置 `adPaused` 并停循环、不置 `paused`，且 `game.js:1092` 注释明言“广告期间冻结模拟（输入已锁）”。
- 触发场景：广告为非全屏形态（横幅/音频类，AdSession 支持 `setAdMuted`，形态取决于平台 SDK）或广告退出瞬间 → 玩家点配装/槽位按钮，`menu.js` 的 `inject()` 直接向 `player.pressed` 注入键；广告期间循环停止、`pressed` 每帧末才清空（`player.js:193-194`），`exitAdPause()` 恢复循环后第一帧补触发——广告前的误触变成广告后的动作（如配装界面突然打开）。同理 `_touchStart` 在广告期间仍会驱动摇杆。
- 确认方式：读 `game.js:125-134/1092`、`touch.js:105/230`、`player.js:193-202`；`touch-menu.test.mjs:24` 只测了 adPaused 下“菜单不暂停”，未测动作按钮注入。
- 建议修法：`isPlaying()` 加 `!g.adPaused`（同步改契约 §2 与 `fake-env.mjs` 的 `makeFakeTouch`，并补一条 adPaused 下动作按钮不注入的测试）。若确认三个构建目标的广告必为全屏 iframe（触摸不可达），可降级为建议并留注释。

**A2. `resetTouchState()` 不清 `mouse.lp`，恢复后可能“走火一发”**
- 位置：`touch.js:47`（`fireDown` 置 `p.mouse.lp = true`）与 `touch.js:118-129`（清零清单里有 `mouse.r`、没有 `mouse.lp`）。
- 触发场景：多指同时按住开火 + 点菜单（或按住开火瞬间切后台）→ `requestPause`/`interrupt` 清了 `touch.fire` 但 `lp` 保持 true，暂停期间循环停止无人消费；玩家点“继续”后第一帧 `player.js:193` 把残留 `lp` 当作一次左键按下 → 枪走火一发。桌面键盘路径 `player.js:95` 的 blur 同样不清 `lp`，属基线既有弱点，触屏把入口加多了一个。
- 确认方式：读上述三处；`touch-input.test.mjs` 用例 2 的断言清单里恰好没有 `mouse.lp`。
- 建议修法：`resetTouchState` 的 `if (p.mouse)` 行改为 `p.mouse.r = false; p.mouse.lp = false;`（`rp` 同理可加），并在用例 2 断言。

### 建议

**S1. `orientation.js:16` iPadOS 13+ 检测失效**：UA 桌面版伪装（`Macintosh`）不匹配 `/iPhone|iPad|iPod/`，iPad 不显示“添加到主屏幕”提示。可补 `navigator.maxTouchPoints > 1 && /Mac/`。
**S2. `menu.js:42` `aria-label` attach 时一次性取词**：语言切换后不更新（按钮文本本身会更新，仅无障碍标签陈旧）；`orientation.js` 遮罩文案在持续显示期间也不刷新（注释已自述“下次显示生效”）。无功能影响。
**S3. `destroy()` 后 window 监听仍在**：`touch.js:85-91` 声明“随页面存活”是合理取舍，但 `destroy()` 移除探针（:314）后任何 resize 都会经 `_scheduleLayout → _safeInsets` 重建探针并给已游离元素写样式。建议 destroy 时置死标志让 `_scheduleLayout` 早返回。
**S4. `menu.js`/`fullscreen.js` detach 后 `touch.js:151` 的 `_placed` 残留已移除元素**：仅无效样式写入，无功能影响；可在 detach 路径提供注销钩子。
**S5. `menu-module.test.mjs:16` 标题写“9 个按钮”实际断言 8 个**：笔误。
**S6. `shell.test.mjs:12` 允许 `MOBILE_BASE` 覆盖基线 ref**：默认值正确，但被误设时“块外逐字相同”会对错误基线断言。建议只在显式 CI 场景允许覆盖。

## 3. 需要真机/浏览器确认的项（与“代码确定有问题”分开）

1. **`.screen`（大厅/暂停/结算）上的双击缩放**：iOS Safari 10+ 忽略 `user-scalable=no`；画布与按钮有 `touch-action:none` + `preventDefault` 双保险，但 `.screen` 故意不设 touch-action（要保留滚动），双击缩放是否发生需真机确认（accept-mobile 的 UNCOVERED 已列）。
2. **`visibilitychange`/`pagehide` 在 iOS 后台的实际触发顺序、AudioContext `interrupted` 恢复**：代码路径按标准写（`audio.js:1197` 处理 interrupted，恢复在用户手势内），行为需真机。
3. **HUD 真实包围盒**：hud-geometry 只验证“声明的盒子”（L8 报告 §5 已自认）；英文文案（GEAR/INSPECT/FULL、比分 `.goal` 的 nowrap）是否溢出、行高是否撑破，必须由 `accept-mobile.mjs` 量。
4. **`orientationchange` 晚于视觉旋转**：`_scheduleLayout` 有 visualViewport resize 兜底，是否够需真机。
5. **Android Chrome `screen.orientation.lock` 在全屏转换期的成败**（拒绝已被吞掉，无风险）。
6. 触控热区手感、准星附近遮挡，需人眼。

## 4. 检查过且认为没问题的重点

- **桌面路径零变化（US-M06 核心）**：① `touch.js:24-25` enabled 为假早返回，`desktop-equivalence.test.mjs` 用 trap Proxy 实测构造全程不碰 window/document；② `style.css` mobile 块外内容与基线**逐字相同**——shell.test 实际执行了 `git show perf-integration-20260929:...` 比对并通过，块内 44 条规则我逐条核对全部以 `html.is-touch` 开头或位于 `@media (pointer:coarse) and (max-width:799px)` 内；③ `catalogs.js` 只增 7 个键、zh/en 完全对等；④ `index.html` 只增 4 行 meta（shell.test 用 `^<meta\b[^<>]*>$` 整行锚定，防住了此前“同行夹带”那类绕过）；⑤ 禁区文件零改动——`git diff --name-only` 全列表核对 + isolation.test“真实仓库”用例（对当前工作区实跑守卫脚本）通过；⑥ `src/mobile/*` 导入零副作用（trap Proxy 实测）。
- **规格 E1–E8/E14 全部落实且有测试**：touchcancel 释放（含 held 防重入幂等）、blur/orientationchange 清零、fire2 改 left 锚点、浮动摇杆以按下点为原点、scope 镜像 `r/rp`、开火置 `lp`、canvas touchstart 非 passive `preventDefault` 且 `.screen` 不拦（E14 的防护依赖 player.js mousedown 挂在 canvas、`#ui` pointer-events:none，均实读确认）。
- **暂停交互**：`requestPause` 守卫矩阵（playing/paused/ended/adPaused）单测覆盖；菜单先关记分板再暂停；`src/mobile/` 内 grep 零处 `pause()/resume()` 调用，恢复一律玩家手动；广告暂停不被 lifecycle/orientation 覆盖（模块测试覆盖）。
- **音频顺序**：suspend 直接挂 ctx 且已 suspended/closed 跳过；恢复走一次性 touchstart capture 手势调 `audio.init()`（幂等、内部 `_resume` 处理 interrupted，实读 `audio.js:217-241/1197` 确认）。
- **泄漏/幂等**：四个模块 detach 均幂等且有测试；orientation 轮询只在竖屏跑（2Hz）、menu 轮询只在记分板开启时跑（250ms），平时零开销；无重复注册路径。
- **层叠关系**：`#touch` 在 `#hud` 内、大厅随 `#hud` 隐藏；`.screen`（z-index:2）盖住触控按钮，暂停时按钮不可点；`#rotateGuard` z-index:1000 盖住暂停界面，竖屏无法误点“继续”。`objBtns` 兼容（hidden 初始 + `hud.js:740` display 切换逻辑未变）。
- **几何**：既有 10 键坐标与旧硬编码逐项相等（`layout-geometry.test.mjs:63` + `touch-input.test.mjs:83`），横屏体验不变；新增按钮 ≥44px、互不重叠、避开准星区在 4 个横屏视口 + 刘海安全区下验证。

## 5. 对测试的评价

**可信（走真实路径，非自证）**：isolation.test（临时 git 仓库端到端 + 真实仓库守卫 + CLI 退出码）；desktop-equivalence（trap Proxy 方法可靠）；touch-input/touch-menu/touch-lifecycle（真实 `TouchControls` + 真实 mobile 模块联动，断言落到 `player` 状态与按钮**内联样式**算出的视口矩形，而非读内部对象）；orientation-module 的“竖屏大厅开局被轮询拦下”“遮罩下继续会被再暂停”是真实场景推演；mock.timers 用于轮询是“真逻辑假时钟”，不是绕过。

**弱点/潜在假绿（均非当前红灯）**：
1. `desktop-equivalence.test.mjs:34-42` 的“导入无副作用”受 ESM 模块缓存影响——若该测试被移到同文件中 `import touch.js` 的测试之后，将静默变空转。当前顺序正确，建议加注释固化顺序或用带 query 的动态 import 绕缓存。
2. `makeEl().dispatch` 直调按钮监听，“按钮触摸经 stopPropagation 不会同时变成视角触点”这一路由关系没有端到端断言，目前靠读码确认（`touch.js:143` 的 `stopPropagation`）。
3. `hud-geometry` 只测声明的盒子——L8 报告与 `test.todo` 已如实声明，属已知覆盖缺口而非假绿。
4. `accept-mobile-gate` 只测门与纯函数（设计如此，任务 9 明确“只写不跑”），浏览器主体一行未跑。

此前项目里出现过的两类假绿（skip 条件恒真、行首正则夹带）这次**没有**再出现；`7d0ca83` 的自查提交也修复了两处。测试间无共享状态（每个文件独立进程、fake-env 有 save/restore、touch-dom cleanup 先 destroy 再还原全局）。

**实际运行记录**：13 个 mobile 测试文件 150 项（148 pass / 0 fail / 2 todo），`touch-i18n` 5/5、`i18n` 18/18、`game-i18n` 12/12、`hud-i18n` 8/8、`ad-session` 22/22，均以 `nice -n 19 node --test --test-concurrency=1` 串行运行。未运行任何浏览器/构建/accept 脚本。