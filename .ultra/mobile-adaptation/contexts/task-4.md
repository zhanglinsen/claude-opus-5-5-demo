# Task 4: 触屏菜单与动作补全

Status source: `../tasks.json`, task `4`. Do not maintain another status field here.

## Context
What: 触屏增加“菜单（暂停/继续/退出）”“记分板”“配装”“检视”“1–4 槽位”入口；“镜”键镜像右键（开镜 + 近战重击）；开火键镜像左键（死亡后切换观战队友）。
Why: 规格 E1/E2/E8。目前触屏进入对局后无法暂停、退出、看比分、换配装，这是“不能完整地玩”的最大缺口。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。只改 `src/touch.js`、`src/mobile/layout.js`、`src/i18n/catalogs.js`（只增键）、`src/style.css`（标记块内）。**不改 `game.js`/`hud.js`/`player.js`**。

## Implementation
Target files:
- `cf-transport-ship/src/touch.js`、`src/mobile/layout.js`
- `cf-transport-ship/src/i18n/catalogs.js`：新增 `touch.menu`、`touch.board`、`touch.loadout`、`touch.inspect`（zh/en 各一，键集合保持对等）。槽位 `1–4` 与 `☰` 为语言无关符号，不进目录。

Existing pattern: `touch.js:54`（E 键：`pressed.add` + `keys.add`，抬起 `keys.delete`）、`touch.js:36-46`（`i18nBtn`）。

Technical notes:
- 暂停：`g.pause()`（`game.js:574`）。仅在 `g.playing && !g.paused && !g.ended` 时调用；继续走现有 `#btnResume → g.resume()`（`game.js:579`），触屏下 `lock()` 直接置 `locked=true`（`game.js:558`），无副作用。暂停时 `pause()` 已会 `hud.scoreboard(false)`。
- 记分板：**切换**而非按住（拇指不便长按）。开启注入 `p.keys.add('Tab')`，关闭 `delete`；`game.js:1258` 读取 `keys.has('Tab')`。暂停/结算时自动关闭。
- 配装 `p.pressed.add('KeyB')`（`player.js:204`）；检视 `KeyF`（`player.js:197`）；槽位 `Digit1..4`（`player.js:171`）。
- “镜”：按下 `mouse.r=true; mouse.rp=true`，抬起/取消 `mouse.r=false`——与右键一致，步枪走 `altPressed` 开镜（`actor.js:177`），刀走按住的 `alt` 重击（`actor.js:191`）。开火按下额外置 `mouse.lp=true`，使死亡观战可切换队友（`player.js:127`）；存活时 `lp = mouse.lp || touch.firePressed`（`player.js:193`）为“或”，不会重复开火。
- **兼容约束**：现有 6 个本地化按钮必须保持在 `_labeled` 且顺序不变（`touch-i18n.test.mjs:81-82,125-126` 对其做完整 `deepEqual`）。新按钮登记到独立的 `_labeledExtra`，`applyLocale()` 同时遍历两个列表。构造期新增的浏览器 API 访问同样需特性检测。
- 摆放：初始放在 `layout.js` 的 `sideRail` 区（右侧竖排，避开开火/跳/蹲主区）；与 HUD 的避让由任务 8 校准。
- ⚠️ 触屏按钮在大厅/结算界面是否可见待任务 9 在浏览器中确认；本任务保证无论可见与否，点击都被 `playing` 守卫挡住，不会误操作。

Effort/complexity rationale: 0.5–1 天；假设 HUD 已有 `#pause`/记分板 DOM 可直接复用；复杂度 5。

## Acceptance
- 任务 2 的用例 6–8 转绿。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/touch-i18n.test.mjs tests/unit/i18n.test.mjs tests/unit/game-i18n.test.mjs tests/unit/hud-i18n.test.mjs tests/unit/mobile/touch-menu.test.mjs` 全绿（现有测试无修改）。
- 边界：暂停期间点击其它触屏按钮不产生输入；zh/en 切换即时刷新新按钮文案；爆破模式 C4/E/G 显隐逻辑不变。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M01`
Story IDs: US-M01
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格评估 E1/E2/E8。

## Completion
完成于 2026-09-30，提交 `97ca674`。
- 证据：`menu-module` 11 项 + `touch-menu` 端到端通过；`touch-i18n / i18n / game-i18n / hud-i18n` 兼容契约测试全绿。
- 实现：menu ☰（`requestPause`）、记分板（**切换**，开启期间才起 250ms 计时器，暂停/结算自动关，避免恢复后残留 `Tab`）、配装 `KeyB`、检视 `KeyF`、槽位 `Digit1-4`；全部被 `isPlaying()` 守卫。新按钮进 `_labeledExtra`，既有 6 个本地化按钮顺序不变。
- 读码确认（回答本任务原先的 ⚠️）：`#touch` 在 `#hud` 内部，所以触屏按钮只在对局 HUD 可见时才出现，大厅/结算界面不会露出。
- 未验证：按钮观感与热区、英文长文案（INSPECT/SCORE）在 44px 圆里是否溢出。
