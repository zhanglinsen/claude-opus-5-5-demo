# D 波定向修复独立复核 — 引擎接线 + HUD/档案

**复核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 8759fd01-09e7-4d38-94cb-d0d5ae75549f，事件 `.ultra/dispatch/logs/phase-5-fixes-rereview.jsonl`，提示 `phase-5-fixes-rereview-prompt.md`）

复核完毕，证据链闭合。以下为最终报告。

---

# D 波定向修复 独立复核报告（phase-5-engine-fixes / phase-5-hud-fixes）

**复核员**：GLM-5.3-Flash MAX（全新上下文只读，仅 Read/Glob/Grep + node --test / node --input-type=module / git diff）

## 结论：**APPROVE**

两份报告响应的原审核 2×P2（objectiveActions 刷分通道、bots 全雷包）均已按建议方案修复，修法正确、红绿测试真实且经我独立探针证实具有判别力；HUD 侧 P3 修复（缓存/z-index/displayMode）实现属实，勘误为标注式。残留缺陷均为 P3 级（文档性声明超出实际交付、一处边缘场景高亮分歧），不构成过闸障碍。

## 逐项证据

**1. P2-1 完成事件记账 — 通过。**
`objectiveCommand` 已还原为纯转发（[game.js:517-520](cf-transport-ship/src/game.js)），全 src 检索确认 `playerObjectiveActions` 仅在 `onBombEvents` 三个分支自增（game.js:573/577/581），命令通道零计数。玩家归属用 `ev.actorId === (this.player && this.player.id)` 严格等值，player.id=0 无 falsy 陷阱（id0 教训已吸收）。三类事件在引擎侧各恰一次有源码级保证：`bombPlanted` 仅在 live 相位 `plantAt` 发出后相位转 planted（[bomb.js:247-258](cf-transport-ship/src/modes/bomb.js)）；`bombDefused` 在 planted 相位完成即 `endRound`，`progressAction` 完成后清空 action 不可能重复（bomb.js:198-209、231-234）；`bombPickedUp` 受 `pickupable()` 唯一权威判定，拾取后 bomb 不再是 dropped 态（bomb.js:166-172、315-323）。**G丢+E拾循环自由度论证成立**：每次循环需主动按 G+E 产生一次真实拾取事实，且 [rank.js:19-26](cf-transport-ship/src/profile/rank.js) `perObjective 50 × objectiveCap 10` 硬顶把目标 XP 天花板钉死在 500，与合法游玩同顶——原始「不动手刷满」通道确实封死（细节偏差见残留 P3-3）。

**2. P2-2 bots 雷包 — 通过。**
`grenadeBagFor` 非玩家直接返回 `['he']`（game.js:188），玩家侧档案雷种在前 + CATALOG 补齐不变（game.js:189-194）；装配链 `spawnActor → a.spawnGrenades → giveLoadout` 时序正确（game.js:395-396、[actor.js:39-45](cf-transport-ship/src/actor.js)）。e2e-wiring 第 16 项断言真实：读真实对局内 `enemies[0].grenadeBag`（[e2e-wiring.mjs:189、194-195](cf-transport-ship/scripts/e2e-wiring.mjs)），同段玩家侧 `['he','flash','smoke']` 断言保留。

**3. 闪光 — 通过。**
观察者改传 `a.eye(new THREE.Vector3())`（game.js:249）；强度一律 `Math.max`，删除了「更晚到期重置峰值」的下调路径（game.js:254-255）。我用 `node --input-type=module` 独立探针复刻测试假世界：眼位 1.62m 观察者 `blinded:true, intensity:0.687`，脚底 0m（旧实现）`blinded:false`——单测判别力实证成立，旧代码下该断言必红。P3-2 弱闪场景（t=2.9s、until≈4.1、强度保持 1）数值经我推算与 `computeFlashEffect` 公式吻合（duration=3×intensity，半径 16）。

**4. 烟雾 — 通过。**
视觉球 `SphereGeometry(cloud.radius)`（game.js:263）与 `blocksSight` 的 `segmentPointDistance < this.radius`（[grenade-effects.js:123-126](cf-transport-ship/src/combat/grenade-effects.js)）用同一 `cloud.radius`（默认 3.5），观感偏差消除；单测经 `geometry.parameters.radius === cloud.radius` 锁定。

**5. 练习同步 — 通过。**
`chooseLoadout` 出生区即时生效分支改调 `this.onSwitch(p)`（game.js:462）→ onSwitch 统一 vm/切枪音/HUD 槽位/`practice.selectWeapon`（game.js:867-874）；`startMatch` 末尾 `this.practice.current = this.player.weapon.id` 种子（game.js:341，位于 spawn 循环之后、只种 current 不动 slots，与 lane 3 单高亮断言语义兼容）。e2e-hud 新用例是真实点击路径：`page.click('#prGuns button[data-slot="0"][data-w="m4a1"]')` → 玩家实持 + 快照 current + 面板名 + 高亮四重断言（[e2e-hud.mjs:122-132](cf-transport-ship/scripts/e2e-hud.mjs)），若即时分支未生效 waitForFunction 会超时失败——判别力真实。

