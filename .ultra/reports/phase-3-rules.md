# Phase 3 — RULES / 对局协调 lane 报告

实现者：GLM-5.3-Flash HIGH（CLI，无子代理）。日期：2026-09-27。
契约：`.ultra/reports/phase-3-parallel-contract.md`；上下文：`.ultra/tasks/contexts/task-3.md`；规格：`.ultra/specs/desert-grey.md`。基线：阶段 2 审核通过后冻结源（engine 域 APPROVE，`.ultra/reports/phase-2-review-engine.md`）。

## 交付范围（独占文件）

| 文件 | 内容 |
|---|---|
| `src/modes/bomb-session.js`（新） | `BombSession` 模式控制器：持有纯规则引擎 `BombMatch`，负责回合流转、事实装配（inSite 收口）、命令入口、公开视图、重开/销毁。无 DOM/Three/存储，node 可测 |
| `src/modes/index.js` | 注册 `bomb` 模式适配器：`defaults { time: Infinity, respawn: null }`、`scoreKills: false`、`checkEnd(){false}`（对局结束由 matchEnded 事件驱动）、`result` 按先赢 7 回合判定 |
| `src/maps/registry.js` | 沙漠灰 `defaultMode: 'bomb'`（阶段 2 时为 'tdm'） |
| `src/game.js` | 只做事件/场景协调：会话装配与销毁、统一复活钩子、世界 C4 标记（dropped/planted+闪灯）、事件→音频/HUD/特效、`objectiveCommand`/`objectiveView` 公共接缝、`__bombPlace` 确定性测试钩子、无个体复活门控、击杀不计比分门控、HUD `objective` 字段。规则判定零新增 |
| `tests/unit/bomb-runtime.test.mjs`（新） | 9 条公共接缝行为测试（8 过 + 1 条显式缺陷记录 skip） |
| `tests/unit/registry.test.mjs` | 与 registry.js 默认模式变更配对更新（RED→GREEN） |
| `scripts/e2e-bomb.mjs`（新） | 浏览器集成验收 26 项（见下） |

未触碰 bots/player/hud/touch/viewmodel/guns/style/index 与早期 pure 核心（bomb.js/ai/profile/combat）。`package.json` 未加 npm script（e2e 用 `node scripts/e2e-bomb.mjs` 直跑，避免与并行 lane 冲突）。

## 运行时接口（供 AI / INPUT lane 与审核者核对）

- `Game.bomb`：仅爆破模式为 `BombMatch` 实例（有 `snapshot()`/`rules`/公开状态），其余模式恒 `null`。
- `Game.objectiveCommand(type, actorId, pos?)`：startPlant/stopPlant/startDefuse/stopDefuse/dropBomb/pickupBomb；未知类型返回 false；合法性由引擎下一帧结算（E 拆包优先、机器人同路径）。
- `Game.objectiveView(actorId?)`：可 JSON 序列化快照 + `plantable`/`defusable`/`pickupable`/`inSite`（包点 ID 字符串 'A'/'B' 或 null，**绝无布尔**）+ `spectate`（同队存活，供观战，不泄露敌方）+ `siteHint` 所需的全部数据（`bomb` 状态含 pos/site）。非爆破模式恒 `null`。
- `HUD.update` 新增 `objective` 字段（同一视图），HUD/触屏不需要自行推算规则。
- `Game.__bombPlace(actorId, x, y, z)`：仅测试脚本使用的受控摆位钩子（明确命名，不用于玩法/AI 证据）。
- 事实管线：Game 每帧装配 `{id, alive, pos, moving, damaged}` → `BombSession.update` 按**真实地图包点几何**（radius+垂直容差 3.2m）补全 `inSite` 为 ID 字符串。暂停 = simulate 不调用 = 规则时间完全冻结（无墙钟）。

## TDD 记录（红→绿）

| 切片 | RED 证据 | GREEN |
|---|---|---|
| 1 registry 默认 bomb | `'tdm' !== 'bomb'`（registry.test.mjs:11） | registry.js 改默认；8/8 过 |
| 2 bomb 模式适配器 | `getMode('bomb')` 回退 tdm，断言失败 | modes/index.js 注册；1/1 过 |
| 3 会话装配/回合流转 | `ERR_MODULE_NOT_FOUND: bomb-session.js`（真实模块缺失红） | 最小 BombSession（start/update/#flow）后 2 条流转测试过 |
| 4 包点/安拆命令边界 | —（见"诚实备注"） | 3 条边界测试过 |
| 5 视图契约 | `TypeError: s.view is not a function`（真实红） | 实现 `view()`；断言修正（观战列表我最初写成全队，夹具 BL 只有 2 人）后过 |
| 6 restart/destroy 行为收口 | —（同切片 4） | 1 条测试过 |

