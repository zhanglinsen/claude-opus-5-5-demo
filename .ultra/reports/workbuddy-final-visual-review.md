# 双地图视觉终审报告（V 路 · 独立视觉审核）

- 审核人：Workbuddy（GLM-5.3-Flash）初步视觉审核 —— **非 GLM MAX 独立终审**，结论供终审参考。
- 时间：2026-09-27 20:25 +08:00
- 工作目录：`cf-transport-ship/`
- 铁律遵守声明：本次审核仅写入本报告一个文件，未运行构建/浏览器/测试，全部结论基于只读的图片与源码审阅。

---

## 一、审核范围与方法

### 参考图（全部逐张查看）
- `artifacts/dg-ref/overhead.jpg`：沙漠灰完整俯视图（= `dg-ref2/ref1-overhead.jpg`，两目录 ref1 系列为重复文件）。
- `artifacts/dg-ref/fp.png`：三联第一人称图（石砌砖墙、拱形洞口、院落）（= `dg-ref2/ref1-callouts.png`）。
- `artifacts/dg-ref/map3.png`：出生区木箱与矮墙（= `dg-ref2/ref1-extra.png`）。
- `artifacts/dg-ref2/ref2-a01.jpg`：中央大厅(2层)——石墙内嵌木门。
- `artifacts/dg-ref2/ref2-a02.jpg`：A区入口——两层楼体，上层有开放式暗色窗洞、绿箱。
- `artifacts/dg-ref2/ref2-a03.jpg`：B区——木格栅顶棚室内、木箱、台阶。
- `artifacts/dg-ref2/ref2-a04.jpg`：中部区域——石墙双开木门、坡地。
- `artifacts/dg-ref2/ref2-a05.jpg`：中央大厅(1层)——大面积封闭砖构室内空间。
- `artifacts/dg-ref2/ref2-a06.jpg`：B区——木梁屋面半覆盖、绿箱、双开木门、露天部分可见蓝天。
- `artifacts/dg-ref2/ref3-wall01.jpg`：保卫者基地——混凝土过街桥/拱洞结构、木栅栏。
- `artifacts/dg-ref2/ref3-wall02.jpg`：B区——高石墙、拱形开口、木屋面覆盖大部分天空。

### 游戏截图（全部逐张查看）
- 沙漠灰（今日 18:30–18:32 产物）：`desert-overview.png`、`desert-landmark-overview.png`、`desert-landmark-blSpawn.png`、`desert-landmark-aLong.png`、`desert-landmark-aPit.png`、`desert-landmark-aPlatform.png`、`desert-landmark-mid.png`、`desert-landmark-underpass.png`、`desert-landmark-bTunnelUpper.png`、`desert-landmark-bTunnelLower.png`、`desert-landmark-bSite.png`、`desert-menu.png`、`accept-gpu-desert-grey.png`（52 FPS，GR 侧视角）。
- 运输船：`accept-gpu-transport-ship.png`、`ship-smoke.png`、`ship-bomb-regression.png`、`e2e-http-match.png`（9-26 旧版对照）。
- 另抽查 `artifacts/visual-candidate/`（8 张，16:0x–16:4x 中间产物）与 `artifacts/dg-vis/` 文件清单（160 张分档历史截图，未逐张重读）。

### 源码（全文阅读）
- `src/maps/desert-grey-layout.js`（solids/ramps/spawns/regions/bombSites/navGraph 全量几何数据）
- `src/maps/desert-grey.js`（实例化与纯装饰：檐口、墙基 AO、门框拱缘、封木窗、B 区木梁屋面、远景环、贴墙裙楼环、路面磨损、灯具、包点喷漆）
- `src/maps/desert-grey-materials.js`（程序化贴图组：sand/plaster/stone/concrete/wood/roofTile 等，含 M1–M5 材质车道）
- `src/map.js`（运输船 buildMap 全量：船体轮廓、甲板 AO 烘焙、集装箱管道、V 形/L 形箱区、五层上层建筑、烟囱、吊机、救生艇、雷达桅）
- `src/maps/registry.js`、`src/maps/index.js`（地图元数据与装配关系；运输船几何在 `src/map.js`，无独立 `transport-ship.js`，属正常结构）

---

## 二、逐区域判定表

判定口径：**通过** = 参考可证实且游戏中已体现；**确证差距** = 参考可证实且游戏截图/源码确实缺失或明显走形；**不确定** = 低分辨率参考无法确认细节，不作差距计。

