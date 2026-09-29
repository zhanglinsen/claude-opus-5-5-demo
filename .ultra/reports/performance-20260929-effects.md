# 性能路 B：特效与渲染临时分配（lane=effects）

基线 c40d4bd，工作树 `perf-effects/claude-opus-5-5-demo`。归属文件：`cf-transport-ship/src/effects.js`、`cf-transport-ship/src/game.js`（仅 renderFrame 的 sunDir/相机四元数临时对象）、`cf-transport-ship/tests/unit/perf-effects.test.mjs`、本报告。未动其他 game.js 逻辑，未降画质（粒子数/贴花/示踪参数全部不变）。

## 发现与实改

### P1 曳光寿命缺陷：清理条件不可达，示踪线永不退出
- 位置：原 `effects.js` `Effects.update` 内 `head = Math.min(tr.len, t*380)`、`tail = Math.max(0, head-7)`、`tail >= tr.len` 判退。
- 根因：`head` 被钳制在 `len`，故 `tail` 上限为 `len-7`，`tail >= tr.len` 对任意长度都不可达（短射线 tail 恒 0，长射线恒 len-7）。真实测试确认（改动前 red）：示踪线永不过期，48 个槽位被永久占满，此后每帧持续渲染 48 个全长加法混合面片——既是 CPU/绘制浪费也是视觉残留（静止不动的一道亮线）。
- 修复：尾部改用未钳制的 `headRaw = t*380` 计算，`tail = max(0, headRaw-7)`；尾部越过末端即完全退出。寿命 = `(len+7)/380` 秒，短/长射线一致；保留段语义不变（前段 7m 随弹道移动，到端点后可见段收缩至 0，无零长度段：`!(seg > 0)` 直接跳过写出，不产生 NaN 矩阵）。修复只改退出时机，不减少合法特效数量：寿命内存活示踪线照常渲染（有单测锁定存活期矩阵与解析基线一致）。
- 附带防护：相机位于射线延长线上时 `dir × toCam` 退化为零向量（基线在此产生非有限矩阵，red 已证），现回退到与 dir 垂直的稳定参考轴，矩阵始终有限。

### P1 曳光循环逐帧分配 + filter 重建数组
- 原代码每帧 `new Matrix4`、`new Quaternion`、`new Vector3`×4（含 `camPos.clone()`）、`new Matrix4().makeBasis`，且用 `this.tracers.filter(...)` 整表替换数组。
- 改为实例自有 scratch（`_m/_q/_basis/_sv/_mid/_toCam/_up/_nrm`，构造期创建），`filter` 改为顺序稳定原位紧缩（`trs[n++] = tr` + `trs.length = n`），矩阵写入次序与原 `n < tracerMax` 语义一致。实例自有而非模块级，两个 Effects 实例互不污染（有专测）。

### P2 Decals.add 每次命中 3 个 Vector3
- `setFromUnitVectors(new Vector3(0,0,1), n)`、位置合成、缩放各分配一个 Vector3。改为实例自有 `_z/_pos/_scl`（`_z` 只读复用）。环形覆盖、法向偏移 0.004、随机自旋等语义不变（有专测：矩阵分解校验位置/缩放/+z 对齐法线/超过 max 环形覆盖）。

### P2 renderFrame 太阳方向变换（game.js:1171）
- 原：`env.sunDir.clone().applyQuaternion(cam.quaternion.clone().invert())` —— 每个第一人称渲染帧分配 1 Vector3 + 1 Quaternion。
- 改：模块级 `_sunCam`/`_q` 复用（game.js:47），`copy(...).applyQuaternion(copy(...).invert())`。不修改 `env.sunDir` 与相机四元数；`vm.update` 消费方为 `copy`（viewmodel.js:267）不持有引用，临时对象不泄露给持久消费者（有专测：两帧不同朝向逐帧重算、解析值一致、sunDir/四元数零修改）。

