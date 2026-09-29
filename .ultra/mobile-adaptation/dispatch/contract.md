# 移动端并发契约（各 lane 只依赖本文件，不依赖彼此的实现）

所有路径相对 `cf-transport-ship/`。规格：`../../specs/mobile-adaptation-20260930.md`（其中 US-M06 的白名单与禁区对每个 lane 都是硬约束）。

## 1. 文件所有权（互斥，冲突即停）

| 文件 | 所有者 lane | 说明 |
|---|---|---|
| `src/mobile/layout.js`、`src/mobile/index.js`、`src/mobile/{menu,lifecycle,orientation,fullscreen}.js` 的**骨架桩** | 已完成（协调者） | 桩只有空 `attach`；各 lane 只替换自己那一个文件 |
| `src/touch.js` | **L3b** | 只有 L3b 能改；其它 lane 通过下面的 `touch` API 使用它 |
| `src/mobile/menu.js` | L4 | 任务 4 |
| `src/mobile/lifecycle.js` | L5 | 任务 5 |
| `src/mobile/orientation.js`、`src/mobile/fullscreen.js` | L7 | 任务 7 |
| `src/index.html`、`src/style.css` 的 `shell` 分区 | L6 | 任务 6 |
| `src/style.css` 的 `input` 分区 | L3b | |
| `src/style.css` 的 `menu` 分区 | L4 | |
| `src/style.css` 的 `orientation` 分区 | L7 | |
| `src/style.css` 的 `hud` 分区 | L8 | 任务 8 |
| `src/i18n/catalogs.js` | **无人再改** | 全部所需键已一次性加好（见 §5）。确需新键：停下，写 BLOCKED |
| `scripts/check-mobile-isolation.mjs` + `tests/unit/mobile/{isolation,desktop-equivalence}.test.mjs` | L1 | 任务 1 |
| `tests/unit/mobile/helpers/touch-dom.mjs` + `touch-{input,menu,lifecycle}.test.mjs` | L2 | 任务 2（端到端红测试） |
| `tests/unit/mobile/helpers/fake-env.mjs`、`layout-geometry.test.mjs` | 已完成（协调者） | 只读；要扩展请新建文件，不要改 |
| `tests/unit/mobile/menu-module.test.mjs` | L4 | 各 lane 自己的模块测试放在自己名下的新文件里 |
| `tests/unit/mobile/lifecycle-module.test.mjs` | L5 | |
| `tests/unit/mobile/orientation-module.test.mjs`、`fullscreen-module.test.mjs` | L7 | |
| `tests/unit/mobile/hud-geometry.test.mjs` | L8 | 在 `layout.js` 之上补 HUD/安全区用例（不改 `layout-geometry.test.mjs`） |
| `scripts/accept-mobile.mjs` + `tests/unit/mobile/accept-mobile-gate.test.mjs` | L9 | 任务 9（只编写，**不运行**浏览器） |
| `README.md` 触屏章节、`.ultra/mobile-adaptation/device-checklist.md` | L10a | 任务 10 的文档部分 |
| `.ultra/mobile-adaptation/reports/<lane>-report.md` | 各 lane 自己一份 | 每个 lane 一定要写 |

要改的文件不在自己名下 → **不要改**，写 `.ultra/mobile-adaptation/reports/<lane>-BLOCKED.md`（症状、需要改的文件、原因）后停止。

## 2. `touch` 对象（TouchControls 实例）的公开 API —— 由 L3b 实现，L4/L5/L7 使用

模块只能通过这些成员与 `touch.js` 交互，不得读写 `touch` 的私有字段，也不得改 `game.js`/`player.js`/`hud.js`/`audio.js`。

