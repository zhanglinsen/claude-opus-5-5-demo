你是 GLM-5.3-Flash HIGH，实现阶段 3 的输入/HUD lane。通过 CLI 工作，禁止子代理或其它模型。读 `.ultra/reports/phase-3-parallel-contract.md`、`.ultra/tasks/contexts/task-3.md` 和现有 Player/HUD/Touch/HTML/CSS。与 RULES/AI lane 并行；只编辑 `cf-transport-ship/src/player.js`、`src/hud.js`、`src/touch.js`、`src/viewmodel.js`、`src/guns.js`、`src/style.css`、`src/index.html`、新 `tests/unit/bomb-input.test.mjs`、本 lane 报告 `.ultra/reports/phase-3-ui.md`。不要动 game/bots/mode core/map；接口不足报告协调者。

通过 `Game.objectiveCommand(type,actorId,pos?)` 与 `Game.objectiveView(actorId?)` 接入：5 号槽为携带时 C4，包区持包左键按住安放、松开中断；E 拆包优先于拾取；G 丢枪/C4；B 背包准备期即时、交战期下回合（TDM 保持出生区即时/他处复活）；死亡后观战己方存活队友，下回合恢复；HUD 显示地图/报点/轮次/比分/存活/C4 状态与进度提示；触屏有对应目标交互。不要在 HUD 中计算回合胜负或存储规则状态，使用 `HUD.update` 的 `s.objective` 只读视图（由 RULES lane 提供）。

先写少量公开交互失败测试看到 RED，再做最小实现到 GREEN，之后整理。可按输入命令、HUD 可见状态两片 TDD；不要铺大量实现镜像测试。别声称未接通时浏览器已完整可玩。保留运输船 TDM 输入、菜单、画质与触屏行为。不要提交/推送。
