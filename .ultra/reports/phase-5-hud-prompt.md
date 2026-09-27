你是 GLM-5.3-Flash HIGH，阶段 5/D 波 lane 3：HUD/样式/触屏整合。你独占 `cf-transport-ship/src/hud.js`、`src/style.css`、`src/touch.js`、`src/settings.js`（仅 ENUMS 增补）与测试 `tests/unit/hud-*.test.mjs`（新/既有聚焦文件）；**不写** `game.js`/`player.js`/`bots.js`/`profile/`/`modes/`/maps。不提交，不调用子代理。

契约来源（先读）：`.ultra/reports/phase-5-wiring.md` §4（HUD 消费契约 8 条）、`.ultra/reports/phase-5-profile-adapter.md` §4、`.ultra/reports/phase-4-visual.md` §5（贴花 renderOrder、low 档预期）、`.ultra/reports/phase-3-ui.md`（既有目标 HUD 结构）。

任务（每片先红后绿，聚焦测试驱动）：
1. **闪光白屏**：消费 `s.blind = { remaining, intensity }`——白色全屏叠加，opacity ∝ intensity × remaining 归一，remaining≤0 隐藏；不遮挡 HUD 关键元素之下的游戏输入。
2. **军衔/档案 UI**：菜单显示当前军衔（rankName/level/进度条=progress）与激活预设（presets().active 高亮）；点击切换调 `switchPreset(i)`（经 game.profileAdapter）；`persistence()==='memory'` 时显示「本地存档不可用，进度仅本次会话有效」；订阅 `onProfileChanged` 刷新，不轮询。结算页消费 `s.award`（xp/rankUp/发分后 rank）。若 adapter 的 setPresetSlot 透传已可用（并行修复中，见 `.ultra/reports/adapter-passthrough-fix.md`，可能尚未存在）可做槽位编辑；不可用则只做展示+切换，槽位编辑留待后续。
3. **菜单模式选择**：用 `modeOptionsFor(mapDesc)`（modes/index.js 新导出）渲染模式分段选择（`.seg data-k="mode"`），并在 settings.js ENUMS 加 `mode`（默认值逻辑：运输船 tdm、沙漠灰 bomb，与 URL ?mode= 优先级对齐——URL 优先）。切图/切模式后经现有菜单保存重载路径生效。
4. **练习面板**：非练习模式隐藏；练习模式显示命中数/总命中、靶位受击高亮列表（targets[].flash>0）、当前武器；可选简单换枪按钮组（调 game.practice.selectWeapon，仅目录内）。触屏同步显隐。
5. **投掷物 HUD**：slot 3 图标按 `inv[3].def.id` 显示 he/flash/smoke 名称与剩余量；4 号轮换高亮当前。
6. **触屏**：练习模式换枪按钮（若做）、模式相关按钮显隐复核；既有爆破 C4/E/G 按钮回归不变。
7. 回归：`npm test` 全量 + `npm run build` + 浏览器冒烟（新增少量：练习面板渲染、闪光白屏出现与消退、菜单模式切换持久化、军衔显示与切换预设）。既有 e2e（bomb 36/general 21/desert 34/wiring 15）必须全过。
8. 报告 `.ultra/reports/phase-5-hud.md`：实现清单、红绿证据、e2e 结果、遗留（如槽位编辑未做）。

容量注意：并行有 adapter 透传修复（profile/ 文件，无交集）；settings.js 只许加 ENUMS.mode 与必要默认值逻辑，勿动其它设置项。