| 成员 | 语义 |
|---|---|
| `enabled: true` | `attach` 只在为真时才会被调用 |
| `g` | game |
| `root: HTMLElement` | `#touch` 根节点 |
| `layout` | 当前 `computeLayout` 结果（见 `src/mobile/layout.js`） |
| `player(): Player \| null` | `game.player` 或 null |
| `isPlaying(): boolean` | `g.playing && !g.paused && !g.ended && !g.adPaused`（2026-09-30 审核 A1：广告暂停只停循环不置 `paused`，期间注入的键会在广告结束后补触发，所以必须排除） |
| `requestPause(reason: string): boolean` | **唯一的暂停入口**。守卫：`g.playing && !g.paused && !g.ended && !g.adPaused` 才执行；执行时先 `resetTouchState()` 再 `g.pause()`，返回 true；否则不做任何事返回 false。模块**不得**自己调用 `g.pause()` |
| `resetTouchState(): void` | 清零 `player.touch.{fire,firePressed,jump,crouch,mx,mz}`、`player.touchLook`、`player.mouse.r`，复位摇杆 UI 与触点追踪 |
| `addButton(spec): HTMLElement` | 见下 |
| `labelText(key): string` | 按当前语言取 `touch.*` 文案 |
| `onLayout(fn): unsubscribe` | 每次重排（resize / orientationchange / visualViewport 变化，rAF 去抖）后以 `fn(layout)` 调用 |

`addButton(spec)`：
- `spec.act`：必须属于 `layout.js` 的 `ACTS`（位置由 `layout.items[act]` 决定，`touch.js` 负责定位和重排，模块不自己算坐标）。
- `spec.label`：固定文本（语言无关符号，如 `'☰'`、`'1'`）；`spec.labelKey`：本地化键（如 `'touch.board'`），登记进 `_labeledExtra`（**不进** `_labeled`，因为 `tests/unit/touch-i18n.test.mjs` 对 `_labeled` 做了 6 项完整 `deepEqual`，不可改动）。两者二选一。
- `spec.down()` / `spec.up()` / `spec.cancel()`：分别对应 `touchstart` / `touchend` / `touchcancel`；`cancel` 缺省时回退到 `up`。`touch.js` 统一负责 `preventDefault()`、`stopPropagation()`、identifier 追踪，模块回调里不要处理这些。
- 返回的元素带 `dataset.act = spec.act`，类名 `btn`，位于 `touch.root` 内。
- `spec.hidden`：初始隐藏（`style.display = 'none'`）。

既有 10 个按钮（`fire fire2 jump crouch reload swap scope c4 e g`）也由 L3b 加上 `dataset.act`，供端到端测试用 `[data-act="…"]` 查找。

## 3. 模块规范（`src/mobile/*.js`）

```js
export function attach(game, touch) { /* 注册监听与按钮 */ return detach; }
```
- **导入时不得访问** `window`/`document`/`matchMedia` 等全局；只有 `attach` 被调用时才可以。
- 所有浏览器 API 使用前做特性检测（`document.documentElement?.…`、`window.visualViewport?.…`、`screen.orientation?.lock?.…`），异常吞掉，不得让 `attach` 抛错。
- `detach` 幂等，撤销所有监听、遮罩与订阅。
- 只通过公开字段与游戏交互：`player.keys / pressed / mouse / touch`（Set 与普通对象）。
- 不覆盖广告暂停：`g.adPaused` 为真时不暂停（`requestPause` 已内置）。
- 不自动“继续”：恢复一律由玩家点暂停界面的“继续”。
- 挂接顺序（`index.js`）：menu → lifecycle → orientation → fullscreen；某模块抛错只警告，不影响其余。

## 4. 端到端 `data-act` 命名（L2 红测试与 L4 实现必须一致）

