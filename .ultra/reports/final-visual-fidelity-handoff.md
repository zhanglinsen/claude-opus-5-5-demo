# 双地图经典 CF 增强版 · 质感提升最终交接报告

- 实施会话：Workbuddy GLM-5.3-Flash / High（本会话，主实施 + 集成）
- 时间：2026-09-27 21:28 – 2026-09-28 关单（已闭合）
- 工程：`cf-transport-ship/`，分支 `codex/desert-grey`
- **候选提交：`60fed10`**（12 文件，+683/−23；父提交 `c0c28e6`）
- 参考图：`.ultra/references/visual-quality-20260927/{desert-grey,transport-ship}-user.png`
- 前置审核：`.ultra/reports/workbuddy-visual-fidelity-max-review.md`（独立 MAX 只读会话，21:27–21:50，结论 CHANGES_REQUIRED，其 B1a/B1b/B2/B4/B5 即本轮工作令）

## 一、代码改动（按路）

### A 路 — 共享光照与枪械（src/env.js, src/game.js, src/guns.js, src/viewmodel.js）
- **B1a 修复**：`Environment.registerExtraScene(scene)` —— 注册即绑定当前 `envRT.texture` + `environmentIntensity`，去重；`buildEnvMap()` 的同步循环保留为环境键变化时的兜底；apply() 缓存命中分支零改动。`game.js:104` 改为 `this.env.registerExtraScene(this.renderer.vmScene)`。
- 枪械材质：`metal` 0x2b2d30→0x3a3d42 (m0.85→0.78)、`black` 0x16171a→0x24262b (m0.35→0.3)、`steel` m0.95→0.88；手套 0x1b1b1d→0x2b2b2f (r0.62→0.55)、袖口 0x222326→0x2e3034 (r0.9→0.85)。未新增任何灯。

### B 路 — 沙漠灰材料（src/maps/desert-grey-materials.js）
- **B1b 修复**：图片贴图加载回调中清 `roughnessMap`（dispose 旧图）+ 标量 roughness（墙 0.9 / 地 0.85）。
- `compositePhoto()` 合成管线：2×2 交替镜像拼贴进 512(medium)/1024(high) 画布 + 2 层固定种子 fbm 大尺度污渍（种子 9252/9257/9262/9267 按材质错开）+ 边缘/墙底 AO 加深 + 同源驱动 roughness 画布与弱强度法线；`texture.repeat=(0.5,0.5)` 保持世界拼贴米数守恒（uv 已烘焙进 geometry，repeat 是唯一正确旋钮）；sandPath 叠车辙变体；合成失败回退"照片直贴+标量粗糙度"；low 档完全不变；中间纹理全部 dispose，材质数不变。

### C 路 — 运输船表面与人物（src/textures.js, src/character.js；src/map.js 零改动）
- 舱壁白板：板缝分块明度差 ±2-3%、水平缝线（写入高度图与法线对齐）、2 层垂挂锈 streak；甲板：焊缝对比提升 + 交叉划痕 + 防滑纹带状加密；集装箱：棱边磨白 + 底部锈带（侧面+门）。
- 人物：GR +8 盒 / BL +6 盒（盔檐、盔顶、肩垫×2、装具带×2、靴底沿×2），全挂现有骨骼；`HITBOXES` 未动（hitTest 为固定 AABB slab 测试，不遍历渲染几何）；纹理数 Δ0、材质数 Δ0、每阵营顶点 +192/+144。

## 二、验证记录

| 项 | 结果 | 证据 |
|---|---|---|
| 单元测试 | 229/229（三路各自 + 集成后复跑） | — |
| **B1a 运行时确证（修复前）** | 两图默认白天开局 `vmEnvBound=false`、`sceneEnvBound=true` | `artifacts/fidelity-baseline/capture-fidelity-*.json` |
| **VM 绑定定向验证（修复后）** | **10/10**：首次白天开局×2图、day→dusk、dusk→day（缓存命中）、重开、两图切换，绑定全部保持，0 页面错误 | `artifacts/fidelity-verify.json` |
| 路由 e2e（ROUTE_ONLY） | 32/32（C 路人物网格改动后机器人物理/路线/活跃度无回归） | `artifacts/e2e-desert-results.json` |
| 10 次重开 | textures 87–100 抖动无棘轮、geometries 154 恒定、drift −2.7、0 页面错误，pass=true | `artifacts/accept-restart-check.json` |
| file:// 离线冒烟（最终构建） | 两图 ok=true、vmEnvBound=true、0 页面错误 | `artifacts/fidelity-final-filesmoke/` |
| 构建 | dist/index.html 10,281.7 KB（基线 10,277.2 KB，+4.5KB） | build 日志 |

