# 阶段 4 / C 波 lane 3 — 沙漠灰画面增强报告

执行者：GLM-5.3-Flash HIGH（lane 3，独占 `src/maps/desert-grey*.js`、`src/textures.js`、`src/env.js` 与本报告）。
日期：2026-09-27。基线：阶段 2 路线门禁通过态（97/97 节点可达、8 条真实寻路腿）。

## TL;DR

- 材质升级（漫反射+法线+粗糙度贴图组、做旧细节）、沙漠日照档（洞内外明暗对比、暖色高角度主光）、通行/跳落视觉贴花、灯具优先级重排，全部**纯视觉**，未动任何碰撞/导航/出生点/包点数据。
- 回归：`e2e-desert` **34/34 通过**（含运输船冒烟），单测 **186/186 通过**。
- 自查截图 48 张（高/中/低 × 16 视角）+ 渲染器清单：`artifacts/dg-vis/`（`manifest.json` 含每档渲染器/分辨率/阴影档/曝光）。
- **发现并绕过一个跨 lane 集成缺口**（详见「路由给协调者」）：`WEAPONS` 新增的 flash/smoke 在 `guns.js` builders 表缺构建函数，任何地图 init 都会崩。我未改 `guns.js`，用**临时 shim 验证后已精确还原**，正式修复归投掷物 lane。
- **发现并修复一个中/高档渲染问题**：UnrealBloomPass 把 HDR 天空能量渗满全屏（总览视角发白主因）。根因在 `render.js`（非本 lane），我在 `env.js` 内加 `skyGain` 压低沙漠档可见天空辐亮度作缓解，运输船档不受影响。

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `src/maps/desert-grey-materials.js` | 全量重写。每档材质生成 漫反射+法线(normalFromHeight)+粗糙度 三贴图组；风化细节（水渍/裂缝/起皮/雨痕/螺栓孔/磨光）；新增标识贴花纹理（桥面行进标识、B 窗跳落磨痕、窗台漆条）；包点喷漆改固定种子（截图可复现） |
| `src/maps/desert-grey.js` | ①画质档经 `T.quality` 透传给材质（game.js 不向构建器传 opts）；②新增 3 张纯贴花（桥面/B 窗跳落暗示/窗台漆条），`scene.add` 不进 `world`，零碰撞零导航影响；③灯具锚点重排为「B洞下层→B洞上层→桥下」优先（game.lampLights 只给前 4 个真实点光源，low 档 0 个） |
| `src/env.js` | ①新增 `desertDay`/`desertDusk` 日照档（`ocean===false` 时 day/dusk 自动映射，海图预设一字未动）；②新增 `skyGain` 天空 HDR 增益（onBeforeCompile 注入 `uSkyGain`，只作用于可见天空，PMREM 环境图不缩放）；③主光/半云港色/雾/曝光按沙漠调参 |
| `src/textures.js` | 仅一行：`T.quality = quality`（把画质档带给地图构建器，见上） |
| `artifacts/desert-visual-shots.mjs` | 新增自查截图脚本（playwright-core + 本机 Chrome，参考 e2e-desert 相机直摆做法） |
| `artifacts/dg-vis/` | 48 张三档对比截图 + `manifest.json` + 排查用 probe 截图 |
| `src/guns.js` | **零净变更**（验证期临时 shim 已按字节级备份精确还原，备份留在 `.ultra/dispatch/guns.js.lane3-backup`） |

未触碰（按 lane 约束）：`game.js`/`hud.js`/`bots.js`/`player.js`/`touch.js`/`combat/`/`modes/`/`registry.js`/`render.js`/`physics.js`/`navigation.js`。碰撞几何、导航节点、出生点、包点位置与玩法尺度 100% 未变（`DESERT_LAYOUT` 一行未改，e2e 路线腿与无瞬移断言原样通过即为证据）。

## 2. 材质与光照参数依据

### 材质（desert-grey-materials.js）

- 画质分档：**low = 128px、无法线贴图**（省一次采样，辨识度靠漫反射，见 `low-bTunnelLower.png` 仍可辨）；**medium = 256px；high = 512px**（法线+粗糙度全量）。粗糙度图编码绝对值（`roughness=1.0` 作乘数）。
- 各材质设计（对照参考图 `artifacts/dg-ref/fp.png`：灰白灰泥墙、强日照硬阴影、沙色地面、深色木箱）：
  - `sand`：风蚀波纹（正弦+fbm 相位扰动）入高度场，沙粒高频噪声，30 颗凸起碎石；粗糙度 0.92±0.06。
  - `plaster`：水渍竖向渐变带 ×8、凹入高度场的裂缝 ×4、起皮露底斑 ×5；基色 #d8d3c6。
  - `plasterB`（远景建筑）：同源、细节减半、基色略暗（198,191,174）——远景降频保性能。
  - `stone`：错缝砌块逐块随机色，凹缝（砂浆）入高度场+边缘倒角，A大坑坑壁/A平台侧墙用。
  - `concrete`：模板缝十字、四角对拉螺栓孔（凹）、雨水竖痕；桥下/B窗房支座等用。
  - `wood`/`woodDoor`：板缝凹入+木纹凸筋入高度场，磨光磨损斑（albedo 提亮+同遮罩降低粗糙度场，磨光处高光略强；P3-a 修复后与原声明一致），门板横撑+铆钉。
  - `roofTile`：横向瓦垄正弦高度场+褪色斑。
  - 种子全部固定（mulberry32 + fbm seed），截图与验收可复现。