| act | 文本 | 行为（点按） |
|---|---|---|
| `menu` | `☰`（固定），`aria-label` 取 `touch.menu` | `touch.requestPause('menu')` |
| `board` | `labelKey: touch.board` | **切换**：开 → `player.keys.add('Tab')`，关 → `delete`；暂停/结算时自动关 |
| `loadout` | `touch.loadout` | `player.pressed.add('KeyB')` |
| `inspect` | `touch.inspect` | `player.pressed.add('KeyF')` |
| `slot1`…`slot4` | `'1'`…`'4'`（固定） | `player.pressed.add('Digit1'…'Digit4')` |
| `fullscreen` | `touch.fullscreen` | `requestFullscreen({ navigationUI: 'hide' })` + 尽力 `screen.orientation.lock('landscape')` |
| `scope`（既有，**L3b 在 touch.js 内实现，L4 不碰**） | | 按下 `mouse.r = true; mouse.rp = true`；抬起/取消 `mouse.r = false`（镜像右键：步枪开镜、刀重击） |
| `fire`（既有，**L3b 在 touch.js 内实现，L4 不碰**） | | 保持原行为，另在按下时置 `mouse.lp = true`（镜像左键：死亡后切观战队友） |

L4 只负责上表中**新增**的 `menu board loadout inspect slot1-4`；`fullscreen` 归 L7。既有按钮的行为变更一律归 L3b。

## 5. i18n 键（已加好，zh/en 对等；新增文案不得再改 `catalogs.js`）

`touch.menu` `touch.board` `touch.loadout` `touch.inspect` `touch.fullscreen` `touch.rotate` `touch.addToHome`。

## 6. CSS 分区规则（`src/style.css` 末尾的哨兵块）

- 只改自己分区（`/* mobile:<区>:begin */` 与 `:end */` 之间）；不要动别的分区，也不要动块外内容。
- 块内每条规则的选择器必须以 `html.is-touch` 开头，或位于 `@media (pointer:coarse)` 内；桌面渲染零变化。
- `touch-action: none` 只允许出现在 `#c`、`#touch` 上；大厅/暂停等 `.screen` 需要触摸滚动。
- `html.is-touch` 类由 L3b 在 `touch.js` 里于 `enabled` 时加到 `document.documentElement`；iOS 的 `gesturestart` `preventDefault`（禁捏合缩放）与画布 `touchstart` 非 passive 的 `preventDefault`（阻断合成鼠标事件）同样由 L3b 落地，L6 只提供 CSS 与 meta。

## 7. 状态字段（只读参考，来自 `player.js`）

`player.touch = { mx, mz, fire, jump, crouch, firePressed }`；`player.touchLook = { x, y }`（可能为 undefined）；
`player.mouse = { l, r, lp, rp, dx, dy, wheel }`；`player.keys: Set`；`player.pressed: Set`（每帧末清空）。
`game.pause()`（`game.js:574`）停循环并显示 `#pause`；`game.resume()`（`:579`）继续。

## 8. 测试规范

- 位置 `tests/unit/mobile/`（`npm test` 的通配符 `tests/unit/*.test.mjs` 不递归，避免误伤性能任务）。
- 运行：在仓库根目录 `nice -n 19 node --test --test-concurrency=1 cf-transport-ship/tests/unit/mobile/<文件>`。
- 共用桩：`tests/unit/mobile/helpers/fake-env.mjs`（`installEnv`、`makeFakeGame`、`makeFakeTouch`、`press/release/cancel`）。模块测试用 `makeFakeTouch`；不要在模块测试里 import `touch.js`。
- 端到端（`TouchControls` 层）测试由 L2 用 `touch-dom.mjs` 构造；它们在 L3b + L4 + L5 + L7 都合入前**预期为红**。
- 现有测试是兼容契约，**不得修改**：`tests/unit/touch-i18n.test.mjs`、`i18n.test.mjs`、`game-i18n.test.mjs`、`hud-i18n.test.mjs`、`ad-session.test.mjs`。

## 9. 汇报格式

每个 lane 结束前写 `.ultra/mobile-adaptation/reports/<lane>-report.md`：
1. 变更文件清单；2. 实际运行的命令与结果（原样摘要，不编造）；3. 未验证项与风险（明确写“未在浏览器/真机验证”）；4. 与本契约的偏差（没有就写“无”）。
