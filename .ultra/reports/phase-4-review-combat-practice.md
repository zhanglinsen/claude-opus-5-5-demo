# C 波独立审核 — 战斗/投掷物 + 练习运行时

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 fb634b3c-48fa-48ec-8c43-d9d04e6e18da，事件 `.ultra/dispatch/logs/phase-4-review-combat-practice.jsonl`，提示 `phase-4-review-combat-practice-prompt.md`）

审核完毕，所有探针与测试均已运行。以下为完整审核报告。

---

# C 波审核报告：战斗/投掷物 + 练习运行时

## 结论：REQUEST_CHANGES（仅 1 项 P2 必改，其余全部核实通过）

核心声明全部属实：与现役 `updateNades`/`throwGrenade` 的数值等价性经 240 帧逐帧探针证实（最大位置差 5.6e-16，即浮点舍入级）；41/41 + 27/27 测试真实通过；模块纯度、契约清单、规格符合性均核实。唯一必改项是 practice-runtime 换枪校验走原型链查找（P2-1，一行修复），违反该模块自己声明的契约，且 D 波将直接消费此 API，应在接线前修掉。

## 逐点证据

### 1. weapons.js — 通过

- `git diff src/weapons.js`：he 仅新增 `effect: 'he'`，数值 115/7.5/2.6 未动；ak47…knife 零改动；flash/smoke 为纯新增条目，字段形状与 he 一致（`src/weapons.js:51-62`）。`effect` 为纯新增键，无既有代码依赖被破坏。
- 半径严格一致：flash 16 = `GRENADE_EFFECT_DEFAULTS.flash.radius`、smoke 3.5 = `GRENADE_EFFECT_DEFAULTS.smoke.radius`（测试 `combat-throwables.test.mjs:27-30` 锁定）。
- 现役兼容性：`player.js:170-181` 换枪走 inv 数组（WeaponState 实例），不遍历 WEAPONS，新增条目不影响现役行为；`game.js:133` `makeIcons()` 启动时遍历全部 WEAPONS 键调 `buildGunMerged(id)`，`guns.js:264-275` 的 builders 已含 flash/smoke（lane 3 的临时 shim，注释见 `guns.js:262`），启动不会崩——这是跨 lane 依赖，值得双方知晓。
- CATALOG 回归：`node --test tests/unit/profile-core.test.mjs tests/unit/profile-adapter.test.mjs` → **27 pass / 0 fail**。`CATALOG.grenade = ['he','flash','smoke']`、默认仍 `he`（`profile/equipment.js:10-30` 推导正确），旧存档预设含 `grenade:'he'` 仍合法。

### 2. projectile.js — 通过，等价性声明属实

- **确定性**：文件零导入，无随机/时钟/DOM/Three（grep 证实）；`step(dt)` 显式推进；测试以 `deepEqual` 断言同初值同步长逐位一致。
- **事件语义**：`fuse` 整帧先扣 → 3 子步运动 → rest/fuse 判定（`projectile.js:67-112`）。rest 用 `rested` 标志、fuse 用 `done` 标志，均恰好一次；fuse 后 `step` 返回 `[]` 且位置冻结（测试 `combat-projectile.test.mjs:60-72` 锁定）；dt≤0 忽略。顺序与现役 `game.js:568-595` 一致。
- **数值等价性（探针实证）**：反弹公式代数等价——`(v + n·(−1.45·vn))·0.55 ≡ (v − n·vn)·0.55 − n·vn·0.2475`，6 组法向/速度探针最大差 1.1e-16。用现役数学逐行转写做参照、最小地板+墙世界跑 240 帧×3 组初速（共 500+ 次反弹）：**maxPosDiff ≤ 5.6e-16，maxVelDiff ≤ 4.4e-16**。“重力 14 / skin 0.07 / rest 0.7·1.2·0.8 / 出手 16+2.8+0.6” 逐项与 `game.js:560,572-586` 对齐。`computeThrowVelocity` 与现役公式一致（测试精确断言 z=−14.8/−16 等具体值，非空洞）。
- **raycast 约定**：`physics.js:210-231` 返回 `{t, nx, ny, nz, exit, collider} | null`，模块只读 t/nx/ny/nz，兼容；`'move'` 模式存在（`physics.js:219`）。
- bounce 的 `impactSpeed` 取反弹前 |vn|，与现役音效阈值 `|vn|>2`（`game.js:585`）的语义一致。