### 固定机位前后对照（medium，1920×1080，有头 Chrome 防节流参数）
- 基线（before，HEAD c0c28e6 + stash 回放的 bldMidW 修复）：`artifacts/fidelity-baseline/`（沙漠 spawn/gunback/overview/blSpawn/aLong/bTunnelLower/mid + 船 spawn/gunback）
- 候选（after，提交 60fed10 构建）：`artifacts/fidelity-after/`（同机位同名）
- low/high 代表截图：`artifacts/fidelity-after-low/`、`artifacts/fidelity-after-high/`（两图 spawn/gunback）

已确认的画面变化：
1. **枪械**：修复前金属件纯黑剪影（机匣/弹匣/枪管），木件正常——与"无 IBL 时金属变黑"因果吻合；修复后向阳/背光均有蓝灰金属反射、粗糙度层次与结构可辨（`desert-grey-spawn/mid/aLong/gunback` 前后对照、`transport-ship-spawn` 对照）。
2. **沙漠灰墙面**：修复前同款深色污渍以镜像"蝴蝶"方式周期重复（单侧墙 4-5 次）；修复后污渍有机化、跨拼块连续、无对称可辨识重复；地面出现大尺度色调/车辙变化（`desert-grey-mid`、`desert-grey-aLong` 对照最直观）。
3. **运输船表面**：舱壁出现板缝网格 + 分块明度 + 缝线垂挂锈；甲板焊缝/划痕/防滑纹更清晰；集装箱棱边磨损与底部锈带（`transport-ship-spawn` 对照）。
4. **人物**：GR 盔檐/肩垫、双方装具带/靴底沿落位（顶点数增量小，剪影辨识保持；细节在近距离截图更明显）。

## 三、性能测量（22:52–23:10，同机 1080p 中画质，AMD Radeon Pro 5500M，有头 Chrome 防节流参数）

### 3.1 正式配对（`artifacts/accept-gpu-fidelity-20260927.json`，4 轮串行，每轮 65s，simTime≥1 起采）

| 轮次 | median | P5 | 纹理/几何 | 负载 前→后 | 判读 |
|---|---|---|---|---|---|
| cand-desert (60fed10) | **60** | 46 | 76 / 87 | 6.4→22.0 | 平静段（load 6–10）**全程锁 60 FPS**；P5=46 完全由末段负载波（10.8→22）造成，帧序列 46–56 低点与负载跳升逐点对应 |
| base-desert (c935ace) | 38 | 17 | 116 / 154 | 22.0→18.2 | **非同源**（早期沙漠版本），仅参考 |
| cand-ship (60fed10) | **44** | **33** | 105 / 154 | 17.1→14.5 | 与 base 同源配对：median 与 P5 双优 |
| base-ship (c935ace) | 41 | 18 | 116 / 154 | 14.0→27.0 | base 测量中段遭遇负载波（14→18.6→28.6），低点 16–20 与波峰对应 |

- **运输船无实质回退：通过**。同窗口配对 44/33 vs 41/18（候选窗口更平静仍双优）；与 20:46 短配对（cand 60 vs base 59，负载 30–49）、20:51 formal run1（双方污染）方向一致。
- **沙漠灰 P5≥55：本轮主机上未获正式达标轮**。最好轮 median 60 / P5 46（负载波尾段拖低 P5）；平静段帧率锁定 60。历史上 57（负载 19–48）与本次 46 均受主机竞争影响。按审核规则不宣称达标，也不以单轮最佳值过关。
- **23:48 与 00:14 两次安静窗口追击均被波吞**（`accept-gpu-desert-calm-20260927.json`：r1 48/26 负载 29.5→63.1、r2 47/28 负载 ~55；23:48 那轮更是在任何测量前毁于孤儿服务器端口冲突，已修复 `7c406ed`）。**本机负载波周期短于单轮 65 秒测量时长**，全程 load<10 的正式窗口在当前主机状态下不可得——22:52 轮的平静段（load 6–10）连续 ~28 个采样锁 60 FPS（垂直同步顶格）是候选真实性能的最强证据。
- **负载波来源已定位（00:25）**：`.ultra/dispatch/platform-night/` 记录 23:25 起用户侧启动了平台扩展 Codex 自动化（harbor/desert/y8/gamemonetize/locale/sdk 六路，各自独立 worktree，日志持续至 00:21+）——整晚 29→190 的负载波与此吻合。注意：`visual-fidelity-pending.md` 门槛（"本文件存在期间平台扩展不得启动"）被该启动越过；各路在隔离 worktree 工作未污染本树，但对所有 GPU 测量窗口构成持续竞争。
- **dist 完整性核验（00:25，回应 23:59 P 路质疑）**：当前 dist 含 `registerExtraScene` ×2 与 B 路种子常量 9252/9257/9262/9267（`compositePhoto` 0 命中系 minify 改名，非缺失）；**22:52 正式轮自动落盘截图（`accept-gpu-fidelity-20260927-cand-desert.png`）显示金属反射枪身与有机化墙面污渍——该轮测的就是保真度构建**，性能结论对 60fed10 有效。
- 启动零帧已排除（simTimeStart=1），B4 前的 P5=0 伪影不再出现。

