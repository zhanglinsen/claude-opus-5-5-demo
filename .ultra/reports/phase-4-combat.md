# 阶段 4/C 波 lane 1 — 投掷物与战斗模块（可独立测试模块层）

实施：GLM-5.3-Flash HIGH（claude agent）。范围：`src/weapons.js`、`src/combat/projectile.js`（新）、`tests/unit/combat-throwables.test.mjs`（新）、`tests/unit/combat-projectile.test.mjs`（新）。未触碰 game.js/hud.js/bots.js/player.js/touch.js/viewmodel.js/modes/，未提交。grenade-effects.js（已有，APPROVE）未改动。

## 交付 API

### 1. `src/weapons.js` — 新增 flash / smoke（slot 3 轮换）
- 条目字段形状与 `he` 完全一致（id/name/slot/type/auto/effect/dmg/radius/fuse/count/draw/speed/sound/hudName/mag/reserve），另给三枚投掷物统一加了 `effect` 分发键（'he'|'flash'|'smoke'），供 D 波 Game 选择结算器（computeHeBlast / computeFlashEffect / SmokeCloud）。
- 既有枪械（ak47…knife）与 he 的原有字段值一律未变；`effect` 是纯新增字段。
- `src/profile/equipment.js` 的 CATALOG 自动推导出 `CATALOG.grenade = ['he','flash','smoke']`（期望行为），默认投掷物仍为目录首项 `he`，profile 测试全绿证实无回归。

数值依据：
| 条目 | fuse | radius | 依据 |
|---|---|---|---|
| flash | 1.6s | 16 | radius 与 `GRENADE_EFFECT_DEFAULTS.flash.radius` 严格相等（测试锁定）；引信短于 HE（闪光近炸） |
| smoke | 2.0s | 3.5 | radius 与 `GRENADE_EFFECT_DEFAULTS.smoke.radius` 严格相等（测试锁定）；落点后展开，引信介于闪光与 HE 之间 |
| he | 2.6s（不动） | 7.5（不动） | 现役值保持 |

dmg=0（flash/smoke 无直接伤害）；count=1 与 he 同基准，携带总量轮换由 4 号键与 D 波背包接线处理。排序 he→flash→smoke 即 CATALOG 顺序。

### 2. `src/combat/projectile.js`（新）— 投掷物运动纯核心
无 DOM/Three/音频/全局时钟/随机数；世界碰撞经注入 raycast 回调；确定性来自显式 `step(dt)`（暂停=不调用）。导出：

- `PROJECTILE_DEFAULTS`（冻结）：`gravity 14, substeps 3, skin 0.07, bounceNormal 0.2475, bounceTangent 0.55, restNormalY 0.7, restVy 1.2, rollFriction 0.8, sleepSpeed 0.05`
- `THROW_DEFAULTS`（冻结）：`speed 16, up 2.8, inherit 0.6`
- `computeThrowVelocity({dir, actorVel, rules?}) → {x,y,z}`：dir 内部归一化（零向量安全，仅剩竖直上抬），actorVel 为投掷者速度。
- `class GrenadeProjectile({pos, vel, fuse, radius?})`：
  - `step(dt, raycast) → events[]`：整帧扣引信 → 3 子步（重力、raycast 命中反弹/落地静止）→ rest/fuse 判定。dt≤0 或已 done 忽略。
  - 事件：`{type:'bounce', pos, normal, impactSpeed}`（每次命中）、`{type:'rest', pos}`（进入贴地静止，恰好一次）、`{type:'fuse', pos}`（explode-ready，此后冻结不再发事件）。
  - `atRest`（getter）、`fuse`、`done` 可查询。
  - raycast 命中约定与现役 world 一致：`(pos, dir, len) → {t, nx, ny, nz} | null`。