### 沙漠灰

| 区域 | 判定 | 依据（参考图 + 游戏截图 + 源码） |
|---|---|---|
| 前院出生点 / BL 前院 | 通过 | ref `dg-ref/overhead.jpg` 南侧建筑夹持院落；截图 `desert-landmark-blSpawn.png`、`desert-landmark-overview.png`；源码 `desert-grey-layout.js:88-90`（bldYardW/Center/E）+ `:195` 出生点 |
| A 大（含东楼立面） | 通过 | ref `dg-ref/overhead.jpg` 中部东侧长街；截图 `desert-landmark-aLong.png`（两侧墙、封木窗、A 门拱、坑坡道远景）；源码 `desert-grey-layout.js:145-150` + `desert-grey.js:280-296` 旧城立面 |
| A 大坑 | 通过 | ref 俯视图中路东侧凹形坑区；截图 `desert-landmark-aPit.png`（坑底、石坡道、坑壁）；源码 `desert-grey-layout.js:65,152-153,187-188`（pitFloor/pitWall/双坡道） |
| A 门 | 通过 | ref `dg-ref2/ref2-a04.jpg` 石墙木门意象；截图 `desert-landmark-aLong.png` 远端拱门；源码 `desert-grey-layout.js:147-150`（半开大门 yaw 1.15）+ `desert-grey.js:230-240` 石拱缘 |
| A 平台 / A 区 | 通过 | ref 俯视图东北红圈高台区；截图 `desert-landmark-aPlatform.png`（高台、矮墙、木箱、包点区域）；源码 `desert-grey-layout.js:162-163,186`（aPlatformMain/Arm/宽斜坡）+ 包点 `:232` |
| A 小道 | 通过 | ref 俯视图中路东北侧高架步道；截图 `desert-landmark-overview.png` 可见 catwalk 走廊；源码 `desert-grey-layout.js:164-166`（aShortBase/矮墙/楼梯） |
| 中路 / 中门 | 通过 | ref 俯视图中央红色主线 + `ref2-a04.jpg` 双木门；截图 `desert-landmark-mid.png`（双墙夹持、中门暗洞）；源码 `desert-grey-layout.js:98-104`（双木门板封闭两侧、中缝 1.4m 通行） |
| 桥下 | 通过 | ref `ref3-wall01.jpg` 混凝土上盖通道意象；截图 `desert-landmark-underpass.png`（封闭顶棚 + D4 木横梁）；源码 `desert-grey-layout.js:108-111` + `desert-grey.js:249` |
| B 洞上层 | 通过 | ref `ref2-a03.jpg` 木格栅顶棚通道；截图 `desert-landmark-bTunnelUpper.png`（木梁顶棚、灯具）；源码 `desert-grey-layout.js:113-119` + `desert-grey.js:250` |
| B 洞下层 | 通过 | ref 俯视图西侧暗色通道；截图 `desert-landmark-bTunnelLower.png`（低层洞道、补光灯）；源码 `desert-grey-layout.js:110-111` |
| B 门 | 通过 | ref `ref2-a04.jpg` 石墙双木门；源码 `desert-grey-layout.js:123-134`（门楣、一扇封闭一扇敞开）+ `desert-grey.js:242-244,258` 石作门框与洞内 AO |
| B 窗房 | 通过 | ref `fp.png` 右联拱洞/高窗意象（细节见不确定项）；截图 `desert-landmark-overview.png` 西侧高架房；源码 `desert-grey-layout.js:136-142`（窗洞、GR 楼梯）+ `desert-grey.js:219-221,246-247,259-260` 跳落磨痕与窗檐 |
| B 区（B 点） | 通过（屋面覆盖率为不确定项） | ref `ref2-a06.jpg`、`ref3-wall02.jpg` 半露天木屋面箱区；截图 `desert-landmark-bSite.png`（木梁网格 + 局部屋面板 + 包点喷漆 + 箱群）；源码 `desert-grey-layout.js:171-176` B 区箱群 + `desert-grey.js:298-313` 高木梁/不连续屋面 |
| GR 出生 / 前庭 | 通过 | ref `ref3-wall01.jpg` 保卫者基地区域；截图 `accept-gpu-desert-grey.png`（GR 侧成组建筑与墙体轮廓）；源码 `desert-grey-layout.js:196,223-224` |
| B 连接 | 通过 | ref 俯视图 GR 端西向连廊；源码 `desert-grey-layout.js:85,221`（bldBC 北楼 + 走廊区）；截图总览中走廊轮廓可见 |
| 远景 / 贴墙裙楼环 | 通过 | ref `dg-ref/overhead.jpg` 四周连片屋顶群直贴场地边界；截图 `desert-landmark-overview.png`/`desert-overview.png` 中裙楼环已与围墙衔接、远景环在外，孤岛感已消除；源码 `desert-grey.js:343-400`（D6 远景组 + §5.2 裙楼环 22 段） |
| 材质色调（石作/坑道偏冷暗） | 不确定 | 源码 `desert-grey-materials.js:140-185`（stone tone=140，暖偏移 rr>bb）；`desert-landmark-aPit.png`/`bTunnelLower.png` 观感偏冷暗，但受洞内补光与 AO 影响，低分辨率参考（`fp.png` 灰砖冷暖不一）无法确证超出参考范围 |
| 中央大厅（中门西侧楼） | **确证差距** | 见第三节第 1 项 |

