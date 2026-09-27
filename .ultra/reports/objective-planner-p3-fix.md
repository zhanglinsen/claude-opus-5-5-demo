# Objective AI P3 修复报告（依据 phase-3-review-ai-ui.md 与 early-ai-rereview.md）

日期：2026-09-27。执行者：GLM-5.3-Flash HIGH（原 planner 实现者）。仅动 `src/ai/objective-planner.js`、`tests/unit/objective-planner.test.mjs` 与本报告；未触碰 RULES lane 的 `modes/bomb*.js` 及 bots/game/HUD；未提交、未调用子代理。

## 变更文件

- `cf-transport-ship/src/ai/objective-planner.js` — `planDefender` planted 分支诚实降级（P3-1）；`nearestAlive` 等距 id 升序决胜（P3-2）。
- `cf-transport-ship/tests/unit/objective-planner.test.mjs` — 新增 2 条公开行为测试（先红后绿）。
- `.ultra/reports/objective-planner-p3-fix.md` — 本报告。

## P3-1 —— 非法包点标注 + 无坐标：不再抛 TypeError，防守计划诚实降级

红（先加测试）：

```
cd cf-transport-ship && node --test tests/unit/objective-planner.test.mjs
→ tests 16 / pass 14 / fail 2
  ✖ C4 已安放但包点标注非法且无坐标：防守计划诚实降级（goal:null）而非抛错
      TypeError: Cannot read properties of null (reading 'x')
        at dist3 …→ nearestAlive …→ planDefender (objective-planner.js:145)
```

与审核复现完全一致：`c4 = { state:'planted', site:'C' }`（'C' 不在 map.bombSites）且无坐标时，`siteOfC4` 原样返回 'C'，`sitePoint` 返回 null，null 传入 `nearestAlive` → `dist3(position, null)` 抛错；同输入下进攻方是 goal:null 的诚实降级，行为不对称。

新测试断言：非法 site + 无坐标时全部防守方拿到可用计划而非异常。

修复（`planDefender` planted 分支）：先解析 `goal = c4.position || sitePoint(siteOfC4(c4))`，仅当 `goal` 非空才做最近者选择与 defuser/cover 指派；goal 不可解析时返回诚实降级计划 `{ role: 'cover', intent: 'retake', site, goal: null }`——不指派任何 defuser（没有可达目标就不派人拆），全队保持回防意图，不臆造坐标，与进攻方同输入的 goal:null 降级路径对称。

**降级后的防守计划语义**：C4 已安放但位置完全不可知（site 非法/未知且无坐标）时，所有防守方 `cover/retake`、`goal:null`——bots 层收到回防意图但无导航目标（与进攻方 `guard/defend goal:null` 同为契约容忍的降级态）；一旦集成层补上合法 site 或坐标（正常流恒有），最近者立即恢复 `defuser/defuse` 并带真实目标。注意降级计划中 `site` 仍回传原始标注值（如 'C'），仅供诊断，无坐标语义。

绿：

```
node --test tests/unit/objective-planner.test.mjs
→ tests 16 / pass 16 / fail 0
```

## P3-2 —— nearestAlive 等距平票与传入顺序无关

红（同一次运行）：

```
  ✖ 两名防守方与 C4 等距：defuser 指派与 obs.team 传入顺序无关
      AssertionError: 逆序传入后 defuser 翻转  'cover' !== 'defuser'
```

新测试断言：d1(x=38)、d2(x=40) 对 planted 位置 (x=39) 严格等距时，`obs.team` 正序 `[d1,d2]` 与逆序 `[d2,d1]` 两种传入下 d1 恒为 `defuser`、d2 恒为 `cover`（期望以 id 升序决胜）。原实现的严格 `<` 归约保留先遇者，逆序时 defuser 翻到 d2，测试红。

修复（`nearestAlive`）：归约比较改为「距离严格更近者胜；距离相等时 id 升序者胜」——决胜键为成员身份，胜者与遍历顺序无关。该函数是 retriever/defuser/rotator 三处位置型选择的公共底座，三处同时获得顺序无关性。

绿：

```
node --test tests/unit/objective-planner.test.mjs
→ tests 16 / pass 16 / fail 0
```

改动极小，无需额外重构步骤。

## 命令与真实结果

```
node --test tests/unit/objective-planner.test.mjs
→ 红（修复前）：tests 16 / pass 14 / fail 2（仅两条新用例失败，14 条既有用例全绿未受扰动）
→ 绿（修复后）：tests 16 / pass 16 / fail 0

node --test tests/unit/bomb-bot.test.mjs   （回归，只读运行，未改该文件）
→ tests 7 / pass 7 / fail 0
```

## 行为语义小结（对集成方）

- 正常集成流不变：合法 site 或已知坐标下，defuser/cover/retriever/guard 行为与此前一致；两条 P3 只影响「元数据缺失/漂移」与「精确浮点等距」两种边角。
- 等距决胜键 = 成员 id 升序；集成方无需再保证 obs.team 顺序稳定（此前 g.actors 序稳定仅是巧合性安全）。
- 无任何新测试超出这 2 条；未提交、未推送。