数值依据（与现役 updateNades/throwGrenade 逐项对齐，D 波替换后 HE 手感不变）：
- 重力 14、每帧 3 子步、raycast 皮肤 0.07：现役 updateNades 原值。
- 反弹：现役 `vel += n*(-1.45*vn); vel *= 0.55` 数学等价于切向保留 0.55、法向反向保留 0.2475，拆成 `bounceTangent/bounceNormal` 两个独立可调系数。
- 落地静止：`n.y > 0.7 且反弹后 |vy| < 1.2 → vy=0、水平 *0.8`：现役原条件。
- 出手：`dir*16 + (0,2.8,0) + actorVel*0.6`：现役 throwGrenade 原值（测试锁定）。

## 红绿证据
- 切片 1（weapons 条目 + computeThrowVelocity，测试先行）：`node --test tests/unit/combat-throwables.test.mjs` 首跑红 —— `ERR_MODULE_NOT_FOUND: src/combat/projectile.js`；实现后首跑仍红 1 例（测试期望值算错：actorVel.z=2 经 inherit 0.6 应贡献 +1.2，z=-14.8 而非 -16，属测试侧笔误）；修正后绿 5/5。
- 切片 2（GrenadeProjectile 运动核心）：**偏离严格 TDD**——GrenadeProjectile 与切片 1 的实现同文件先行写出，运动测试后写；首跑红 2 例，均为测试侧推导错误（① 半隐式积分下落量介于 g·t²/2 与 g·t² 之间，原断言界错；② 撞墙用例 dt 过小未及墙 + 误断言竖直分量不衰减，现役反弹即整体切向 *0.55），实现本身未改即绿。修正后 8/8 绿。
- 回归：`node --test tests/unit/grenade-effects.test.mjs tests/unit/profile-core.test.mjs tests/unit/combat-throwables.test.mjs tests/unit/combat-projectile.test.mjs` → 41 pass / 0 fail；`npm run build` → `built dist/index.html 911.1 KB`。未跑全量浏览器（按任务约定）。

## D 波 Game 接线契约清单
1. **出手**：`throwGrenade` 内 `dir*16+(0,2.8,0)+a.vel*0.6` 换成 `computeThrowVelocity({dir, actorVel: a.vel})`；三枚投掷物同参数（speed 字段保持 1.0 手感系数，如需每弹差异化再扩 rules）。
2. **运动**：每枚投掷物建 `GrenadeProjectile({pos, vel, fuse: WEAPONS[id].fuse})`；每帧 `events = p.step(dt, raycast)` 替代 updateNades 手写积分。`raycast` 适配：`(pos, dir, len) => world.raycast(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, len, 'move')`（命中对象形状 {t,nx,ny,nz} 已兼容）。
3. **事件→表现/结算**：`bounce` → `audio.playGrenadeBounce`（可用 impactSpeed 分级，现役阈值 |vn|>2）；`rest` → 停自转/滚动音（纯模块无随机，现役 spin 的 Math.random 属表现层，留在 Game）；`fuse` → 按持有武器 `effect` 分发：`he`→computeHeBlast，`flash`→computeFlashEffect，`smoke`→new SmokeCloud({pos}) 并入云列表。
4. **isBlocked 适配**：HE/闪光遮挡回调用 `'bullet'` 射线：`(from, to) => { const d = normalize(to-from); return world.raycast(from.x, from.y, from.z, d.x, d.y, d.z, len(from,to), 'bullet') != null; }`；现役 explode 起点抬 y+0.2、长度 L-0.3 的细节由 Game 侧包装保持，模块不感知。
5. **烟雾视线唯一接缝**：玩家视觉与 AI 视线一律经 `smokeBlocksSight(from, to, clouds)`（或逐个 `cloud.blocksSight`）判定；每帧对每团 `cloud.advance(dt)`，暂停不调用即自然冻结。
6. **slot 3 轮换**：顺序即 `CATALOG.grenade = ['he','flash','smoke']`；count 各 1，剩余量管理在 player/hud（D 波）。
7. **不改 grenade-effects.js**：本波未动它，flash/smoke 半径由 weapons 与其默认值双端测试锁定。