### 3.2 draw calls / 资源探针（`accept-gpu-fidelity-calls-probe2-20260927.json`，25s×3，负载 19–39 污染窗口，FPS 仅参考、调用率/资源数与负载无关）

| 轮次 | draw calls（main+vm 合计） | 纹理/几何 | 判读 |
|---|---|---|---|
| cand-ship | **≈294 / 帧**（11164/s @ median 38） | 105 / 154 | 与 base 逐帧调用数持平 |
| base-ship | **≈298 / 帧**（9540/s @ median 32） | 116 / 154 | **draw calls 无回退**；候选纹理少 11 张（B 路合成未增材质） |
| cand-desert | ≈147 / 帧（6318/s @ median 43） | 75 / 83 | 低调用数与几何合并策略一致 |

- 采样方法：`renderer.info.autoReset=false` 单调累计 + 相邻样本差值（EffectComposer 每帧 main+vm 两遍，帧尾自动清零会导致帧间读数恒 0/1——第一版钩子已修正并复测）。

### 3.3 资源生命周期

- 10 次重开（`artifacts/accept-restart-check.json`）：textures 87–100 抖动无棘轮、geometries 154 恒定、drift −2.7、0 页面错误，pass=true——B 路合成管线的 dispose 路径正确。
- file:// 离线冒烟（最终构建）：两图 ok、vmEnvBound=true、0 页面错误（`artifacts/fidelity-final-filesmoke/`）。

## 四、审核与关单状态

- 本报告完成后停止写入，交由用户另开 Workbuddy GLM-5.3 旗舰 MAX 只读会话复核（提示：`.ultra/dispatch/workbuddy-visual-fidelity-max-review.md`）。
- 互斥标记、`visual-fidelity-pending.md`、`BLOCKED.md` 的处置已按终审结论执行，详见下方「五、最终验收通过记录」。
- 本轮未启动平台多语言/Y8/GameMonetize；未推送、未发布。

## 五、最终验收通过记录（2026-09-28）

### 5.1 独立终审结论

- **结论：PASS-WITH-CONDITIONS**
- 审核方：独立审核会话（只读复核本报告与 `artifacts/` 证据链）
- 条件项：沙漠灰 P5≥55 未在本机获正式达标轮

### 5.2 条件处置

- **用户决策：接受“主机环境竞争限制”归档——条件已满足**
- 根因判定：主机 Radeon Pro 5500M + macOS 周期性 GPU 窃取 / 热降频，叠加测量期间用户侧平台扩展自动化（23:25 起六路并发）持续推高系统负载；**非代码回退**
- 支撑证据：median 60（平静段）/ 平静段（load 6–10）连续锁 60 FPS / A⁄B 消融证明候选代码修复无罪（cand 44⁄33 双优于 base 41⁄18）/ draw calls 294(cand) vs 298(base)，候选更低

### 5.3 审核纠正：“dist 过期”警示为误判

经独立审核验证，P 路提出的“dist 不含 60fed10 保真度源码”警示**不成立**：

- `compositePhoto` 在 dist 中缺失是 esbuild minify 对局部函数重命名的**预期行为**
- `registerExtraScene`（×2）、`midHallLintel`、种子数字 9252 等压缩安全标记**均存在于 dist**
- 22:52 GPU 测量轮次使用的是**正确的、包含保真度代码的构建**

### 5.4 最终状态

| 项 | 状态 |
|---|---|
| 双地图视觉与性能验收 | **全部闭合** |
| 互斥标记（`workbuddy-visual-in-progress.md`、`visual-fidelity-pending.md`） | **已清除** |
| `BLOCKED.md` | **已标为 RESOLVED** |
| 平台集成 | **已放行** |
| 推送 / 发布 | 未执行（按既有约定） |

- **关单日期：2026-09-28**
