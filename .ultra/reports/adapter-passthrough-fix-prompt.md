你是 GLM-5.3-Flash HIGH，继续原档案适配层会话，一个小型授权修复：D 波接线报告（`.ultra/reports/phase-5-wiring.md` §4.7）指出 adapter 缺 `setPresetSlot` 透传，导致菜单↔预设双向同步无法收敛。你只编辑 `cf-transport-ship/src/profile/adapter.js`、`tests/unit/profile-adapter.test.mjs`、报告 `.ultra/reports/adapter-passthrough-fix.md`。不改 game/hud/settings，不提交，不调用子代理。

要求：
1. TDD：先加失败用例（adapter.setPresetSlot(index, slot, id) 透传 service 同名方法：合法修改生效且发 preset 变更事件、非法输入被 service 拒绝且不改状态、返回值语义与 service 一致）→ 红 → 最小实现 → 绿。
2. 透传方法命名与参数顺序与 service.setPresetSlot 完全一致；事件 reason:'preset'。
3. 验证：`node --test tests/unit/profile-adapter.test.mjs tests/unit/profile-core.test.mjs` 全绿 + `npm test` 全量。
4. 报告写红绿证据与 HUD 侧使用说明（参数含义、非法输入行为）。
