# D 波定向修复 — 两域审核路由（phase-5-review-engine / phase-5-review-hud-profile）

执行：GLM-5.3-Flash HIGH（D 波接线会话延续）。改动文件：`src/game.js`、`scripts/e2e-wiring.mjs`、`scripts/e2e-hud.mjs`（仅追加用例）、`tests/unit/wiring-modes.test.mjs`（追加用例）。未动 bots.js/player.js/hud.js/modes/；未提交。

前置发现：`src/game.js` 在 node 下可直接导入（audio/settings 全链路均安全），因此 P2-1/P2-2/P3-1/2/3/HUD-P2-1 全部做成 **Game 实例级 node 红绿测试**（fake 协作者注入，不经浏览器），比纯 e2e 行为验证更可回归。

## 逐项修法与证据

### P2-1 目标行动记账（引擎域，REQUEST_CHANGES 主因）
- **修法**：选**完成事件记账**（审核建议的首选方案）。`objectiveCommand` 还原为纯转发（零计数）；`onBombEvents` 新增/扩展三个分支，按引擎事件中的玩家归属各计一次：`bombPlanted {actorId}`、`bombDefused {actorId}`、`bombPickedUp {actorId}`（`ev.actorId === player.id`，与 id0 既有处理一致）。
- **XP 完整性论证**：三类事件由 BombMatch 引擎在**事实发生时恰好发一次**——plant 需持包+包点+3.5s 引导完成（每回合至多 1 次）、defuse 需 GR 引导完成（每回合至多 1 次）、pickup 需 C4 在地面且处于 pickupable 位。**重复点按 E 无法产生事件**（连点只产生 startDefuse/stopDefuse 命令与 started/cancelled 事件，均不计数）→ 旧实现「每次点按 = 2 行动、不动手刷满 500 XP 目标分」的通道被彻底封死。剩余有意的自由度：G 丢弃 + E 拾取循环每次可得 1 次拾取行动，但每次循环需要主动按 G+E 并走近包体，非被动刷取；且 rank.js 的 `perObjective 50 × 上限 10 行动` 硬顶未变（500 XP 本就是合法游玩可达的同一天花板）。一场对局行动总量由回合数（≤13）与携带/掉包次数约束，远低于上限。
- **红绿**：红 2 例（`只计玩家的完成事件` — 实际 0，旧实现无事件记账；`命令通道零计数` — 实际 80，旧实现连点即刷）→ 绿。测试在 wiring-modes.test.mjs，20 次连点 start/stop 断言 0 计数。

### P2-2 bots 雷包收窄
- **修法**：`grenadeBagFor` 对非玩家直接返回 `['he']`（协调者决策：AI 无投掷型号意识、闪光无队伍豁免语义，全雷包会造成自闪/自烟的未声明行为漂移）；玩家侧档案雷种 + CATALOG 补齐不变。
- **红绿**：node 红（bot 实际 `['he','flash','smoke']`）→ 绿（`['he']`；玩家仍 `['he','flash','smoke']`）。e2e-wiring 追加第 16 项断言真实对局内 bot 的 `grenadeBag === ["he"]`（16/16 通过）。

### P3-1 闪光观察者眼位
- **修法**：`flashbang` 的 `observer.pos` 由 `a.pos`（脚底）改为 `a.eye(new THREE.Vector3())`，遮挡（isBlocked→sightBlocked）与距离全部按眼位结算，与 explode 的 chestWorld 语义同级。
- **红绿**：node 红（腰高掩体——"仅遮挡终点低于 1.2m 的射线"假世界——眼可见闪光被误挡不致盲）→ 绿（眼位 1.62m 畅通、正常致盲）。

### P3-2 强度取 max
- **修法**：`blindUntil = max(旧, time+duration)`；`blindIntensity = max(旧, 新)` 一律取 max，删除"更晚到期重置峰值"的下调路径。
- **红绿**：node 红（t=2.9s 的弱闪 until 4.1 重置 remaining 后把强度从 1 下调到 0.4）→ 绿（until≈4.1 且强度保持 1）。

