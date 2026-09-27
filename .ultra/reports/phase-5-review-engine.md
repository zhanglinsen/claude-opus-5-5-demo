# D 波独立审核 — Game 接线（引擎接线域）

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 443433ab-6eec-443f-bb48-990c67e5e364，事件 `.ultra/dispatch/logs/phase-5-review-engine.jsonl`，提示 `phase-5-review-engine-prompt.md`）

审核完毕，证据链齐全。以下为完整报告。

---

# D 波 Game 接线 独立审核报告（引擎接线域）

## 结论：**REQUEST_CHANGES**（2 × P2，无 P1）

接线总体质量高：投掷物引擎替换经我独立探针证实数值等价（9 场景 max |Δ| = 8.9e-16）、烟雾/闪光接缝与契约一致、练习靶点逐坐标核实可站立、全量单测 211/211 真实通过。但存在两处 P2：**objectiveActions 记账语义膨胀且可刷 XP**（安/拆包完成与打断都被重复计数），以及 **bots 静默获得全雷包导致自闪/自烟的未声明 AI 行为漂移**。修复前不应过闸。

---

## 逐点核实证据

**1. 投掷物引擎替换等价 — 通过。**
从 `git show HEAD` 提取旧 `updateNades`/`throwGrenade` 忠实转写，与 `GrenadeProjectile` 做逐帧探针（地面滚停 / 撞直墙 / 斜面高抛 × 3 种出手，160 帧）：max |Δpos/vel| = **8.882e-16**，浮点噪声级。反弹公式代数等价已独立推导：旧 `vel += n·(−1.45·vn); vel *= 0.55` ≡ 新 `(v−n·vn)·0.55 − n·vn·0.2475`（均 = 0.55·v_t − 0.7975·vn·n）。重力 14 / 3 子步 / skin 0.07 / rest 条件（ny>0.7、|vy|<1.2、水平×0.8）/ 出手 `dir·16+(0,2.8,0)+a.vel·0.6` 全部与旧值一致（[projectile.js:19-31](cf-transport-ship/src/combat/projectile.js)）。bounce 音效闸门：新 `ev.impactSpeed > 2` 中 impactSpeed 即 |vn|（projectile.js:95），与旧 `Math.abs(vn) > 2` 严格同义；`rest` 事件为纯增量，不改变运动。spin/网格/随机自转留在 game 层（game.js:743、757、765），每命中 `spin *= 0.6` 与旧一致。

**2. effect 分发 — 通过（一处 P3 保真度偏差）。**
`detonate`（game.js:231-237）按 `WEAPONS[id].effect` 分发；`explode`（game.js:769-790）与 HEAD 逐行 diff 仅差注释，HE 结算路径确实未动。flash→`flashbang`（game.js:239-258）对每个存活 actor 调 `computeFlashEffect`，isBlocked 用 `sightBlocked`（起点 y+0.2、长 L−0.3，与 explode 同约定）；blindUntil/blindIntensity 的「更晚到期重置、弱闪取 max」实现与报告一致，出生时清零（actor.js:66）。smoke→`SmokeCloud` + `updateSmokes` advance/过期 splice（game.js:272-285），且 `updateSmokes`/`practice.update` 都只在 `simulate` 内调用——暂停冻结语义正确。

**3. 烟雾视线唯一接缝 — 通过。**
`smokeBlocked`（game.js:219-222）逐团 `cloud.blocksSight`；`WiredBot.canSee`（game.js:36-43）先盲→false、再烟、再 `super.canSee`，**只收窄不放大**；玩家准星角色名同接缝（game.js:1046）。bots.js 全文无 smoke/blind/WiredBot 引用——「bots.js 零改动」属实。无全知：canSee 仍是距离+FOV+射线遮挡（bots.js:288-302），enemyMemory 仅来自可见/受击/听声。e2e 对「被闪 canSee=false→消退恢复」「穿烟 canSee=false→烟散恢复」的断言均为真实翻转（见第 7 点）。

**4. 投掷物轮换 — 通过。**
`cycleGrenade`/`advanceGrenade`（actor.js:244-276）按 `count − usedGrenades` 结算剩余量；出手后 `w.mag=0`、`usedGrenades++`、自动转下一剩余型号（actor.js:200-203），回到已投型号不会复制新雷。滚轮兼容：player.js 的 wheel/Digit4 拦截（player.js:174-181，含「没有手雷了」守卫）与 HEAD:83 逐字一致，零改动即获得轮换；wheel 永不落在当前槽（从 slot±1 起扫），不会误触 cycle。