### 3. practice-runtime / practice-targets — 除 P2-1 外通过

- **射线-球判定**（`practice-targets.js:30-44`）：数学正确——正交命中 4.5、斜向未归一化方向命中 4.5、脱靶 −1、球在背后（tFar<0）−1、原点在球内返回出射距离、零向量 −1；补充探针：球内背向离开 0.5 ✓、起点在球面 0 ✓、掠射 disc=0 得切点 5 ✓。
- **换枪校验**：除 P2-1 外，`selectWeapon`/`canSelectWeapon` 只读 WEAPONS，无副作用；slot 3 轮换替换语义正确（`slots[def.slot]` 同键覆盖，测试锁定“被替换者不残留”）。
- **PracticeSession 核心**：`src/modes/practice.js` 内容与其自身测试（practice-core 5 例，全绿）完全锁定；`practice-runtime.js:20-23` 以 `{id, pos}` 透传，pos 不透明语义保持。注意 practice.js 为未跟踪文件，无 git 基线，“本波未改动”只能以测试锁定+内容一致性作旁证（grenade-effects.js 同理）。
- **暂停冻结**：仅 `update(dt)` 推进，无任何隐藏时钟（grep 证实）；测试覆盖不调用即冻结、`update(-1)/update('x')` 安全忽略。

### 4. 测试运行结果（真实数字）

```
node --test combat-throwables combat-projectile practice-runtime practice-core grenade-effects
→ 41 pass / 0 fail
  （combat-throwables 5、combat-projectile 8、grenade-effects 16、practice-core 5、practice-runtime 7）
node --test profile-core profile-adapter → 27 pass / 0 fail
```

断言抽查均为精确数值/边界/确定性断言（4.5m 命中、free-fall 解析界 1.75~3.5m、逐位 deepEqual、事件计数恰一次），无空洞断言。报告自认切片 2 非严格测试先行：核实后测试锁定的是可观察行为而非实现回声，且报告披露的两处“测试侧修正”（斜向球心、下落界）修正后断言更精确，不是放水。红绿声明中 `ERR_MODULE_NOT_FOUND` 类首跑红与文件创建时序相符，可信。

### 5. 模块纯度 — 通过

对 `src/combat/*.js`、`src/modes/practice*.js`、`src/weapons.js` grep `document|window.|localStorage|sessionStorage|THREE|Math.random|Date.now|performance.now|requestAnimationFrame` → **零匹配**。导入图无环：projectile.js / weapons.js / practice-targets.js / grenade-effects.js 零导入；practice-runtime 只导入 practice.js、practice-targets.js、weapons.js。新模块目前无任何文件导入（D 波未接线），与报告声明一致。

### 6. D 波契约清单 vs 实际 API — 相符

combat 报告 7 条逐条核对：`computeThrowVelocity({dir, actorVel, rules?})` ✓；`new GrenadeProjectile({pos, vel, fuse})` + `step(dt, raycast)` 事件形状 ✓；raycast 适配签名与 `physics.js:210` 完全匹配 ✓；`WEAPONS[id].effect ∈ {'he','flash','smoke'}` ✓；`smokeBlocksSight(from, to, clouds)` / `SmokeCloud.advance/blocksSight` ✓（grenade-effects.js 契约注释与实现一致，未被破坏）；slot 3 顺序 = CATALOG ✓。practice 报告 6 条（spots 契约、hitScan/registerHit、update 暂停、snapshot 字段、reset 语义、Game 侧职责）全部与代码签名一致。规格 `desert-grey.md` §Combat/练习规则未被本波改动（git diff 仅新增 Profile 段，属档案 lane）。

