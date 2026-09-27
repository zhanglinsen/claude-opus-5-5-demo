# D 波独立审核 — HUD/样式/触屏 + 档案适配层

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 9ebb2eea-62a2-47c7-8c2f-aab2c956b52a，事件 `.ultra/dispatch/logs/phase-5-review-hud-profile.jsonl`，提示 `phase-5-review-hud-profile-prompt.md`）

# D 波审核报告 — HUD/样式/触屏 + 档案适配层

## 结论：REQUEST_CHANGES

无 P1。核心交付质量高（闪光状态机、adapter 透传、settings 增量、模式解析对齐均实证通过，测试真实数字 48/48 与 211/211），但练习面板主武器换枪按钮存在一个用户可见的状态失同步（P2），且实现报告与代码注释对“经 onSwitch 同步”的声明与事实不符、e2e 未覆盖该路径。需一次小修 + 一条补测后可过。

## 逐点证据

**1. HUD 只读纪律 — 通过。** `updateBlindState`(src/hud.js:73)、`nadeSummary`(src/hud.js:104)、`effectiveMode`(src/hud.js:87)、`awardLine`(src/hud.js:95) 均为纯函数（`updateBlindState` 仅变异 HUD 自有的 episode 状态参数，已注释声明）；无 setInterval/轮询，军衔/预设仅经 `onProfileChanged` 事件刷新（src/hud.js:262-294）；未读任何下划线/私有字段——读的 `p.grenadeBag/p.usedGrenades/p.inv[3]`（src/actor.js:31-45）与接线契约 §4.4 及投掷物记账语义一致。

**2. 闪光叠加 — 通过。** opacity = intensity(夹紧 0..1) × remaining/满时长（src/hud.js:78-82）；更晚到期重置满时长、更弱/更短不重置，与 game.js 的 `blindUntil/blindIntensity` 写入规则（src/game.js:250-256）按“是否更晚到期”逐条对应；`#blind` 为 `#hud` 首子元素、`pointer-events:none`、z-index 30（src/style.css:132, src/hud.js:593）。暂停期白屏停留行为**结论如实**（remaining 随 simulate 冻结、恢复后继续衰减），但报告 §4.5 的机制表述不准确（见 P3-3）。

**3. 军衔/预设 UI — 通过。** `rankView` 渲染满级显示「满级」、progress 夹紧 0..1（src/hud.js:277-278）；switchPreset 经事件重渲染（src/hud.js:289）；`persistence()==='memory'` 文案「本地存档不可用，进度仅本次会话有效」，不宣称已保存（src/hud.js:280, 670）；`endAward` 消费 `lastAward`（发分后 `rankView()` 快照，src/game.js:490-497），`awarded:false` 静默、rankUp「军衔晋升！」前缀（src/hud.js:95-101），单测三条路径均锁定。

**4. 模式选择 — 通过（两处细微不对称记 P3）。** `effectiveMode` 与 `startMatch`（src/game.js:290-294）的“已存合法且该图支持才生效，否则地图默认”语义逐字一致，URL `?mode=` 优先在 game.js 侧（契约如此分工）；settings.js diff 恰为 +5 行（`ENUMS_MODE` 导出、`DEFAULT_OPTS.mode=null`、ENUMS 注册），normalize 对 null/非法枚举回 null 安全；切图回落默认在地图点击处落盘（src/hud.js:205-211），随后 onOption('map') 触发 reload，无高亮滞留问题。

**5. 练习面板 — 一处 P2。** 换枪走真实玩家路径属实：主武器 → `chooseLoadout`、其余 → `weaponUpdate(0.05,{sw:slot})`（src/hud.js:388-393），后者确实经 `onSwitch → practice.selectWeapon` 同步（src/actor.js:158, src/game.js:869）；DOM 仅变化时重写仅对靶位 chips 成立（src/hud.js:381）；非练习 `s.practice=null` 隐藏；按钮 `pointer-events:auto` 触屏可点（src/style.css:150）。但**主武器路径不同步**（见 P2-1）。

**6. adapter.setPresetSlot 透传 — 通过。** `service.setPresetSlot(slotIndex, patch)`（src/profile/service.js:148-155）签名/语义与 adapter 展开形式完全一致：夹紧 0..2、patch 合并后 `normalizePreset`（目录外回槽默认、未知键忽略）、返回冻结预设、始终 `notify('preset')`（src/profile/adapter.js:83-87）。测试锁定：返回值 `Object.isFrozen` 且与 service 状态 deep-equal、未触碰槽位/激活索引不变、loadout 反映修改、事件计数；非法 id/非法槽位名/越界索引/非字符串槽位全部覆盖（tests/unit/profile-adapter.test.mjs:162-208）。

