# BombMatch 数值 id 0 falsy 误判修复

日期：2026-09-27
范围：仅 `cf-transport-ship/src/modes/bomb.js`、`cf-transport-ship/tests/unit/bomb-core.test.mjs`（新增用例）、
`cf-transport-ship/tests/unit/bomb-runtime.test.mjs`（仅 skip 测试转真实断言一处）、本报告。
阶段 3 三路 lane 已结束、协调者冻结其余源码后执行；未动 Game/AI/UI 与其它测试，未提交。

## 问题（RULES lane 浏览器探针复现，本会话独立确认）

Game 生产玩家 id 为数值 0，而 `BombMatch` 三处用 falsy 判断把 0 当缺失：

| 位置 | 原代码 | 后果 |
|---|---|---|
| `startRound` 载包 | `bl[0] \|\| null`、`carrier ? {carrierId} : null` | `startRound(0)` 后 `match.bomb === null`，C4 凭空消失 |
| `mergeFacts` | `if (!a \|\| !a.id) continue` | id 0 的每帧事实被丢弃，安/拆包与存活判定全部失效 |
| `dropIfCarrierDead` | `!carrierId \|\|` | id 0 携带者死亡不掉包 |

## 修复（最小 null/undefined 守卫）

- `startRound`：`const carrier = bl.includes(carrierId) ? carrierId : (bl[0] ?? null);`、
  `this.bomb = carrier != null ? { carrierId: carrier } : null;`
- `mergeFacts`：`if (!a || a.id == null) continue;`（0 合法，仅 null/undefined 视为缺失）
- `dropIfCarrierDead`：`const carrierId = this.bomb ? this.bomb.carrierId : null; if (carrierId == null || …) return;`

同模块其余 actor id 使用点已复核、无同类问题：`applyCommand` 用 `!==` 严格比较、
`roster.find` 用 `===`、`alive`/`pos`/`tickFacts` 均为对象键查表（数值 0 作键安全）。
行为契约不变：id 仍可为数值或字符串，引擎不做其它校验。

## 测试

红态（`node --test tests/unit/bomb-core.test.mjs`，修复前，新增 2 条公开 API 用例）：

```
✖ 数值 id 0 的 BL 携带者：startRound(0) 能持包，缺省时也能落到首个 BL(id 0)
    （roundStart.carrierId 与 snapshot().bomb.carrierId 均为 null，C4 丢失）
✖ 数值 id 0 的事实被采信：id 0 可安包；其死亡掉包事件 actorId 为 0
    （bombPlanted 未发生；死亡无 bombDropped）
其余 18 条既有用例全部通过
```

绿态（修复后，聚焦两套）：

```
node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs
✔ bomb-core 20/20（含 2 条新增 id 0 用例）
✔ bomb-runtime 9/9（原 skip 用例已转真实断言并通过：
  'id 为 0 的 BL 携带者必须能拿到 C4（数值 0 不是缺失）'，
  经 BombSession.start() → startRound(carrierId=0) 真实装配路径验证）
0 fail, 0 skipped
```

构建（按要求执行，非全量浏览器套件）：

```
npm run build
built dist/index.html 910.5 KB
```

## 对阶段 3 合流的契约影响

- Game/bots/HUD 可放心以数值 0 作玩家 id：`startRound(0)`、facts、命令、事件中的
  `carrierId`/`actorId` 均正确携带 0；拾取、安包、拆包、死亡掉包全链路可用。
- `snapshot().bomb.carrierId` 为 `0` 时是合法持有者，集成方展示层判断需用
  `!= null`/`typeof` 而非 truthy（引擎已保证不产出 `null` 持有者歧义状态）。
- `bomb-runtime.test.mjs` 的 P1 缺陷记录 skip 已消除，该文件其余内容未动。
- 未开始合流、未改 `game.js`；合流仍由协调者统一执行。