## 缺陷列表

- **P1**：无。
- **P2-1**（必改）：`src/modes/practice-runtime.js:29` — `!!WEAPONS[id]` 走原型链。探针实证：`canSelectWeapon('toString')`、`canSelectWeapon('constructor')` 返回 `true`；`selectWeapon('toString')` 返回 `true` 且 `snapshot().weapon = {slots:{"undefined":"toString"}, current:"toString"}`（`slots[undefined]`）。'toString'/'constructor'/'hasOwnProperty' 等 Object.prototype 成员名均为“目录外”却通过校验，直接违反本模块报告 §注入契约 3 “非法输入（目录外/空串/非字符串）返回 false 且不改变当前选择”。修复一行：`Object.hasOwn(WEAPONS, id)`（或 `Object.prototype.hasOwnProperty.call`）。现有测试（`practice-runtime.test.mjs:112-115`）只测 'b41'/''/null/42，未覆盖继承名，应补两例。
- **P3-2**：`src/combat/projectile.js:51,55` — 构造参数 `radius` 被接收并赋值 `this.radius`，但全类无任何读取。API 表面误导（调用方可能以为传 radius 会膨胀碰撞体）；删除或注明占位用途。
- **P3-3**：`src/combat/projectile.js:90` — 静止后每子步仍发 bounce 事件（探针实测：静止期 180 帧内 435 个 bounce，即每帧 3 个）。运动数学与现役逐位一致（现役同样每子步重命中，仅音效有 |vn|>2 闸门），不算行为缺陷，但 D 波若漏掉 impactSpeed 闸门会出现持续弹跳音。契约文档已提示阈值，建议在 `projectile.js` 头注释加粗强调或考虑 rested 后抑制微小 impactSpeed 事件。
- **P3-4**：`src/modes/practice-runtime.js:42-47` — `hitScan` 无墙体遮挡（纯射线-球，职责清晰），但 combat/practice 报告的接线指引写 `hitScan(origin, dir, weapon.range)`，照字面在开火点调用会隔墙命中靶。建议契约补充：maxDist 应传 `min(range, 墙面射线距离)`，由 Game 侧先做墙面 raycast。
- **P3-5**（验证限度，非代码缺陷）：practice.js 与 grenade-effects.js 为未跟踪文件，无 git 基线，“C 波未改动”声明只能间接证实（内容与各自测试锁定行为一致、头注释与 B 波契约相符）。

## 非阻塞建议

1. **给现役手感常数加回归网**：`computeThrowVelocity` 的 16/2.8/0.6 有精确测试锁定，但 `PROJECTILE_DEFAULTS`（重力 14、反弹 0.2475/0.55、skin 0.07、rest 0.7/1.2/0.8）没有任何测试锁定——改成 15 测试照样全绿。一行 `assert.deepEqual(PROJECTILE_DEFAULTS, {...})` 即可封死；或把我探针里“模块 vs 现役公式转写 240 帧对比”改写成一条 parity 测试。
2. `combat-throwables.test.mjs:11` 的 GRENADE_FIELDS 未含 `effect`/`dmg`/`radius`；effect 分发键目前仅靠源码保证，可加一行断言 `['he','flash','smoke'].every(id => WEAPONS[id].effect === id)`。
3. `practice-targets.js:48` `pickTarget` 对非数组 states 无防御（同文件 `createTargetStates:15` 有 `Array.isArray` 守卫），for..of 会抛错；内部一致性小修。
4. `projectile.js:64` `atRest` 用 `this.vel.y === 0` 严格相等，依赖 rest 分支恰好置零——当前成立但脆弱，可改 `< 1e-9`。
5. build 产物（911.1/916.9 KB 声明）本次未复跑（避免写 dist）；测试数字与报告声明的 41/0 一致，可信。

**必改动作**：P2-1 一行修复 + 补两个继承名测试用例后，本波即达 APPROVE 标准，可放行 D 波接线。