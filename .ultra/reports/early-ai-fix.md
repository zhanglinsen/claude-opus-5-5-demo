# Objective AI 修复报告：P2-1 与 P2-2（评审 `.ultra/reports/early-cores-review.md`）

日期：2026-09-26。执行者：原实现者 GLM-5.3-Flash。仅修复 P2-1/P2-2；P3 项按协调者指示不处理、不扩散。

## 变更文件

- `cf-transport-ship/src/ai/objective-planner.js` — 两处行为修复（见下）。
- `cf-transport-ship/tests/unit/objective-planner.test.mjs` — 新增 3 条针对性公共行为测试（先红后绿）；修正测试助手 `atkObs` 对非 ATK_TEAM 成员的 self 兜底（纯测试侧修正，不改断言语义）。
- `.ultra/reports/early-ai-fix.md` — 本报告。

未触碰 game/bots/map/physics/bomb/profile/grenade 等任何共享文件；未跑全量套件/构建/浏览器；未提交、未推送。

## P2-1 —— planted/dropped C4 缺坐标时的诚实降级

红（先加断言再修复）：

```
cd cf-transport-ship && node --test tests/unit/objective-planner.test.mjs
→ tests 14 / pass 11 / fail 3
  ✖ C4 已安放仅有包点无坐标：进攻方守包、最近防守方赴该包点拆包；掉落无坐标时诚实回退
  ✖ 回合内 obs.team 顺序打乱…（P2-2，见下）
  ✖ 回合内队友阵亡…（P2-2，见下）
```

新测试断言：`c4 = { state:'planted', site:'A' }`（无 position）时进攻方仍 `guard/defend`、目标=该包点坐标；防守方最近可行动者仍 `defuser/defuse` 赴该包点；`c4 = { state:'dropped' }` 无任何已知坐标时不得臆造位置（不出现 `retriever`，回退常规分路）。

修复：

- `planAttacker`/`planDefender` 的 planted 分支不再要求 `c4.position`：`state === 'planted'` 即触发，`goal = c4.position || sitePoint(siteOfC4(c4))`——只有包点标注时去包点，无包点也无坐标才诚实回退为常规分路（绝不臆造坐标）。
- `siteOfC4`：公开 `site` 优先，其次已知 `position` 归入最近包点，两者皆无返回 null。
- dropped 分支保持要求已知 `position`：坐标未知即无人拾取（无全知位置）。

绿（未改测试）：

```
node --test tests/unit/objective-planner.test.mjs
→ tests 14 / pass 13 / fail 1（仅剩 P2-2 死亡用例）
```

## P2-2 —— 回合内分配稳定性（数组顺序/阵亡不搅动）

红：同上一次运行，`回合内 obs.team 顺序打乱…` 与 `回合内队友阵亡…` 两条失败（打乱后 d4/d5 包点翻转；a2 阵亡后 a3 由侧翼翻成护送）。

新测试断言：防守方 `obs.team` 逆序后每名成员所守包点与基线一致；4 人进攻小队中 a2 阵亡后 a1/a3/a4 的包点与角色均与基线一致。

修复：`roundAssign(team, round, members)` 由「只缓存主包点 + 按当前存活数组下标切分」改为「按稳定身份（成员 id 排序）一次性分配全员→包点，完整缓存于 `(team, round)` 键下」：

- 进攻 `attack` Map（前 floor(n/2) 护送主包点，其余侧翼另一包点）与防守 `defend` Map（前 ceil(n/2) 守主防区）在缓存生成时定死；此后 `obs.team` 重排、成员阵亡都不改变幸存者的包点/角色。
- 新回合换 key 重新抽取与分配（回合重置语义保留，跨回合 A/B 覆盖测试不变仍绿）。
- 迟到成员（缓存生成后才出现的 id）经 `siteFor` 并入当前人少的一侧，不重排已分配者。

绿：

```
node --test tests/unit/objective-planner.test.mjs
→ tests 14 / pass 14 / fail 0
```

重构（绿态，小步）：`planDefender` 情报比较的 reduce 回调参数改名，消除对外层分配对象 `a` 的遮蔽。复跑：

```
node --test tests/unit/objective-planner.test.mjs
→ tests 14 / pass 14 / fail 0
```

## API 影响（对集成方）

- 观察契约不变；语义增强两点：
  1. `c4.state === 'planted'` 无需 `position` 即驱动守包/回防拆包（`site` 或已知 `position` 任一即可）；BombMatch 在 facts 中尽量提供 carrier `pos` 仍是最佳（有精确坐标时目标更准）。`dropped` 仍必须有已知 `position` 才会有人去拾取——集成方掉包时必须把掉落坐标并入 C4 公开状态，否则机器人不会去捡（诚实失败，不臆造）。
  2. `obs.team` 传参顺序不再影响分配；死亡成员保留在数组中（`alive:false`）反而有助于分配稳定。回合计数（`round`）推进即触发重新分配。
- 输出形状不变：`{ role, intent, site, goal }`；`goal` 现在可能为包点坐标（planted 无精确坐标时）。

未新增其他测试（评审明示除 P2 相关外不加测试）；P3-1..P3-5 未动，属其他文件/非阻塞。