**5. 练习模式 — 通过。**
`MODES.practice`（modes/index.js:34-41）：time Infinity / respawn 2.0 / checkEnd false / result null；N=0（game.js:316）；`modeOptionsFor` 导出并被 wiring 测试锁定。hitScan 修正在场：`maxDist = min(range, wall('move').t − 0.07)`、仅玩家、排除近战/投掷物、`maxDist > 0` 守卫（game.js:626-630）。靶点抽查全部落在可站立区：
- 运输船：ts-bl-hold/ts-mid-hold/ts-bl-lane 与 `ai.holds[4]/[2]/[3]` **精确同坐标**，GR 两点为对称镜像；ts-bow (31.5,0) 在主甲板碰撞体（`solid(0,-0.5,0,90,1,30)`，顶面 y=0）之上，该处无其他 solid（±26 以上仅 x=36.6/37.6 舷墙）。
- 沙漠灰：dg-b-site (−36,−23) = 导航节点 bs3、dg-underpass (−14,4) = un2、dg-bl-spawn (−3,32) = bl2 **逐坐标一致**（节点经 97/97 可达验证）；dg-a-platform 基底 y=3.8−1.2=2.6 = `UPPER` 常量且落在 aPlatform 顶面 (x 34..44, z −38..−18) 内；dg-a-pit 基底 = −1.8 = `PIT` 且在 pitFloor 范围内。dg-mid 由 e2e 实弹命中实证可达。

**6. 档案接线 — 通过（记账语义除外，见 P2-1）。**
`init` 构造 `createProfileService({ storage: acquireStorage(), legacyPrimary: opts.primary })` + adapter，向下只传 adapter（game.js:68-70）。发分：仅 endMatch 一个调用点（playing/ended 双守卫）+ `awardProfileResult` 模式白名单 + service ledger 去重三层；key = `${mode.id}:${matchId}`，matchId 每局开局重生成（时间戳 36 进制 + 6 位随机，game.js:304），重开不撞键；练习三重不可达（mode 检查 / endMatch 不可达 / service `AWARDABLE_MODES`）。`objectiveCommand` 排除 dropBomb、`actorId === (this.player && this.player.id)` 对 player.id=0 严格等值正确（id0 教训已吸收）。出生主武器 `o.primary || loadout().primary`、雷包 loadout 在前 + CATALOG 补齐（game.js:186-193、313）。adapter `awardMatch`/`setPresetSlot` 透传与 adapter 报告一致。

**7. 测试与 e2e — 真实数字。**
`node --test tests/unit/wiring-modes.test.mjs` → **3/3 pass**。全量：`node --test tests/unit/*.test.mjs` → **211 tests / 211 pass / 0 fail**。注意：`node --test tests/unit/`（目录形式）在 Node v26.7 下会把目录当单文件报假失败——报告如以此方式复跑会误判，建议统一用 glob。e2e-wiring 15 项断言逐条实读，**非空洞**：练习为真实 `fireWeapon` 零散布实弹路径打靶（含 aim 解算）；闪光断言「致盲期 canSee=false（4m 正对，super.canSee 本应为 true）→ `g.time += 5` 后恢复」是真实状态翻转；烟雾断言含几何判别（穿越 blocked / 旁路 6.8m 畅通）与烟散恢复；档案断言含同 key 重放拒绝。setup 干预（`__bombPlace`/暂停手动推进）只锁几何不代偿结算，披露诚实。**未复跑浏览器 e2e**（审核权限仅限 node --test / node --input-type=module，如实披露）。

**8. 越界核对 — 通过。**
`main.js` 零 diff（报告 §5 属实）。actor.js diff 全部为 D 授权内容（blindUntil/blindIntensity、grenadeBag/usedGrenades、cycle/advance、spawnGrenades 注入；其中 killY/spawnYFallback 两处属 phase-2 波次）；modes/index.js diff 为 bomb（phase-3）+ practice/modeOptionsFor（D）。bots.js/player.js 全文无任何 D 产物（无 smoke/blind/WiredBot/轮换逻辑）——「bots.js/player.js 零改动」内容级属实。registry.js 的 74 行 diff 混含 phase-2 沙漠描述符与 D 的 practiceTargets（工作树全波未提交，git 无法分波；内容与各波报告一致）。

---

## 缺陷列表