### 光照（env.js desertDay / desertDusk）

| 参数 | 值 | 依据 |
|---|---|---|
| sunElev / sunAzim | 55° / 115° | 与注册表 env 一致（注册表优先，preset 为兜底）；高角度强阴影=参考图日照形态 |
| sunColor / sunInt | 0xffeed8 / 3.0 | 灰白墙 albedo≈0.85，主光压在 3.0：受光面辐射 < bloom 阈值 3.2（高档无墙面泛白），ACES 后留高光余量 |
| hemiInt / hemiSky / hemiGround | 0.12 / 冷天光 / 沙色 | 低于海图（0.15/0.17 初版 0.2 过亮）：露天被主光主导，**洞内（B洞上下层、桥下）只剩 hemi+IBL≈0.4 辐照 → 明暗对比**，洞内由灯具补光（见 `high-bTunnelLower.png` 灯池 vs `high-bSite.png` 露天） |
| envInt | 0.32 | 同上，压环境反照保对比 |
| exposure | 0.55 | 配合 sunInt 3.0（初版 4.2/0.62 过曝，已回退） |
| fogColor / fogDensity | 0xc7bba2 / 0.0012 | 沙尘暖灰雾，沿用注册表值 |
| skyGain | 0.25（dusk 0.3） | 见下节 bloom 问题 |
| cloudCover | 0.3 | 沙漠少云 |

### bloom 渗白问题（本 lane 内缓解，根治需 render.js）

现象：中/高档总览视角整屏发白（低档正常），关灯/关雾/换材质均无效。逐项排查（probe 截图在 `artifacts/dg-vis/probe-*.png`）后定位：`render.js` 的 `UnrealBloomPass`（`quality !== 'low'` 全开，threshold 3.2）读 HDR 缓冲，而 Sky 输出物理辐亮度（远超 3.2），多级模糊把亮天空能量渗满全屏；总览视角天空占比最大故最惨。阶段 2 门禁全用 `q=low`（无 bloom）所以从未暴露。
本 lane 缓解：`skyGain` 只压**可见天空**（bloom 源头），0.25 时总览与低档观感一致（对比 `probe-skygain.png` vs `probe-nobloom.png`），附带把天空从过曝白修回蓝色。
**根治建议（归 render.js owner / D 波）**：bloom threshold 提到 ~8-10，或把天空盒排除出 bloom 输入。运输船中/高档理论上同样受益（其低帧海面泡沫/白色上层建筑同样在给 bloom 供能）。

## 3. 截图

- 三档 × 16 视角 = 48 张：`artifacts/dg-vis/{high,medium,low}-{overview,blSpawn,grSpawn,aDoor,aLong,aPit,aPlatform,aShort,mid,midDoors,underpass,bTunnelUpper,bTunnelLower,bDoor,bWindow,bSite}.png`
- 渲染器/分辨率/阴影档/太阳高度/曝光：`artifacts/dg-vis/manifest.json`（本机 Chrome headless + SwiftShader 软渲染，1280×720，pixelRatio 1，WebGL2；阴影 4096/2048/1024 按档）。
- 截图脚本：`node build.mjs && node artifacts/desert-visual-shots.mjs`。
- 遵 lane 约束：**本报告不声称任何 FPS 成绩**（软渲染 10-14 FPS 无意义，E 波统一实测）。

## 4. 与参考图差异表（尺寸为按 1.75m 人物比例的估算，不宣称精确原版）

参考：俯视图 `artifacts/dg-ref/overhead.jpg`、实景 `artifacts/dg-ref/fp.png`、攻略页（spec 链接）。