**6. HUD — 通过（两处注释/措辞残留见缺陷列表）。**
`updateNadeInfo` 以渲染串为缓存键，仅 hidden 翻转或串变化才写 DOM（[hud.js:383-394](cf-transport-ship/src/hud.js)）；`endAward` 同法仅变化时重写（hud.js:374-380）——每帧无条件 innerHTML 重写均已消除。`#pause{z-index:40}`（[style.css:134](cf-transport-ship/src/style.css)，#blind 为 30），菜单可读性优先裁定已注释。勘误为**标注式**：phase-5-hud.md §1.4/§4.5 原文保留、追加「**勘误（2026-09-27 审核 …）**」注明失实点与根因归属，未篡改原结论。

**7. 实跑数字（真实复跑）。**
- `node --test tests/unit/*.test.mjs` → **tests 223 / pass 223 / fail 0**（与 engine-fixes 报告声明一致：基线 216 + 新增 7）
- 聚焦五文件 `wiring-modes / hud-mode / hud-blind / hud-award / profile-adapter` → **51 pass / 0 fail**
- 新增断言内容逐条实读均为真判别（非空洞）：P2-1 两例分别锁「事件记账语义」与「20 轮 start/stop 连点零计数（旧实现实际 80）」；P3-1/P3-2 经我独立探针证实红可复现。浏览器 e2e（wiring 16 / hud 19 / bomb 36）**未复跑**（复核权限仅限 node），仅做内容级核实：e2e-wiring 文件 `ok(` 计 16、e2e-hud 计 19，与报告一致。

**8. 越界核对 — 通过。**
修复标记（P2-1/P2-2/P3-1/2/3/P3-5②/勘误注释）经全 src 检索仅存在于 game.js、hud.js；bots.js/player.js/modes/combat/profile 无任何本轮修复内容（其 diff 属更早未提交波次）。style.css 本轮增量仅 `#pause{z-index:40}` 一行 + 注释。声明改动清单（game.js、e2e-wiring.mjs、e2e-hud.mjs、wiring-modes.test.mjs、hud.js、style.css、hud-mode.test.mjs）与实际修复内容吻合。

## 残留缺陷

无 P1 / 无 P2。以下 P3 不阻塞：

- **P3-1 displayMode「镜像 startMatch」声明过宽，P3-5② 仅部分闭合**（HUD 域）。我用探针实证：URL 携带非法/不支持 mode 且**已存模式合法且该图支持**时，startMatch 实际开局回地图默认（game.js:293-294 的 `requested = qs.get('mode') || o.mode` 使 URL 非法值直接落到 defaultMode），而 displayMode 回落 effectiveMode 取已存值（[hud.js:97-102](cf-transport-ship/src/hud.js)）→ 高亮与实际开局仍不一致（desert-grey `url=dm/stored=practice`：actual=bomb / displayMode=practice；transport-ship 同理 MISMATCH）。这正是原审核 P3-5② 点名的场景；修复实际闭合的是「URL 合法但与已存不同」场景。连带三处失实表述：hud-mode.test.mjs:56 用例注释「高亮与实际开局一致」对该子场景不成立、hud.js:260 注释「回落默认，不跟随已存值」与实现相反、hud.js:94/274「镜像完整解析顺序」过宽。属手输 URL 边缘场景、仅菜单高亮，无玩法影响。
- **P3-2 hud.js:416-417 勘误注释已过时**：仍用现在时写「chooseLoadout 的出生区即时生效分支不经 onSwitch」，而 game.js:462 的修复已落地使该句为假，且与 hud.js:225 注释互相矛盾。纯文档性，建议改为「已由 game.js 修复」。
- **P3-3 G丢+E拾论证的措辞偏差**（engine-fixes 报告 §P2-1）：「每次循环需要……走近包体」不成立——dropBomb 把包落在丢弃者自身坐标（bomb.js:161-163），`PICKUP_RADIUS=2`（bomb.js:40）原地即满足，无需移动。论证的承重部分（每循环需主动按键 ×2 + objectiveCap=10 硬顶）不受影响，但刷取摩擦被高估。
- **P3-4 小项**：hud-fixes 报告称「修复后面板初始即有武器名与高亮」——种子只写 `.current` 不写 slots，初始有武器名、**无**按钮高亮（updatePractice hud.js:407-411 的 slots 可选链落空）；engine-fixes 报告对此语义的表述是准确的，两报告措辞不一致。

**备注**：两波修复仍未提交（沿袭原审核建议 3），波次归属目前只能内容级判定，建议合流后尽快落基线提交。