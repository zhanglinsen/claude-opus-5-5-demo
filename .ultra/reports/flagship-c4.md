# 旗舰收口 C4：e2e-bomb id0 携包断言根因 + 重开判据校准

日期：2026-09-27。范围：`cf-transport-ship/scripts/e2e-bomb.mjs`、`scripts/accept-restart-check.mjs`、本报告。**引擎零改动**（game.js / actor.js / player.js 未动；env.js 及视觉文件未触碰，归视觉 lane）。未提交 git。

## 1. 根因：开局观察竞态，非引擎状态不一致

原失败（visual-integrate.md §6，3/3 确定性）：`{"pid":0,"team":"BL","carrierId":0,"carrying":false}`——引擎已把包指派给 id0，但 `player.carryingC4` 为 false。

逐点链路核查结论：**引擎侧不存在可见状态不一致，失败是 e2e 在首帧前采样造成的观察竞态**。

- `Game.startMatch()`（game.js:296-378）同步完成：`new Player`（`carryingC4=false` 为构造值，player.js:76）→ `new BombSession` → `session.start()` → `#beginRound()` → `match.startRound(0)` → `match.bomb={carrierId:0}` → `playing=true`。全程无帧等待。
- `objectiveView(0).bomb.carrierId` 直读 `BombMatch.snapshot()`（bomb-session.js:101-123，game.js:545-547）——startMatch 返回后**立即**可见 0。
- `player.carryingC4` 的唯一赋值点在 `Player.update()`（player.js:146，从 objectiveView 每帧派生），由 rAF 帧循环 `simulate()` 驱动（game.js:921）。
- 因此「startMatch 返回 → 首个模拟帧」之间存在**有界瞬态**（≤1 帧）：视图 carrierId=0 而玩家缓存仍为构造值 false。旧断言的 `waitForFunction(playing && player && alive)` 三者在 startMatch 内同步为真，解析后立即单次求值恰好落入该窗口；headless SwiftShader 首帧慢放大了窗口 → 3/3 必现。
- 无真实玩法消费者受影响：HUD 携包提示直接读视图 `carrierId`（hud.js:56-59、440）；按 5 / G / E / 安放等输入处理全部发生在 `Player.update` 内部、在 146 行派生**之后同帧**消费。引擎内两个赋值点从不曾在同一同步序列中对齐——「上次绿 03:40 后被后续波次拆开时序」的假设不成立，旧绿只是采样时机运气。
- 前一 Flash 进程的 8×rAF 采样（跑出 36/36 但未交报告）与本结论一致：首个模拟帧之后 `carrying` 恒真。

因根因不是引擎逻辑缺陷，**未写新 unit 测试、未改引擎**（TDD 义务仅适用于真实逻辑缺陷），改为把浏览器断言做成有意义的稳定状态检查（§2）。

## 2. 修改（仅 scripts/e2e-bomb.mjs + accept-restart-check.mjs）

e2e-bomb 第 8 节：
1. **稳定条件等待替代单次采样**：冻结机器人后先 `waitForFunction`（原失败谓词本身 + `frame>0` 守卫：`player.id===0 && team==='BL' && view.bomb.carrierId===0 && carryingC4===true`，15s 超时），不是靠固定 sleep 掩盖。
2. **逐帧一致性断言**（比原断言更强）：随后 8×rAF 采样，要求**每个已跑模拟帧**满足 `carrying === (carrierId===pid)`，不一致帧必须为空——直接证明「无引擎状态不一致」，而非等待后碰巧读到好值。
3. **新增真实掉包/拾取子链**（真实键盘 G/E → BombInput 状态机 → objectiveCommand → 引擎 `applyCommand`/`pickupable` 权威校验）：G 掉包进入 dropped 态、原地 pickupable、玩家缓存清空、5 号槽自动退出；E 拾回 carrierId 复归 0。补齐「携包、掉包、按 5、安放」全闭环，真实走路（导航寻路 + 逐帧 `World.move`，无传送）与真实鼠标安放链路保持不变。
4. 第 3 节注释更正：GR 改队是场景确定性需要（机器人携包者走安包链路），删除「绕开引擎 id-0 缺陷」表述——该缺陷不存在。