**7. e2e-hud 抽查 — 通过，诚实。** 工件 `artifacts/e2e-hud-results.json` 18/18 与报告一致；闪光断言为真实投掷（4 号键真实轮换到闪光弹 → `firePressed` 出手），0.3× 时率与 intensity 0.18 的放宽在报告 §3 注③如实披露且与 `blindIntensity` 交叉验证；练习打靶走 `fireWeapon` 实弹路径；结算 XP 走真实 `endMatch`（timeLeft=0.01）；URL 优先级非空洞（已存 practice + `?mode=tdm` → tdm）。

**8. 越界核对 — 通过。** settings.js diff 与授权范围逐行吻合；style.css 为纯追加（+51 行中含更早未提交的爆破 HUD 块，属分支累计）；adapter.js 在未跟踪的 `src/profile/` 内，“+7 行”无法用 git 复核但文件内容（109 行）与最小透传一致；touch.js 的 +9 为爆破 lane 的 objBtns（C4/E/G），与 lane 3“零触碰”声明相符；package.json +1（`test:e2e:desert`）非本 lane。

## 真实测试数字

- `node --test tests/unit/profile-adapter.test.mjs tests/unit/profile-core.test.mjs tests/unit/hud-blind.test.mjs tests/unit/hud-mode.test.mjs tests/unit/hud-award.test.mjs` → **tests 48 / pass 48 / fail 0**
- `npm test`（全量）→ **tests 211 / pass 211 / fail 0**（与报告 211 声明一致）

## 缺陷列表

- **P2-1 练习面板主武器按钮：换枪生效但运行时快照/面板 UI 不同步**。`practiceSwitch` 的 slot 0 路径调 `chooseLoadout`（src/hud.js:391），其出生区内即时生效分支（src/game.js:457-461）直接替换 `p.inv[0]` 并置 `p.slot=0`，**不调用 `onSwitch`**；而 `practice.selectWeapon` 全 src 唯一调用点是 `onSwitch`（src/game.js:869）。结果：在出生区点击 AK/M4 等按钮后玩家实际持有新枪，但面板武器名（读快照 current，src/hud.js:377-378）与按钮高亮（src/hud.js:383-386）停留在旧枪；离开出生区则点击完全无效（仅 toast），与练习模式「任意换枪」预期不符。src/hud.js:391 注释「现有换包路径（onSwitch 同步练习运行时）」与报告 §1.4「两者都经 onSwitch 同步」均与事实不符。e2e 只覆盖军刀（weaponUpdate）路径，主武器路径零覆盖。建议修复：`game.chooseLoadout` 即时生效分支改调 `this.onSwitch(p)`（统一 vm/音效/slots/练习同步），或在 `practiceSwitch` 确认换枪实际生效后补 `practice.selectWeapon(id)`；并补一条「点击 AK → 面板武器名同步」e2e。
- **P3-1** `updateNadeInfo` 每帧无条件 `innerHTML` 重写（src/hud.js:370），与练习面板 chips 的“仅变化时重写”纪律不一致；移动端 60fps 下持续重建 DOM。
- **P3-2** `endAward.innerHTML = award` 每帧重写相同字符串（src/hud.js:361，ended 后 updateHUD 仍每帧执行，src/game.js:1004）。
- **P3-3** 报告 §4.5「暂停期间 HUD 帧不更新」不准确：暂停期 `renderFrame → updateHUD` 仍每帧执行（src/game.js:893-902, 1004），只是 simulate 冻结使 remaining 不减、opacity 恒定。可观察结论正确，机制描述错误。
- **P3-4** 暂停时若闪光未消退，`#blind`（z-index 30）绘制于 `#pause` 屏之上，暂停菜单被白屏遮盖（pointer-events:none 不挡点击）。语义可辩护（致盲中），建议产品确认是否接受。
- **P3-5** `effectiveMode` 与 startMatch 两处细微不对称：① defaultMode 为未知值时 game 侧 `getMode` 兜底 tdm、HUD 侧原样返回（当前两图均合法，无实际影响）；② URL 携带非法/不支持 mode 时实际开局回落地图默认，而菜单高亮跟随已存 opts，可能出现高亮与实际模式不一致（URL 属过渡手段，契约已注明）。
- **P3-6** 练习模式开局 `PracticeRuntime.current=null` 且无种子同步（src/game.js:318-321），面板武器名初始为空、无任何按钮高亮，直到第一次真实切枪——与 P2-1 同根因，可一并修复。

## 非阻塞建议

- 增加一行交叉校验测试：`deepEqual(Object.keys(MODES), ENUMS_MODE)`，防止未来 MODES 增删时 ENUMS_MODE 静默失配（当前二者一致，无问题）。
- `practiceSwitch` 可消费契约建议的 `canSelectWeapon(id)` 做提交前校验（当前信任模板内目录，风险低）。
- 主武器 e2e 补测后，建议在报告勘误 §1.4 的“两者都经 onSwitch 同步”表述。