### P3-3 烟雾视觉半径
- **修法**：选**对齐**——视觉球 `SphereGeometry(cloud.radius)`（3.5m，与 `blocksSight` 规则半径一致，非余量方案）；展开动画 `scale 0.25→1` 不变，满展开即规则半径。消除"视线在可见烟体外缘 0.7m 被挡"的观感偏差。
- **红绿**：node 红（视觉 2.8 ≠ 规则 3.5）→ 绿（相等，经 `mesh.geometry.parameters.radius === cloud.radius` 锁定）。

### HUD-P2-1（+P3-6 同根因）练习面板主武器同步
- **修法**：`chooseLoadout` 出生区即时生效分支的手写 `vm.equip + hud.slots` 替换为 `this.onSwitch(p)`——统一第一人称视装/切枪音/HUD 槽位/**练习运行时 selectWeapon** 同步；离出生区分支不变（仅记偏好，复活生效走 spawn→onSwitch 现役路径）。P3-6：`startMatch` 末尾 `this.practice.current = this.player.weapon.id` 种子同步面板初始武器名（只种 current，不占用按钮高亮的槽位语义——若经 selectWeapon 种子会把出生主武器按钮也点亮，改变 lane 3 既有单高亮断言语义，故按审核原文只初始化 current）。
- **红绿**：node 红（chooseLoadout 后 practice 同步记录为空 `[]`，面板停留旧枪）→ 绿（`['m4a1']`）。
- **e2e-hud.mjs 追加 1 例（真实点击路径）**：练习模式点 `#prGuns button[data-slot="0"][data-w="m4a1"]` → 玩家实持 m4a1 + `practice.snapshot().weapon.current==='m4a1'` + `#prWeapon` 显示 M4A1 + 按钮高亮 m4a1。**19/19 通过**（原 18 + 新 1，原军刀用例不受影响）。

### P3-4 e2e-wiring 测试自洁
- 删除未用的 `drain` 死代码；:180-189 断言措辞改为与验证内容一致（"清账后轮换序 he→flash→smoke 各剩余 1"，并注明防复制本体由 `makeGrenadeState` 的 `count−used` 语义与 `heSlotAfter==='flash'` 断言覆盖）。

## 回归结果（全部真实浏览器/node 复跑）

| 项 | 结果 |
|---|---|
| `node --test tests/unit/*.test.mjs`（文件 glob，规避 Node 26 目录参数假失败） | **223 pass / 0 fail**（基线 216 + 本轮新增 7） |
| `npm run build` | `built dist/index.html 946.8 KB` |
| `node scripts/e2e-wiring.mjs` | **16/16**（+1 bots 雷包断言） |
| `node scripts/e2e-hud.mjs` | **19/19**（+1 主武器同步用例） |
| `node scripts/e2e-bomb.mjs`（objective 记账改动必回归） | **36/36** |
| desert/e2e.mjs | 未重跑（投掷物运动手感与地图路径零改动，按任务约定省略） |

## 遗留与勘误

- 审核 P3-1（HUD 报告：updateNadeInfo 每帧 innerHTML）、P3-2（endAward 每帧重写）、P3-4（暂停期 #blind 覆盖暂停菜单的产品确认）、P3-5（URL 非法 mode 的高亮不一致）均属 hud.js/style.css（lane 3 领地）或产品决策，本波未触碰。
- e2e-hud 原军刀用例的 `button.on` 单高亮断言在"多槽位同时持有武器"语义下依赖 slots 不含出生主武器——本修复按审核原文只种 current 保持该语义；若 lane 3 将来改为全槽位高亮渲染，需同步调整该断言。
- 引擎审核非阻塞建议 3（波次基线提交）再次成立：全部工作仍未提交，建议合流后尽快落基线。