| 地标 | 参考图特征 | 本图（布局+本波视觉后） | 偏差评估 |
|---|---|---|---|
| A 门/A 大 | A 大为宽街、A 门为窄门洞+半开木门 | 8m 宽 A 大、4m 门洞半开木门（`high-aDoor.png`） | 走廊尺度接近；门洞比参考略宽（原版约 2-3m），可接受 |
| A 大坑 | A 大中段下沉坑，两端坡道 | 8×16m 坑、坑底 -1.8、南北坡道（`high-aPit.png`） | 形态一致；深度估 -1.8m（原版约 2m+） |
| A 平台 | 高台包点+斜坡楼梯 | 2.6m 高台、南端楼梯、木箱掩体（`high-aPlatform.png`） | 一致；平台面积略大 |
| A 小道 | 高架小道连中路与 A | 楼梯→2.6m 高台→下台（`high-aShort.png`） | 一致；无参考中的 90° 转角（拉直了） |
| 中门/中路 | 中门双木门窄缝 | 1.4m 中缝双木门（`high-midDoors.png`） | 一致 |
| 桥下/B洞上层 | 桥下通道上方为 B 洞上层（桥） | 净空 2.3 通道+2.6 桥面（`high-bTunnelUpper.png` 桥面已加行进标识） | 一致 |
| B洞下层 | 低矮隧道 | 顶板 2.3、暖光灯池（`high-bTunnelLower.png`） | 一致 |
| B 门/B 窗 | B 门双开木门、B 窗房窗洞跳落 | 木门×2、窗台 3.6、跳落磨痕+窗台漆条（`high-bWindow.png`） | 窗洞位置一致；跳落本波加了视觉暗示（见 §5） |
| 双方出生 | 南 BL / 北 GR 开阔街区 | 南北出生区+前庭/前院 | 一致 |
| 整体密度 | 密集街镇、狭窄巷道 | 体量建筑封死非通路区+远景轮廓圈 | 本图巷道比原版**宽**（白盒通行余量），封闭感靠远景建筑环+檐口补足 |
| 色调 | 灰白墙/暖沙地/深木色、硬阴影 | 已对齐（灰泥/沙/木三族材质+暖主光冷阴影） | 阴影内墙面偏冷蓝（hemiSky 冷色），参考图同样偏冷，接受 |

## 5. 给 D 波（HUD/样式整合）的注意事项

1. **HUD 无需改**：报点区域、回合/C4/战绩 UI 与布局数据未变；本波只加了 3 张地面贴花（`renderOrder=1`，透明、polygonOffset -2），若 D 波要加自己的地面指示（如包点高亮），注意与 `siteA/siteB/bridgeMark/dropScuff/sillPaint` 的 renderOrder/深度冲突，建议统一走 `polygonOffsetFactor ≤ -2`。
2. **bloom 建议**：D 波若动 render.js，请按 §2 的根治方案处理 bloom 阈值；处理完可把 `desertDay.skyGain` 从 0.25 回调到 ~0.5 让天空更亮（当前 0.25 是绕过 bloom 的保守值）。
3. **小地图/雷达**：`radar.overlays` 虚线框与上层面位置未动；贴花不进碰撞，不会出现在雷达碰撞过滤里。
4. **触屏 low 档**：无法线贴图+128px 材质+0 点光源是 low 档预期效果（`low-*.png`），D 波勿按中/高档截图反馈"画质差"。
5. **灯具锚点顺序已变**：`map.lampSpots` 前 4 个现在是 B洞下层/B洞上层×2/桥下西端。若 D 波或后续代码消费 lampSpots 顺序，请按"洞内优先"语义对待（数组位置=真实点光源分配优先级）。

## 6. 路由给协调者（跨 lane 事项）

1. **[阻塞级] guns.js builders 缺 flash/smoke**：`WEAPONS` 已含 `flash`/`smoke`（投掷物波新增），但 `guns.js` 的 `builders` 表没有对应构建函数；`game.makeIcons()` 遍历 `Object.keys(WEAPONS)` 时抛 `builders[id] is not a function`，**Game.init 中断、所有地图无法开局**（与本波改动无关，投掷物波在途集成缺口）。本波为完成验证，临时加入占位构建函数并**已按字节级备份精确还原**（备份：`.ultra/dispatch/guns.js.lane3-backup`，diff 已验证为空）。请路由给投掷物 lane：在 builders 表补 `flash(m)`/`smoke(m)` 正式枪模（临时 shim 内容可参考本报告存档或 git 无痕——shim 未提交）。**本报告的 e2e 34/34 与全部截图是在临时 shim 构建下取得的**；shim 只影响图标渲染的输入，不影响本波任何视觉结论。
2. **[建议] render.js bloom 阈值**：见 §2。属 E 波/D 波性能与画质收敛范畴。

## 7. 验证证据

- `node scripts/e2e-desert.mjs` → **34/34 通过**（含碰撞校验 0 拒绝边、97 节点全可达、8 条物理走通腿、机器人活跃度、运输船冒烟）。**时间线更正（P3-b）**：本 lane 的 34/34 运行发生在 9/27 凌晨（本地 ~02:5x，guns.js 临时 shim 验证态）；现存 `artifacts/e2e-desert-results.json`（2026-09-26T19:36:30Z / 本地 03:36:30）是 guns 修复 lane 在正式补齐 flash/smoke builders 后复验重新生成的——即本报告初稿的「本次运行重新生成」表述不实。审核（phase-4-review-visual.md）已独立核验该 JSON 晚于全部 src mtime 且 34/34 在当前代码态成立，证据反而更新鲜。
- `npm test` → **186/186 通过**（含 desert-layout 契约测试——证明布局/碰撞数据未动）。
- `node build.mjs` 构建通过（esbuild 产物 ~917KB）。