### P3 粒子循环核查：无逐帧分配
- `Particles.update` 已是原位紧缩（`P[n]=q` + `P.length=n`），循环内无对象分配；emit 的事件期对象创建按约束保留。属性缓冲每帧 `needsUpdate` 语义保持（单测断言 version 递增）。未改。

## 红绿证据

`node --test tests/unit/perf-effects.test.mjs`（真实 three math + 受控 stub，不启动 GPU）：
- 红（基线 c40d4bd，改前运行）：6 fail —— 长曳光不退出、短曳光不退出、大帧跨度不退出、存活矩阵断言失败（基线永续段渲染）、叉积退化产生非有限矩阵、粒子紧缩断言（测试自身修正后为红→绿两项：寿命类 3 项 + 退化 NaN 1 项）。
- 绿（改后）：12 pass / 0 fail，覆盖：短/长轨迹完全退出、大帧跨度、存活期矩阵解析基线（中点/朝向/可见长度/厚度）、叉积退化无 NaN、无效向量不入队、tracerMax 封顶、双实例互不污染、粒子退场与原位紧缩及透明度/尺寸插值、贴花矩阵语义与环形覆盖、renderFrame 太阳方向逐帧重算且不改持久对象。
- `node --check src/effects.js src/game.js` 通过；`git diff --check` 干净；`grenade-effects`/`combat-throwables` 相关既有测试 22 pass。

## 每帧分配减少的证据（构造计数微基准）

方法：把 `three.core.js` 复制一份并向 `Vector3/Matrix4/Quaternion` 构造器注入计数语句（计数本身零分配），两版 effects.js 重定向到该副本，跑同一 3000 帧混合负载（每 4 帧一发 120m 曳光、每 3 帧一次金属命中含贴花、每 30 帧枪口、相机缓动），预热 200 帧后统计。V8 堆采样剖面因逃逸分析对短命对象不敏感（两版都测得 ~10B/帧噪声），故采用构造计数。

复现：`PERF_EFFECTS_BENCH=1 node tests/unit/perf-effects.test.mjs`（在 cf-transport-ship/ 下执行，自动从 git 提取基线对照，临时文件用后即删）

```
[bench] 基线 c40d4bd: {"Vector3":298000,"Matrix4":147000,"Quaternion":3000} 合计 149.3 /帧
[bench] 当前版     : {"Vector3":0,"Matrix4":0,"Quaternion":0} 合计 0 /帧
```

结论：`Effects.update` 的每帧 Three 数学对象构造从 ~149 次/帧（稳态 48 条曳光永不退出的病态叠加）降至 0；寿命修复后稳态存活曳光 ~4-5 条（按射速），分配仍为 0。`Decals.add` 每次 3 个构造 → 0。`renderFrame` 每渲染帧 2 个构造（Vector3/Quaternion clone）→ 0（由单测锁定语义，未入此基准）。粒子 emit 的散列对象属事件期创建，按约束保留。

## 限制与集成者需验证事项

1. FPS/draw call 收益留待渲染验证路实测：本路收益一为 CPU/分配/GC 压力下降，二为寿命修复后不再有 48 个永久加法混合面片的持续过绘（该项对帧耗时的贡献需 GPU 实测）。
2. 曳光视觉行为有意变化：此前永不消失（缺陷），现按 (len+7)/380s 完全退出；请浏览器路确认观感符合"移动弹迹"预期（到端点后可见段收缩消失）。
3. `up.lengthSq() > 1e-8` 的 1e-8 阈值是启发式；极近距离掠射（相机几乎在射线上）会落入回退分支，姿态与未退化帧之间可能有小跳变，但矩阵始终有限。
4. 基准中的构造计数把 three 内部构造也计入，但两版负载一致，差异只来自 effects 路径；`Particles` emit 的普通对象不在此计数内。
5. 本路未跑全套测试/e2e（按 common.md 只跑本路 Node 单测）。
