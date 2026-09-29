# 性能 A 路：HUD 每帧 DOM 写优化（lane=hud）

基线 `c40d4bd`，工作树 `/Users/sen/.codex/worktrees/perf-hud/claude-opus-5-5-demo`。
归属文件：`cf-transport-ship/src/hud.js`、`cf-transport-ship/tests/unit/perf-hud.test.mjs`、本报告。

## 调用链确认

- `game.js:1241` 每帧构造状态对象调 `hud.update(dt, s)`，随后 `drawRadar` 与 `scoreboard`（后者仅 Tab 状态变化/每 20 帧）。
- `update` 每帧无条件重写：比分、时钟/目标（`matchHeader` 每帧重新翻译+组合）、生命/护甲、武器名/弹药/备弹/提示（每帧字符串拼接与翻译）、准星 display、命中/槽位 opacity（含恒 0 的重复写）、protect/nameTip、blind、objective 各节点与 C4 弹药覆写。
- `updateNadeInfo` 每帧先翻译并拼出整段 HTML 再字符串比对（P3-1 已有比对但构造无门控）。
- `updateObjective` 是唯一与 `update` 写同一批节点（wName/aMag/aRes/aHint/wIcon）的第二路径：C4 在手时每帧先写武器再整段覆写，即每帧两份写。

## 实改（全部在 src/hud.js）

1. 每帧写缓存：`txt/htm/cls/clsAll/sty` 五个助手（`_txt/_cls/_sty` 三张 Map，元素为键，实例私有），值比较命中即跳过写。`update`/`updateNadeInfo`/`updatePractice`/`updateObjective` 全部改走助手；不变 DOM 写与高频无效派生写去除。
2. 高频派生门控：
   - 计时/目标文案 `_matchTexts`：键 = 语言|模式|目标|整秒，同一秒内不重复调 `matchHeader`（其中含每帧 `modeKeyByName` 扫描与翻译插值）；整秒变化/换模式/换局/换语言自然失效。
   - 弹药提示 `_hintMemo`：条件码+语言记忆，命中/空仓/换弹文案不每帧翻译。
   - 投掷物背包：先比对不含翻译的紧凑键（语言|型号×剩余×当前），翻译与拼 HTML 仅键变化时发生。
   - 准星间距 `_crossGap`：spreadPx 不变时 4 个子元素 style 不重写（开火/移动时仍逐帧跟随）。
   - 触屏目标按钮组 `_objBtnsShown`：状态变化才整组重写。
3. C4 双写路径收敛：`objectiveHud` 视图提升到 `update` 计算一次并传给 `updateObjective(s, oh, c4)`；C4 在手时 `update` 跳过武器块、`updateObjective` 独占弹药区，两路共用同一缓存且每帧互斥——C4 携带稳定帧同样零写，放下 C4 当帧恢复武器信息（缓存值比较自动重写）。
4. 失效与生命周期：
   - 语言切换：`applyLocale()`（LocaleService 订阅回调）新增 `invalidateTextCache()`，清空文本缓存与派生 memo，下一帧动态文案按新语言重写（数值无变化也重写文案）。
   - 新局/模式切换/数据变化：全部为值比较缓存，状态一变当帧重写，无手动失效路径，不会残留旧局 class/文案（测试锁定）。
   - 元素被其他现有路径改写：审计全库后确认比分类/生命/弹药/目标节点只有 `update`/`updateObjective`（两路已共用缓存）与 `slots()`（只重写 innerHTML，缓存只管 opacity，且槽位动画经 sty 逐帧接管）会写；构造器私有缓存随实例销毁，`destroy()` 无需额外清理，无跨实例可变共享。
5. 保持每帧的动画路径：准星间距（变化时）、命中标记衰减、受击方向、闪光白屏 opacity、安放/拆包进度条、槽位淡出、击杀信息淡出——全部逐帧，未降低 HUD 频率；计时精度不变（仍 `matchHeader` 的 mm:ss 取整语义）。

## 红绿证据

- 红（实现前）：`node --test tests/unit/perf-hud.test.mjs` 4 项失败（`_initCaches` 不存在 / 稳定帧断言不满足）。
- 绿（实现后）：`perf-hud` 5 项全过；受影响既有测试 `hud-radar / hud-i18n / hud-mode / hud-award / hud-blind` 共 42 项全过（0 fail）。未跑无关全套。

## 微基准（同桩假 DOM，2000 稳定帧，Node 原生 performance.now）

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 稳定帧 DOM 写 | 26.0 次/帧 | 0 次/帧（基准总 32 次全部来自建帧首帧） |
| update 耗时 | 11.4 µs/帧 | 4.8 µs/帧 |

复现：临时桩脚本（不入库）构造 `Object.create(HUD.prototype)` + 假元素，`git show HEAD:cf-transport-ship/src/hud.js` 作旧实现对照。真实 DOM 下每次写还触发样式失效/布局检查，实际收益大于微基准；FPS 未测，不宣称。

## 限制与移交验证事项

- `prHits`/`objAlive`/`protect` 的翻译函数仍每帧调用（仅命中/计数变化时值才变，DOM 写已由缓存挡住）；若审查认为需进一步削减，可按 `_hintMemo` 同款条件码记忆，未做以控制改动面。
- 语言切换发生在暂停（游戏循环停摆）时，局内数值节点到恢复渲染首帧才重写——与旧行为一致（旧实现也是恢复后下一帧重写），已由 `invalidateTextCache` 保证恢复即新语言。
- 结算页 `endAward` 的语言切换重绘依赖下一帧 update（既有行为，未改）。
- 需集成者在浏览器验证：开火/移动时准星扩散逐帧、C4 携放切换、爆破安放/拆包进度条、闪光/受击指示、locale 切换（菜单与局内）。