**P2-1 objectiveActions 记账膨胀且可刷（XP 完整性）**
- [game.js:514-522](cf-transport-ship/src/game.js) 把「`BombSession.command` 返回 true」当作目标行动，但 command 只做**类型收口**、对 `stopPlant`/`stopDefuse` 同样返回 true（[bomb-session.js:59-63](cf-transport-ship/src/modes/bomb-session.js)）。
- [player.js:19-36](cf-transport-ship/src/player.js) 在**安包成功后**（carrying 翻转）会补发 `stopPlant`、在拆包完成/打断后同样补发 `stopDefuse` → 每次成功安包/拆包被记 **2 次**；打断的尝试也各计 1 次。
- 更严重：在已安包旁连点 E，每次点按 = startDefuse+stopDefuse = 2 个「行动」，而 `perObjective = 50 XP`、上限 10 行动（[rank.js:19-26](cf-transport-ship/src/profile/rank.js)）→ 一场可不动手刷满 **500 XP 目标分**，违背规格「XP 来自 objective actions（完成语义）」与档案反刷设计。建议改为从 match 事件（bombPlanted/bombDefused 的玩家归属、pickup 事件）记账，或至少在 game.js 白名单 `['startPlant','startDefuse','pickupBomb']`。

**P2-2 bots 静默获得全雷包：自闪/自烟的未声明 AI 行为漂移**
- [game.js:186-193](cf-transport-ship/src/game.js) 对非玩家也做 CATALOG 补齐 → 每个 bot 出生带 he+flash+smoke 各 1（HEAD 时代只带 1 HE，已从 `git show HEAD:src/actor.js` 证实）。bots.js `combatUpkeep` 只查 `inv[3].mag > 0`（[bots.js:309-311](cf-transport-ship/src/bots.js)），投掷瞄准始终指向 lastSeen——第 2/3 次 nadePlan 会投出闪光弹：`flashbang` 无队伍豁免（game.js:242-247 对所有存活 actor 生效），bot 正对爆点 → **自盲最长 3s**（WiredBot.canSee=false 期间完全失能）并闪瞎同队与玩家；烟雾投向敌人则挡住己方视线 12s。每 bot 每条命最多 3 投（nadeT 25-50s 冷却），频率有限但每场必然发生且 e2e 无覆盖。接线报告 §1.7 只论证了玩家侧语义。建议：bots 雷包收窄为 `['he']`（grenadeBagFor 一行），或 combatUpkeep 加型号意识；这是需要明确决策的行为选择，不应以副作用形式上线。

**P3-1 闪光观察者用脚底坐标**
[game.js:244-248](cf-transport-ship/src/game.js) 传 `observer.pos = a.pos`（脚底），距离与遮挡都按脚底结算；explode 用 `chestWorld`（game.js:780）。腰高掩体会错误挡住闪光（眼能看见却被判遮挡 → 不致盲）。建议传 `a.eye()` 或 chestWorld。

**P3-2 更晚到期的弱闪会下调已有强致盲强度**
[game.js:251-256](cf-transport-ship/src/game.js)：新闪到期更晚时 `blindIntensity` 直接重置为新（可能更弱）值。因 duration=3×intensity，该窗口很小，但 intensity 一律取 max 更正确且成本相同。

**P3-3 烟雾视觉半径小于规则半径**
视觉球 `radius*0.8 ≈ 2.8m`（game.js:262-266），而 `blocksSight` 按规则半径 3.5m 判定（grenade-effects.js:123-126）——视线在可见烟体外缘 ~0.7m 即被挡，玩家可能感觉「没进烟却被挡视线」。建议对齐或注释为有意余量。

**P3-4 e2e-wiring 两处小瑕疵（测试自身，非产品）**
[scripts/e2e-wiring.mjs:121](cf-transport-ship/scripts/e2e-wiring.mjs) `drain` 定义后未使用（死代码）；:180-189 的「不复制已投型号」断言先清空 `usedGrenades` 才让 he 回到轮换环——实际验证的是清账后的轮换序与记账键存在性，措辞与验证内容有出入（防复制本体由 `makeGrenadeState` 的 `count − used` 语义与 `heSlotAfter==='flash'` 断言覆盖，结论不受影响）。

---

## 非阻塞建议

1. 闪光/烟雾落地音复用 `playGrenadeBounce`（game.js:241、270）——报告已列音频层后续项，保持跟踪即可。
2. 练习模式投掷物命中靶可走 `rt.registerHit`（practice 报告可选接缝），当前未接属合规选择。
3. 本波全部工作未提交，「先红后绿」时序无法从仓库复现（无历史）；建议尽快做波次基线提交（adapter 报告 §5 已提同类建议），否则后续审核只能做内容级归属。
4. `fireWeapon` 在练习模式每发两条射线（traceBullet + 练习墙面测距），量级可忽略，E 波性能收敛时顺带确认即可。
5. 复跑全量单测时统一用文件 glob（`node --test tests/unit/*.test.mjs`），避免 Node 26 目录参数的假失败误导报告数字。