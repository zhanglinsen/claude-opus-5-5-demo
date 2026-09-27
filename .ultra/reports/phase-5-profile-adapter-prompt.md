你是 GLM-5.3-Flash HIGH，阶段 5/D 波 lane 2（提前启动的纯适配部分）：本地军衔与装备的**应用适配层**。你独占 `cf-transport-ship/src/profile/` 现有文件（rank/equipment/repository/service/settings 如需小修）与新文件 `src/profile/adapter.js`（或拆分为多个内聚模块）及 `tests/unit/profile-adapter.test.mjs`；**不写** `game.js`/`hud.js`/`bots.js`/`player.js`/`touch.js`/`modes/`/maps，不提交，不调用子代理。规格：`.ultra/specs/desert-grey.md#profile`（分层、XP 唯一发放、练习不计分、装备仅限真实目录、存储降级）。

现状：`src/profile/` 纯域/仓储/服务已审核通过（12/12 + 完整性审核 APPROVE，见 `.ultra/reports/profile-integrity-review.md`）；`equipment.js` CATALOG 从 weapons.js 推导，现在 grenade 含 `['he','flash','smoke']`（C 波刚加入）。尚无任何 Game/HUD 调用方——本 lane 交付的适配层就是未来的唯一应用接缝，**但浏览器接线仍属后续合流，不要动 Game**。

交付：
1. 新 `src/profile/adapter.js`（或内聚拆分）：
   - `createProfileAdapter({ service, weapons? })`（依赖注入，storage 由 service 负责）：
   - `loadout()`：把激活预设解析为实际出生装备 `{ primary, sidearm, melee, grenades:[...], armor }`——只映射 CATALOG 中真实存在的 id，非法/缺失槽位回退 SLOT_DEFAULTS，绝不产出目录外装备。
   - `awardMatch({ mode, outcome, kills, objectiveActions })`：薄封装 service.applyResult（模式白名单/去重/练习拒绝已由 service 保证），返回 `{ awarded, xp, rank }` 供 Game 在 matchEnded 调用一次；adapter 不重复做白名单，但要在返回值中给 HUD 需要的排名进度。
   - `rankView()`：`{ rankName, level, xp, nextThreshold, progress }`（经 rank.rankProgress）。
   - `switchPreset(index)` / `presets()`：预设枚举与切换（含破坏性输入防护）。
   - 事件通知：简单的订阅回调（onProfileChanged）供后续 HUD/菜单订阅，不做全局定位器。
2. 若审核报告 P3-1（stats 桶垃圾值归一化盲点）可在 profile/service.js 以最小改动修复（normalizeProfile 对 stats 桶数值字段套 bounded 校验），顺手修复并补一条聚焦测试；这是审核建议 1/2 的授权范围（stats 归一化 + 两条归一化测试）。P3-3 的 rank.js 白名单下沉**不在本 lane 范围**（涉及与 service 的职责划分，留给合流时裁决）。
3. 聚焦测试红→绿：loadout 映射（合法/损坏预设/空档回退）、awardMatch 透传语义（tdm/bomb 计入、practice 拒绝、重复键拒绝）、rankView 进度边界、switchPreset 防护、事件通知。
4. 验证：`node --test tests/unit/profile-*.test.mjs` 全绿 + `npm test` 全量回归 + `npm run build`。
5. 报告 `.ultra/reports/phase-5-profile-adapter.md`：API、红绿证据、给合流 worker 的接线契约（Game 何时调 awardMatch、HUD 何时读 rankView、菜单如何 switchPreset、localStorage 降级行为）。