诚实备注：切片 4/6 的断言落地为"即写即绿"——切片 3 的最小实现已包含 command/siteAt/restart/destroy。这两组是行为收口而非真红驱动；真红切片为 1/2/3/5。审核者可用 git 历史核对（未提交，工作树内 file mtime 顺序佐证）。

测试过程中**抓到并复现一个纯引擎 P1 缺陷**（见缺口 #1）——公共接缝测试的直接收益。

## 缺口（需协调者路由）

1. **P1 — `src/modes/bomb.js`（早期 pure 核心，本 lane 禁改）对 actor id 0 的 falsy 误判，已复现**：
   - `startRound` 约 72-73 行：`carrier = bl.includes(carrierId) ? carrierId : bl[0] || null; this.bomb = carrier ? {carrierId: carrier} : null;` —— carrier 为数值 0（生产中玩家 id 恒为 0）时被判 falsy，C4 凭空消失。BL 玩家轮到携带的回合整局无包（只能靠灭队/超时判负方，玩法残缺）。
   - 同类问题还在 `mergeFacts`（约 97 行 `if (!a || !a.id)` 丢弃 id 0 的事实）与 `dropIfCarrierDead`（约 106 行）。
   - 已用真实浏览器探针复现：`startRound(0)` 后 `match.bomb === null`。单元侧以**带原因的 skip 测试**记录（`bomb-runtime.test.mjs` "P1 缺陷记录"，非静默跳过），修复后转绿。
   - 协调者已准备 `.ultra/reports/bomb-zero-id-fix-prompt.md`。确认：本 lane **未**采用字符串 ID 适配（该提示中的免修条件不成立），此补丁**需要执行**。修复属 bomb.js 所有者；我方接口无需变更。
2. 非阻塞：HUD lane 交付前，爆破 HUD 的回合/比分/C4 仍显示 TDM 样式（timeLeft 传 Infinity）；`view.plantHold/defuseHold` 等渲染由 HUD lane 完成（其报告 `phase-3-ui.md` 已涉及）。AI lane 接线前，爆破模式机器人仍走 teamGoals 游走、不会自主安拆（命令入口已就绪，`phase-3-ai.md` 已交付 planner 接线）。

## 验证证据（实际命令与结果）

```
npm run build                     → built dist/index.html 910.5 KB
npm test                          → 144 tests, 143 pass, 0 fail, 1 skipped（P1 缺陷记录）
node scripts/e2e-bomb.mjs         → 26/26 通过（artifacts/e2e-bomb-results.json + bomb-*.png）
node scripts/e2e-desert.mjs       → 34/34 通过（定向回归：game.js 变更后移动/导航无回归）
node scripts/e2e.mjs              → 21/21 通过（通用回归）
```

e2e-bomb 覆盖（全部真实浏览器 + 构建产物）：新玩家菜单 Start 默认进入沙漠灰爆破；5v5/先赢 7/150s/安 5s/拆 7s/引爆 40s 参数；视图可序列化与提示字段；**真实事实管线**（真实包点几何 → inSite）下 A 点安包（按住不足 5s 不生效）→ C4 世界标记落位 A（0.00m）→ GR 拆包（7s 未满不结算 → 完成，GR 胜、单次结算）→ 延迟后全员统一复活（含玩家）；死亡无个体复活（respawnT=null）+ 观战队友列表；超时判 GR → 第 3 回合；B 点安包 → **安包后 BL 全灭回合不结束** → 40s 引爆 BL 胜；暂停冻结（墙钟流逝模拟时钟不动）；重开清理（新会话/0 比分/C4 复位）；winsNeeded=1 确定性接缝验证 matchEnded → 对局结束；运输船回归（tdm、4s 复活、`Game.bomb`/会话/视图/C4 全 null）。

fastForward/受控摆位仅用于规则边界验证（脚本头注明 sim 驱动）；**本报告不声称任何最终真实渲染证据**——20 回合种子化 + ≥600s 真实渲染等最终验收待 B/C lane 完成后由本 lane 单独运行（等协调者通知）。

## 已知边界与说明

- e2e 中"安/拆包摆位"需避开碰撞体（摆进几何会被物理推出 → `moving` 事实 → 引擎正确打断动作）。脚本在包点内做确定性择点（纯几何查询）；这个行为本身验证了移动打断契约在真实物理下生效。
- e2e 第 2 节将玩家切到 GR（`opts.team='GR'`）使携带者为机器人 id≥5，**绕开而非掩盖**缺口 #1；单测夹具用 id 1..4（引擎契约不限定 id 取值），id 0 由 skip 测试显式追踪。
- 未实现（按规不越阶段）：背包/投掷物扩展、Profile 结算对接（matchEnded 事件即其接入点，Game 内不内联 XP）。
