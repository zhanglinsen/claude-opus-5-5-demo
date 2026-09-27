复核完成。所有探针与测试均已独立运行验证，以下为最终报告。

---

# Objective AI P2-1 / P2-2 修复复核报告

## 结论：APPROVE

聚焦测试独立复跑通过（`node --test tests/unit/objective-planner.test.mjs` → 14/14 绿），两处 P2 修复行为与评审要求一致，且未发现阻塞级新缺陷。另有两个新边角问题（均为 P3、非阻塞、正常集成流不可触发），附行号与最短复现如下。

## P2-1 复核：planted/dropped 缺坐标的降级 —— 合理

- `planAttacker`（[objective-planner.js:116-122](cf-transport-ship/src/ai/objective-planner.js#L116)）与 `planDefender`（[objective-planner.js:141-150](cf-transport-ship/src/ai/objective-planner.js#L141)）均以 `state === 'planted'` 触发，`goal = c4.position || sitePoint(site)`：有精确坐标用坐标，只有 `site` 去包点坐标，两者皆无才回退。与评审要求的 `c4.position || sitePoint(siteOfC4(c4))` 完全一致，测试 `C4 已安放仅有包点无坐标…` 覆盖了双方（测试 228-242 行）。
- dropped 保持要求已知 `position`（[objective-planner.js:122](cf-transport-ship/src/ai/objective-planner.js#L122)），无坐标时回退常规分路、不臆造；且 `line 129` 只在 `carried` 时取 `carrierId`，dropped 状态不会误挂角色。真实集成中 retriever 可达：`bomb.js:101-102` 掉包时携带 `this.pos[carrierId]`（每帧累积的最后已知位置，`bomb.js:93`），`dropped + null pos` 仅在持包者从未上报过 pos 时出现，此时不捡是诚实行为。

## P2-2 复核：回合内稳定性 —— 达标

- 分配在 `(team|round)` 键下按 **id 排序**一次性定死并完整缓存（[objective-planner.js:59-68](cf-transport-ship/src/ai/objective-planner.js#L59)），回合内缓存不可变：`obs.team` 重排（排序使创建序无关）、成员阵亡（死者在 `members` 中保留占位，`line 86-88`）、集成方中途剔除死者，均不改变幸存者 site/role。两条新测试（打乱、阵亡）断言到位。
- 迟到成员经 `siteFor`（[objective-planner.js:73-83](cf-transport-ship/src/ai/objective-planner.js#L73)）并入人少侧（平票进主点），只新增条目、不重排已分配者——探针实测：round1 缓存 3 人后 d4 中途加入得 A 侧，d1/d2/d3 所守包点不变。
- 跨回合：新回合换 key 从种子重派，round1 的迟到合并不泄漏进 round2（探针实测 round2 按 4 人重排为 2/2）；round 回退/重放命中同 key 返回同一分配，确定性一致。缓存每回合仅增两条目，增长可忽略。

## 新发现（均 P3、非阻塞，未列入已知 P3 清单）

**N1（P3）— 防守 planted 分支在 site 无法解析时抛 TypeError，而非诚实降级**
[objective-planner.js:144-145](cf-transport-ship/src/ai/objective-planner.js#L144)：当 `c4.site` 非 null 但不在 `map.bombSites` 且无 `c4.position` 时，`goal` 为 null 传入 `nearestAlive`，`dist3(position, null)`（line 104）抛 `TypeError: Cannot read properties of null (reading 'x')`。最短复现：`createObjectivePlanner({seed:7}).plan({now:0, round:1, self:{id:'d1',team:'GR',position:{x:0,y:0,z:0}}, team:[{id:'d1',position:{x:0,y:0,z:0}}], c4:{state:'planted', site:'C'}, enemies:{}})`。同样的输入下进攻方分支是诚实降级（goal null），防守方却崩溃，行为不一致。正常集成流不可触发：`c4.site` 来自集成方 `inSite` 事实（`bomb.js:237-239`，与规划器同一份地图元数据时恒可解析）；仅在规划器地图元数据缺失/漂移、或已知 P3-1 的 `inSite || true` 布尔泄漏时可达——与 P3-1 是不同文件的不同缺陷（规划器侧崩溃 vs bomb.js 侧事实遮蔽）。最小修法：`siteOfC4` 校验 `siteById.has(c4.site)`，或 `nearestAlive` 调用前判 `goal`。

**N2（P3）— `nearestAlive` 平票时仍数组序依赖，planted 分支的 defuser 身份可翻转**
[objective-planner.js:104](cf-transport-ship/src/ai/objective-planner.js#L104) reduce 以严格小于比较，平票保留先遇者。实测复现：两名防守方对 planted C4 等距（d1 x=38、d2 x=40，包点 x=39），`obs.team` 逆序后 d1 由 `defuser` 翻为 `cover`。影响极小：`cover` 的 goal 与 `defuser` 相同（line 149），全员仍向包点收敛，仅角色标签翻转，且需精确浮点相等才触发。P2-2 修复正确覆盖了 site/role 缓存分配；此残留属位置型选择，不在原修复要求范围内。

## 其他确认

- `src/` 中尚无任何模块 import 该规划器（仅定义本身），修复不涉及共享文件，无回归面。
- 测试助手 `atkObs` 的 self 兜底修正（测试 29 行）确为纯测试侧改动，不影响断言语义。
- N1/N2 不阻塞 stage3 集成；若顺手修，建议与 P2 修复同一 PR 内补两条断言（未知 site 不抛错；等距不因顺序翻角色），但不作为门禁条件。