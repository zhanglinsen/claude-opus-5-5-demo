# Profile 完整性修复 — profile 快照只读 + persistence 如实报告/可恢复

**执行者**：GLM-5.3-Flash HIGH（实现流，独立于第二阶段只读审核）
**日期**：2026-09-26
**来源**：`.ultra/reports/early-cores-review.md` Profile 发现 P3-3（profile getter 暴露 live 对象）与 P3-5（persistence 标志一次性降级且未注入 storage 时谎报 persisted）。前置阅读：`profile-architecture.md`、`early-cores-review.md`、`profile-result-fix.md`。
**范围**：仅 `cf-transport-ship/src/profile/service.js` 与 `cf-transport-ship/tests/unit/profile-core.test.mjs` + 本报告。未触碰 Game/map/AI/模式文件，未跑全量测试/构建/浏览器，未提交。

## 缺陷 1 — profile getter 暴露 live 对象

`service.js` 原 `get profile() { return profile; }` 直接返回内部对象。调用者可改 `stats`/`ledger`/`presets` 绕过 service 保存与去重：内存状态被改而磁盘未写，下一次 service 写入还会把篡改结果原样落盘，造成保存数据与真实档案分叉。

### TDD 循环

1. **红**：新增测试「profile 快照只读：外部篡改不改服务内存，重载与磁盘不分叉」。仅用公开 API：取 `svc.profile` 后篡改 `xp`/`stats.tdm.matches`/`ledger`/`presets[0]`（篡改包在 try/catch，对「深拷贝」与「冻结」两种实现都成立），再断言服务状态、去重行为与重载结果不受影响。
   执行 `node --test tests/unit/profile-core.test.mjs`：
   `AssertionError: 99999 !== 120` at `profile-core.test.mjs:131` — 外部篡改直接改了服务内存，缺陷可观察复现。旧 9 测试仍绿。
2. **绿**：最小实现（`src/profile/service.js`）——
   - 新增模块级 `deepFreeze(value)`：档案是纯 JSON 数据（与持久化格式一致），逐层冻结后严格模式下的赋值/数组 push 均无效；
   - getter 改为 `publicSnapshot()`：`JSON.parse(JSON.stringify(profile))` 深拷贝后深冻结返回；
   - 按 `profile` 对象 identity 缓存快照（service 内所有更新都是不可变整体替换，identity 未变即复用），避免每次访问都深拷贝，公开调用方式与性能不变。
   复跑：**10 pass / 0 fail**。
3. **重构**：无需。快照缓存即终态，未引入新依赖或新公开方法。

## 缺陷 2 — persistence 谎报 / 不可恢复

原实现 `let persisted = true` 且 `persist()` 只在失败时置 false：
- 未注入 storage（`repo == null`）时也报 `'persisted'`，把内存模式说成已落盘；
- 一次瞬时配额错误后整个会话卡死在 `'memory'`，后续写成功也不反映真实状态。

### TDD 循环

1. **红**：新增两条测试——
   「未注入 storage：persistence 如实报告 memory」（`createProfileService()` / `{}` / `{ storage: null }` 三种调用均应为 `memory`）；
   「持久化状态可恢复」：可切换失败的 storage，首次写失败报 `memory`，解除失败后再次 `switchPreset` 应报 `persisted`，且用同一 storage 重载验证数据确实落盘（不是空话）。
   执行：两条均红——
   `actual: 'persisted', expected: 'memory'`（未注入 storage 谎报）；
   `actual: 'memory', expected: 'persisted'`（写成功后不恢复）。旧 10 测试仍绿。
2. **绿**：最小实现——
   - `let persisted = repo != null;`（未注入 storage 从一开始就是 memory；注入后以档案确实读自本地存档为起点，与既有「损坏档案恢复」测试锁定的构造期 `persisted` 语义一致）；
   - `persist()` 改为 `persisted = repo.save(profile);`：以最近一次写入结果为准，写成功即从失败中恢复，写失败降级 memory。
   复跑：**12 pass / 0 fail**。
   （过程中一次失败为本测试 stub 缺陷：`getItem` 恒返回 null 导致重载读不到，修正 stub 使其在非失败期真实存储后通过；非实现缺陷。）
3. **重构**：无需。两处改动即终态。

## 行为语义（修复后）

- `svc.profile` 返回深层冻结的只读快照；外部任何修改（含嵌套 `stats`/`ledger`/`presets`）均无效。所有修改必须走 `switchPreset`/`setPresetSlot`/`applyResult`，去重与持久化单点由 service 掌管，内存与磁盘不再可能分叉。
- `svc.persistence`：未注入 storage → 恒为 `'memory'`；注入 storage 后以最近一次写入结果为准，写失败 → `'memory'`，后续写成功 → 恢复 `'persisted'`。内存模式不再被说成已落盘。
- 既有行为不变：repository 的安全读写（坏 JSON/抛错不崩溃）、legacy `primary` 只在首次创建迁入第 0 套、账本去重与重载不重复发 XP、XP/军衔语义均未改动。

## 接口影响

- `profile` getter 从「live 引用」变为「冻结快照」：只读调用方（HUD 显示、菜单）完全兼容；尚无 src 内 profile 模块之外的调用方（已 grep 确认），零破坏。将来若有调用方试图原地改 `svc.profile`，会在严格模式下得到 TypeError 或静默无效——这正是契约要求的行为。
- `persistence` getter 返回值语义更真实，取值集合不变（仍是 `'persisted' | 'memory'`），无签名变化。

## 限制与说明

- 快照用 JSON 往返实现深拷贝：档案已由 `normalizeProfile` 保证为纯 JSON 数据（与落盘格式一致），故无损；若未来档案加入非 JSON 值需换 `structuredClone`。
- 每次不可变更新后首次访问 `profile` 会做一次深拷贝；档案规模小（3 套预设 + 少量 stats 桶 + ≤200 键账本）且有 identity 缓存，性能合理。
- 未扩散处理评审中其余 P3 事项（P3-4 账本重载封顶/版本门槛、bomb 侧 P3-1 等）。
- 未提交/推送。