### 运输船

| 区域 | 判定 | 依据（截图 + 源码） |
|---|---|---|
| 整体舱室结构（上层建筑/烟囱/雷达桅/救生艇） | 通过（有审计局限，见注） | 源码 `src/map.js:473-510`（五层退台上层建筑、驾驶台窗带、船名牌、烟囱三段、旋转雷达、救生艇）；截图 `accept-gpu-transport-ship.png` 可见上层建筑墙面、吊机臂、船名环境。注：artifacts 中缺少运输船总览/环绕截图，整体轮廓无法用截图直接背书，属证据缺口而非差距 |
| 甲板 | 通过 | 源码 `map.js:244-274`（船体轮廓甲板 + AO 烘焙 601-630 + 舷边栏杆 + 黄色通道标线 446-447 + 箭头贴花 447）；截图 `accept-gpu-transport-ship.png` 甲板质感与标线可见 |
| 箱区（V 形中路 + L 形堆 + GR 背后堆场） | 通过 | 源码 `map.js:434-443`（半场箱堆/油桶）、`451-455`（V 形斜放集装箱 + 木箱）、`458-467`（三层集装箱墙 + 远处堆场）；截图 `ship-bomb-regression.png` 箱区（ORIENT CARGO/BLACK/LONGINES 等涂装） |
| 二楼集装箱管道（单向道 + 网窗 + 顶棚） | 通过 | 源码 `map.js:369-431`（内墙/实墙+网窗/顶板/角柱/管道灯/入口敞开箱门/尽头箱挡）；截图 `accept-gpu-transport-ship.png` 右侧二楼黄栏杆与蓝色箱壁；registry.js:20-23 雷达虚线框对应 |
| 出生舱室（BL/GR 舱壁） | 通过 | 源码 `map.js:283-318`（舱壁三段+双门+警示条+BL/GR/禁烟/消防标识牌+吊机底座+楼梯+系缆桩+通风筒）；截图 `accept-gpu-transport-ship.png`、`ship-smoke.png`、`ship-bomb-regression.png` 全部要素在画面中可对应 |
| 点位完成度 | 通过（设计即 TDM） | registry.js:11 `supportedModes: ['tdm','practice']`，holds/lanes/flank/rushZone 与练习靶点齐备（registry.js:40-56）；船图为团竞图，无爆破包点属设计而非缺失 |
| 动态细节 | 通过 | 源码 `map.js:535-555`（双吊机 + 吊装集装箱随风摆动）、`501`（雷达旋转）、ambientKey funnelTop（registry.js:34，烟囱氛围） |

---

## 三、确证差距（共 1 项，按玩家可见影响排序）

### 1. 中央大厅（中门西侧楼）缺少可进入的室内空间

