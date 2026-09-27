# 阶段 5 / D 波 lane 3 — HUD 侧定向修复交付报告

执行：GLM-5.3-Flash HIGH（续原 lane 3 会话，处理 `phase-5-review-hud-profile.md` 路由的 HUD 侧修复）。改动文件：`src/hud.js`、`src/style.css`、`tests/unit/hud-mode.test.mjs`（追加）、`.ultra/reports/phase-5-hud.md`（勘误）。未触碰 game.js/player.js/touch.js/profile/，未重跑浏览器 e2e（并行接线会话在跑，避免 artifacts 写竞争），未提交。

## 逐项修法

### P3-1 `updateNadeInfo` 每帧 innerHTML 重写
与练习 chips 同纪律：以渲染 HTML 串为缓存键（`this._nadeHtml`），仅 `hidden` 状态翻转或串变化时才 `innerHTML` 写入；空列表时仅在仍可见时加 hidden（省掉每帧 classList 写）。计条目数变化、剩余量变化、当前高亮迁移均体现为串变化，语义无损。

### P3-2 `endAward` 每帧重写
同法：`this._endAward` 缓存上次 `awardLine` 结果（含空串），ended 后每帧相同字符串零 DOM 写；新对局 award 清空时经「'' ≠ 上次值」恢复 hidden。

### P3-4 暂停菜单被白屏遮盖（产品裁定：菜单可读性优先）
样式层解决：`#pause{z-index:40}`（#blind 为 30，pauseBox 属 #pause 子树整体抬升）。白屏期间开暂停 → 菜单完整可读可点（pointer-events 本就不受影响）；恢复后白屏按剩余时长继续衰减，无状态改动。

### P3-5② URL 非法/不支持 mode 时高亮与实际开局不一致
新增纯函数 `displayMode(qs, opts, mapDesc)`（hud.js 导出）：URL 的 `mode` 合法且该图 supportedModes 包含 → 优先（镜像 startMatch 顺序）；否则回落 `effectiveMode`（已存合法 → 地图默认）。HUD 构造期快照 `this.qs = new URLSearchParams(location.search)`（与 game 构造期同源），`buildModeSeg` 与 `syncControls` 的高亮统一改走 `menuMode()`。补 4 条单测锁定（URL 优先/非法回落已存/回落默认/qs 异常安全）。
**接受残余差异（不越界改 game.js）**：① startMatch 末段 `getMode` 对未知 defaultMode 兜底 tdm，而 effectiveMode 原样返回该值（审核 P3-5①，当前两图 defaultMode 均合法，无实际影响）；② 若并行会话改动 startMatch 的解析细节（如把 URL 回落写回 opts），以 game 侧为准，本函数需随之对齐——测试已把解析语义锁在纯函数层，改动面小。

### P3-6 UI 侧（练习面板初始空态）
确认防御性成立，无需改动渲染逻辑：`pr.weapon` 恒存在（snapshot 组装），`WEAPONS[null]` → undefined → 武器名空串；按钮高亮经 `pr.weapon.slots[slot]` 与 `WEAPONS[cur]?.slot` 的可选链，null 值全部安全落到「无高亮」。已在 `updatePractice` 加注释声明该空态语义。根因（开局无种子同步）在 game.js 侧，由接线会话修复，修复后面板初始即有武器名与高亮。

### 勘误（phase-5-hud.md，标注式修订）
- §1.4：「两者都经 onSwitch 同步」失实 → 勘误注明 chooseLoadout 出生区即时生效分支不经 onSwitch、主武器路径不同步快照（P2-1/P3-6 根因在 game.js 侧由接线会话处理）；hud.js 内 `practiceSwitch` 的同款失实注释一并改为准确表述。
- §4.5：「暂停期间 HUD 帧不更新」机制表述失实 → 勘误注明 updateHUD 暂停期仍每帧执行，仅 simulate 冻结使 remaining 不减、opacity 恒定；可观察结论不变；并补记 P3-4 的产品裁定与修复。

### 顺带（审核非阻塞建议）
`tests/unit/hud-mode.test.mjs` 增加 1 条交叉校验：`deepEqual(Object.keys(MODES), ENUMS_MODE)`，防未来模式增删时 settings 侧静默失配。

## 红绿与验证

- **先红**：`node --test tests/unit/hud-mode.test.mjs` 首跑 `SyntaxError: ...does not provide an export named 'displayMode'`（fail 1）。
- **后绿（聚焦）**：`node --test tests/unit/hud-*.test.mjs` → **24 pass / 0 fail**（原 19 + displayMode 4 + MODES/ENUMS 交叉 1）。
- **全量**：`npm test` → **216 pass / 0 fail**（211 基线 + 新增 5）。
- **构建**：`npm run build` → `built dist/index.html 946.7 KB`，无错误。
- 按指令未重跑浏览器 e2e；P3-1/P3-2 缓存与 #pause z-index 的运行时表现由接线会话的 e2e-hud 及后续复核覆盖（既有 e2e-hud 断言读的是 innerHTML/class 结果，缓存改写不改变其可见语义）。

## 未处理（路由归属）

- **P2-1 主武器按钮不同步的 game.js 根因**：chooseLoadout 即时生效分支补 `onSwitch(p)`（或等效），由并行接线会话处理；hud.js 侧注释已改为与事实一致。
- **P3-6 的 game.js 侧种子化**：同上。