accept-restart-check：判据 v2（理由与数据见 §4）。

## 3. 验证证据

- `npm run build`：通过，dist 952.1 KB。
- `node scripts/e2e-bomb.mjs` **两次均 38/38 通过**（36 原有 + 2 新增掉包/拾取），无超时、无 page error。两次关键详情：
  - 携包：`不一致帧=[]`（两次），末帧 `carrier=0, carrying=true`；
  - 掉包：`{"dropped":true,"pickupable":true,"carrying":false,"c4Selected":false}`（两次一致）；
  - 拾回：`{"carrierId":0,"carrying":true}`（两次一致）；
  - 真实走路：frames=966 / 1273，dist=0.5m，maxStep=0.093m；安放进度 52%；`planted/site=A`；死亡观战镜头跟随队友；运输船 TDM 回归 `bomb===null`。
- 截图已更新至 `artifacts/`（bomb-player0-carry / at-site / planting / planted / spectate 等）。

## 4. 重开判据：旧数据、新数据与理由

四轮真实 10 次重开数据（同页 startMatch，2500ms 间隔，headless SwiftShader）：

| 轮次 | textures | geometries | 旧判据 | v2 判据 |
|---|---|---|---|---|
| 旧 1（visual-integrate） | [99,98,98,101,97,98,97,88,98,98] | 恒 154 | **fail**（88→98=+10>+3 回补被误判） | growthSteps=0，drift −0.3 → pass |
| 旧 2（visual-integrate） | [97,99,101,97,98,98,98,99,97,101] | 恒 154 | **fail**（末步 97→101=+4>+3 抖动被误判） | growthSteps=0，drift 0.0 → pass |
| 新 A（本轮） | [97,97,97,100,98,97,97,99,97,87] | 150×3 → 151×7 | 纹理本可通过；中间版「geometries 恒定」fail | growthSteps=0，drift −2.7，geo 上行步 1/极差 1 → **pass** |
| 新 B（本轮） | [98,97,97,98,97,87,97,97,98,98] | 恒 154 | pass | growthSteps=0，drift +0.3，geo 上行步 0/极差 0 → **pass** |

判据理由（泄漏签名 = 上行棘轮/阶梯，不是双向抖动）：
- **textures 单步**：改为「超历史高点 +5 才计增长步」（旧：任意单步 >+3）。40 样本中普通上行抖动最大 +4；−9/−10 下探后的 +9/+10 回补不越历史高点、不计增长。跳变式泄漏（每回 +6）→ 每步超高点 +6，必捕获。
- **drift**：保留 |首3均−末3均| ≤ 6（实测 −3.7/0.0/−2.7/+0.3）。慢阶梯泄漏哪怕每回仅 +1~+2，10 次重开 drift ≥ +8，必捕获——这是比单步阈值更强的真泄漏探测器。
- **geometries**：新增独立判据（旧版根本不看）：上行步 ≤2 且极差 ≤3。首版「逐次恒定」被本轮实测证伪——轮 A 出现 150→151 一次性 +1 后连续 6 次平台恒定，且同 build 轮 B 又恒 154、基线随视觉 lane 改动漂移（154↔150/151），说明 geometries 也含回合内按需惰性分配，「无累积」才是其稳定属性。逐次 +1 的真泄漏会产生 9 个上行步/极差 9，必触。
- 保留 pageErrors===0。4 轮中 ~10 计数下探（87/88）位置随机（第 6/8/10 次），证实为懒上传/GC 时点抖动，非泄漏。

## 5. 剩余问题

1. **geometries 一次性 +1 惰性残留未定位根因**（轮 A restart 4 起，平台化不累积）：归属视觉/渲染侧文件，本 lane 无授权排查；ratchet 判据已确保其不会掩盖真泄漏，建议视觉 lane 知悉基线漂移现象。
2. e2e.mjs 偶发菜单等待超时（visual-integrate §6 已记录，失败点漂移）未在本 lane 处理。
3. 背光面残蓝 −28（≤15 目标未达）：视觉 lane 遗留授权项。