- **参考证据**：`artifacts/dg-ref2/ref2-a01.jpg`（中央大厅·2层：石墙内凹木门）、`artifacts/dg-ref2/ref2-a05.jpg`（中央大厅·1层：大面积封闭砖构室内，可进入的多层空间）。
- **游戏证据**：`desert-landmark-mid.png` 中门视角西侧仅为连续实墙；源码 `src/maps/desert-grey-layout.js:74` `bldMidW` 为一整块实心楼（x[-20,-6] z[-24,2] 高 5.5m），无门洞、无室内；中门→B 的迂回完全由露天"桥下"走廊承担（`desert-grey-layout.js:108-111`）。
- **影响**：参考图中这是中路西侧的标志性可进入建筑（含楼层概念），游戏中表现为无层次的整体实心体量；沿中路/桥下通行的玩家看到的墙面缺少参考中的门洞与进深变化。
- **拟改文件**：`src/maps/desert-grey-layout.js`（把 bldMidW 拆为四面壳墙 + 顶板，面向中门/桥下一侧开 1 个门洞，与 `desert-grey.js` 补门框/洞内 AO 装饰），同步核对 navGraph（`desert-grey-layout.js:238-338`）是否引入室内节点。
- **建议修法（一句话）**：将 bldMidW 改为带 1–2 个门洞的空腔壳体并在室内加 1–2 组木箱/柱，使中央大厅至少在一层可进入可见，导航边从中门或桥下接入。
- **验收方式**：重截 `desert-landmark-mid.png` 同机位（`desert-grey-layout.js:359` 中路机位）与 `midDoors` 机位，确认西侧墙出现可辨认门洞与室内进深；`desert-landmark-overview.png` 确认该楼外轮廓与屋顶线未走形。

> 其余候选（B 区屋面覆盖率、A 区入口楼上层开窗、保卫者基地附近拱形过街结构、石作材质冷暖）均因低分辨率参考无法确证，列为不确定，不计入差距。

---

## 四、两图制作完成度对比结论

**两图完成度相近，均已达可交付水准，但证据链完整度不同。**

- 沙漠灰：布局完整（25 个报点区域、双包点、导航图、双出生），装饰分层丰富（檐口、墙基/洞内 AO、封木窗立面、B 区木梁屋面、包点喷漆、褪色路标、路面磨损、远景环 + 贴墙裙楼环），上一轮"孤岛环"修复已在总览截图中得到确认。存在 1 项确证差距（中央大厅室内）。
- 运输船：作为先完成的地图，细节密度更高（动态吊箱摆动、旋转雷达、甲板 AO 烘焙、整套标识牌系统、舱室警示条纹），截图所见区域（出生舱壁、箱区、二楼管道）均无缺口；但其总览证据缺失，整体轮廓只能靠源码（`src/map.js` 结构完整、自洽）背书。
- 若以"截图可证完成的区域占比"计：沙漠灰约 18/19 区域通过（95%），运输船 7/7 区域通过（100%，但样本为第一人称局部视角）。两者不存在明显数量级的完成度落差。

---

## 五、没有确定差距的项及依据

1. **B 区屋面覆盖率**：参考 `ref2-a06.jpg` 本身显示 B 区一半露天一半木屋面，与游戏 `desert-landmark-bSite.png` 的"木梁网格 + 局部屋面板"形态同族；`ref2-a03.jpg` 的全木格栅顶棚更可能对应 B 洞/室内（游戏 bTunnelUpper 已有木梁顶棚）。覆盖率精确比例无法从低分辨率参考证实 → 不确定。
2. **A 区入口楼上层开放式暗窗（ref2-a02）**：游戏采用封闭木窗（`desert-grey.js:279-296`，注释明确为视线管理）；参考中窗洞是否可通行、开口尺寸均无法证实 → 不确定。
3. **保卫者基地附近的混凝土过街拱洞（ref3-wall01）**：该结构的准确位置与所属通道无法从雷达小图确证；游戏桥下/上层坑道体系已提供同类型混凝土上盖空间 → 不确定。
4. **石作/坑道材质偏冷暗**：`stone` 材质为暖灰（rr>bb，tone=140），截图偏暗主要来自洞内补光与 AO；参考 `fp.png` 灰砖本身明暗不一，无法确证超出参考范围 → 不确定。
5. **精确开口尺寸/木格栅顶棚细节/原版尺寸**：布局文件自述为"约 88m×76m 白盒尺度，非精确还原"（`desert-grey-layout.js:5-6,375`），参考图分辨率不足以证实精确尺寸 → 不确定，不作差距。
6. **运输船整体轮廓**：无总览截图属证据缺口（audit limitation），源码结构完整自洽，不构成差距；建议后续补一张运输船菜单环绕/总览截图归档。

---

## 六、结论

- 确证差距：**1 项**（中央大厅室内缺失）。
- 其余全部区域判定为通过或不确定；上一轮贴墙裙楼环修复有效，孤岛感已消除。
- 两图完成度相近，均可进入终审；建议终审时为运输船补总览截图证据，并复核中央大厅是否按参考补齐室内。

---

*报告生成时间：2026-09-27 20:25 (+08:00) · 审核引擎：Workbuddy GLM-5.3-Flash（初步审核，非 GLM MAX 独立终审）*
