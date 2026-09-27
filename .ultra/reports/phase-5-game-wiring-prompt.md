你是 GLM-5.3-Flash HIGH，阶段 5/D 波 lane 1：Game 接线。三路 C 波模块已全部通过独立审核：投掷物（`src/combat/projectile.js` + `grenade-effects.js`，数值与现役 updateNades/throwGrenade 逐位等价）、练习运行时（`src/modes/practice-runtime.js`）、档案适配层（`src/profile/adapter.js`）。你现在独占 `cf-transport-ship/src/game.js`、`src/actor.js`、`src/modes/index.js`、`src/main.js` 与新测试 `tests/unit/wiring-*.test.mjs`；**不写** `hud.js`/`style.css`/`touch.js`/`player.js`/`bots.js`/`viewmodel.js`（HUD/触屏接线属并行 lane 3，its prompt 已注明分工）；`guns.js`/`viewmodel.js` 模型已就绪勿动。不提交，不调用子代理。

模块契约（必须先读这些报告）：`.ultra/reports/phase-4-combat.md` §D 波接线契约、`.ultra/reports/phase-4-practice.md` §接线清单（注意 P3-4 修正：hitScan maxDist 必须 min(range, 墙面射线距离)）、`.ultra/reports/phase-4-practice-p2-fix.md` §P3-3（bounce 音效需 |impactSpeed|>2 闸门）、`.ultra/reports/phase-5-profile-adapter.md` §接线契约、`.ultra/reports/phase-4-visual.md` §5（lampSpots 顺序语义、贴花 renderOrder）。

接线任务（每片先红后绿，聚焦测试驱动）：
1. **投掷物运动替换**：`throwGrenade` 用 `computeThrowVelocity`；`updateNades` 手写积分替换为 `GrenadeProjectile.step(dt, raycast)`（raycast 适配 'move' 模式）；bounce→音效（带闸门）；fuse→按 `WEAPONS[id].effect` 分发：he→现有 explode（用 computeHeBlast 校准或保留现役结算路径但走事件）、flash→computeFlashEffect（对每个存活 actor 计算致盲强度/时长，引擎侧存 per-actor blindUntil）、smoke→SmokeCloud 列表 + 每帧 advance。三枚投掷物 4 号键轮换（he/flash/smoke 顺序=CATALOG）已在 player 侧？若切换逻辑在 game/actor 层则本 lane 完成。
2. **烟雾挡视线**：AI `canSee` 与玩家可见性判定统一经 `smokeBlocksSight`（grenade-effects 唯一接缝）；运行 bots 既有测试确认无回归。
3. **闪光致盲**：actor 视 `blindUntil`/`blindIntensity` 公开状态；HUD 白屏叠加由 lane 3 消费（写进契约报告）。致盲影响 AI canSee（被闪的 bot 短暂失明）。
4. **练习模式接线**：`modes/index.js` 注册 practice 适配器（respawn/null 语义按规格：无敌军、全图探索、任意换枪）；Game 在练习模式构造 `PracticeRuntime({ spots })`（两地图靶点元数据：从地图公开几何挑安全点，或先在 registry 加练习靶点数组——你独占 registry 相关变更如需）；hitscan 命中处调 `hitScan(origin, dir, min(range, 墙距))`；主循环非暂停分支 `rt.update(dt)`。菜单模式选择（main.js/game 菜单数据）加「练习」选项（两地图均可）。
5. **档案接线**：Game 启动构造 `createProfileService`（guarded localStorage 适配，损坏降级）+ `createProfileAdapter`；出生装备经 `adapter.loadout()`（TDM：出生区立即生效/重生生效按现役规则；爆破：准备期改包下回合生效，交战期同规则——用现役 chooseLoadout/nextPrimary 机制承接，不新增并行状态）；`matchEnded` 时 `awardMatch({key: mode+matchId, mode, outcome, kills, objectiveActions})` 恰好一次（练习不调）；matchId 在开赛生成。
6. 回归：全部既有测试（`npm test` 全量）+ `node scripts/e2e-bomb.mjs` 36 项 + `node scripts/e2e.mjs` 21 项 + `node scripts/e2e-desert.mjs` 34 项必须全过；新增练习模式浏览器冒烟（进得去、能打靶、HUD 快照有数）与投掷物浏览器冒烟（HE 爆炸、烟雾遮挡 AI 视线的行为断言、闪光后 bot 失明行为）。
7. 报告 `.ultra/reports/phase-5-wiring.md`：契约差异与适配决策、红绿证据、e2e 结果、给 lane 3 的 HUD 消费契约（rankView/awardMatch 返回值/blind 状态/practice snapshot/烟雾可视效果）。

容量注意：并行有 lane 3（HUD）与可能的审核会话；只在你的独占文件内工作。若发现必须改对方文件才能继续，停下写进报告交协调者路由。
