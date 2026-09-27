你是 GLM-5.3-Flash HIGH，继续原 D 波 HUD 会话，处理审核路由的 HUD 侧定向修复。并行有接线会话在改 game.js/actor.js/e2e-wiring.mjs/e2e-hud.mjs（无交集，但你的 P3-6 依赖其 game.js 侧修复，先做其余项）；你只编辑 `cf-transport-ship/src/hud.js`、`src/style.css`、`tests/unit/hud-*.test.mjs`、报告 `.ultra/reports/phase-5-hud.md`（勘误）与新报告 `.ultra/reports/phase-5-hud-fixes.md`。不改 game.js/player.js/touch.js，不提交，不调用子代理。

审核依据：`.ultra/reports/phase-5-review-hud-profile.md`（P3-1/P3-2/P3-3 勘误/P3-4/P3-5；P2-1 与 P3-6 的 game.js 根因由并行会话处理）。

修复清单：
1. **P3-1**：`updateNadeInfo` 每帧 innerHTML 重写 → 缓存上次序列化结果，仅变化时重写（与练习 chips 同纪律）。
2. **P3-2**：`endAward` 同样缓存，ended 后相同字符串不重写。
3. **P3-4（产品决策，协调者裁定）**：暂停菜单可读性优先——把 `#pause` 的 z-index 提到 `#blind` 之上（白屏在暂停菜单下层，菜单可读；恢复后白屏继续）。样式层解决。
4. **P3-5②**：URL 非法/不支持 mode 时菜单高亮与实际开局模式不一致——在 `setMapInfo`/高亮计算处按 `effectiveMode(opts, mapDesc)` 渲染即可保持一致（effectiveMode 已是纯函数；若 URL 覆盖发生在 game 侧读 opts 之前，接受残余差异并在报告注明，不越界改 game.js）。
5. **P3-6 UI 侧**：接线会话修好 PracticeRuntime.current 初始化后，面板初始渲染自然有值；你只需确认初始空态不报错（防御性渲染）。
6. **勘误**：phase-5-hud.md §1.4「两者都经 onSwitch 同步」与 §4.5「暂停期 HUD 帧不更新」两处与事实不符，修正为审核指出的准确表述（勘误标注，不静默改写历史结论）。
7. 验证：`node --test tests/unit/hud-*.test.mjs` 聚焦 + `npm test` 全量（glob）+ `npm run build`；不重跑浏览器 e2e（并行会话在跑，避免写 artifacts 竞争；你的改动由接线会话的 e2e-hud 与后续复核覆盖）。
8. 报告写每项修法与验证。
