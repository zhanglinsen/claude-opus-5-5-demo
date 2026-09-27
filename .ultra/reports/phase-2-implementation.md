# Phase 2 实施报告（INTEGRATOR 最终集成与验证）

实现者：GLM-5.3-Flash（集成 worker）。时间：2026-09-26。
前置：`.ultra/reports/phase-2-integration-prep.md`（并行期集成准备）、`phase-2-map.md`、`phase-2-movement.md`、`phase-2-map-route-fix.md`。
状态：**阶段 2 完成**。实际模块已装配，一次集成构建 + 必要定向测试 + 真实浏览器流程全部通过。未提交/未部署/未改全局设置。

## 结论（TL;DR）

- 沙漠灰与运输船在同一构建内均可玩；**新玩家（无 URL 参数/无历史设置）默认进入沙漠灰**，旧 `cf_ship_opts` 用户迁移后默认运输船（21/21 e2e 含迁移用例验证）。
- 路线修复报告的「97/97 可达节点、0 拒绝边」**在真实游戏装配下成立**（浏览器内用真实 `World` + `nav.canTraverse` 复核：124 条边被拒 0，97/97 节点可达）。
- 双方队伍 A/B 进攻与回防共 **8 条路线腿全部用真实 `World.move` 逐步物理走通**（含 A 平台上层、B 洞上/下层、桥下通道），单帧水平位移 ≤0.096m、单帧抬升 ≤0.26m（台阶一级），**无任何瞬移/跨障碍直穿**。
- 沙漠灰无海面、无烟囱烟雾/海鸥（`env.ocean:false` + `ambientKey:null`，浏览器断言）；运输船海面与烟囱氛围保留（冒烟回归通过）。
- 机器人由物理驱动在导航图上真实行进（模拟 12s：11/11 发生位移、全部仍在可玩范围内、无掉出/穿墙）。

## 命令与结果（均在 cf-transport-ship/ 下）

| 命令 | 结果 |
|---|---|
| `npm test`（全量单元：registry/settings/modes/desert-layout/height-navigation + 既有套件） | **104/104 通过** |
| `npm run build` | 成功，`dist/index.html 880.6 KB`（bSite 机位修复后重建一次） |
| `npm run test:e2e:desert` | **34/34 通过**（详见下） |
| `npm run test:e2e`（回归：运输船主流程/畸形设置/storage 抛错/地图解析/迁移/file://） | **21/21 通过**（一次失败为用例断言与固定 URL 不符，修正断言后通过，见「修复记录」） |
| `node --test tests/unit/desert-layout.test.mjs`（bSite 机位修复后定向复跑） | 14/14 通过 |

### test:e2e:desert 覆盖（34 项）

1. **真实菜单开局（ui）**：全新用户菜单默认选中沙漠灰且可用（运输船仍可选）→ 点击 `#btnStart` 进入对局、玩家存活。
2. **元数据契约（sim）**：出生点 10+10 个 xyz+yaw 齐全且在边界内、脚底高度=出生点 y；navGraph 97 节点/124 边；teamGoals BL=2/GR=3 非对称；regions=26；导航接口就绪；**无海面/无烟囱泄漏**；lampSpots 就绪。
3. **导航图完整性（真实装配）**：`canTraverse` 全边校验被拒 0/124；从 BL 出生区出发可达 97/97 节点。
4. **路线物理走通（真实 World.move，8 腿）**：
   - BL→A平台包点 110.9m（经 aLong/aPit/aDoor/aSite/aPlatform，终点 y=2.60）；
   - BL→B包点 97.8m（经 **mid/underpass/bTunnelLower**/bSite，即桥下→B 洞下层）；
   - GR→A连接 34.0m；GR→中门北 15.1m；GR→B连接 12.6m；
   - GR回防→A平台 71.7m（终点 y=2.60）；GR回防→B窗 24.9m（经 GR 专用楼梯，y=2.60）；GR→B洞下层 48.7m（经 bDoor/bSite）；
   - 每腿同时断言「无瞬移」：单帧水平位移 ≤0.35m、单帧抬升 ≤0.55m（实测最大 0.096/0.260）。
5. **机器人物理活跃度**：fastForward(12s) 后 11/11 机器人位移 >2m、全部仍在边界内且高于 killY。
6. **报点区域 HUD**：`regionAt(玩家)` 解析出「潜伏者出生点」，随雷达标签显示。
7. **地标/总览截图**：10 个机位（overview/blSpawn/aLong/aPit/aPlatform/mid/underpass/bTunnelUpper/bTunnelLower/bSite）。机位为相机直摆（**仅视觉证据**，非移动证据）；截图阶段临时隐藏第一人称武器与准星，其余 HUD 保留。
8. **运输船冒烟回归**：开局正常、海面与烟囱氛围保留、机器人正常、无页面异常。

## 浏览器证据（artifacts/，已 gitignore）

- 结果 JSON：`artifacts/e2e-desert-results.json`、`artifacts/e2e-results.json`
- 截图：`artifacts/desert-overview.png`（高角度总览）、`artifacts/desert-game-hud.png`（对局 HUD/雷达/报点）、
  `artifacts/desert-landmark-{overview,blSpawn,aLong,aPit,aPlatform,mid,underpass,bTunnelUpper,bTunnelLower,bSite}.png`、
  `artifacts/desert-menu.png`、`artifacts/ship-smoke.png`，及 e2e 既有证据（`e2e-ui-flow.png`、`e2e-file-menu.png`）。
- 视觉检查结论：总览显示封闭街镇布局（非空旷平面散箱）；A大/A大坑/B洞上/下层/桥下均为有顶/有掩体的真实巷道；B区可见包点喷漆与箱群；A平台/A小道为真实 2.6m 高台与楼梯。
- 全部功能性测试为低画质 + 小视口软渲染（800×500 / 640×400）；**不作为性能/帧率证据**（截图内 FPS 标签仅为低画质软渲染实况）。

## 变更文件

集成所有权内（本次最终阶段）：
- `src/maps/registry.js` — 沙漠灰元数据从估算值校准为 DESERT_LAYOUT 实际值：bounds（±44/±38）、radar（92×82、off 46/41、上层区域虚线 overlays：A平台/A小道/B洞上层/B窗房）、loadoutZone（±26 对应实际出生区 z[28,36]/z[-38,-30]）、menu orbit/blurb 微调。
- `scripts/e2e-desert.mjs` — 升级为最终验收形态：导航图完整性复核（0 拒绝边/97 可达）、8 条路线腿（双队 A/B + 回防 + 上/下层/桥下拓扑断言）、关键机位优先截图、运输船冒烟。
- `scripts/e2e.mjs` — 用例 1 断言与固定 `?map=transport-ship` URL 对齐（见修复记录 3）。

跨模块窄修复（MAP worker 已停止，按授权窄改并说明）：
- `src/maps/desert-grey-layout.js` — **bSite 地标机位视线被 B 窗房墙体阻挡**（浏览器截图确认拍到墙面）。先用真实碰撞世界做射线验证：原机位 `t=2.1/16.3m` 被挡，候选中 `(-40,3,-31)→(-28,0.5,-16)` 19.4m 全程无遮挡，据实地标 `V('bSite',…)` 数据。修复后 desert-layout 14/14 复跑通过、重建并重拍截图（B 包点喷漆/箱群清晰可见）。仅此一条数据变更，未触碰导航图/实体几何。

未改动：`src/physics.js`、`src/navigation.js`、`src/maps/desert-grey.js`、`src/maps/desert-grey-materials.js`（worker 交付即插即用）；冻结的早期核心（`src/modes/bomb.js`、`src/ai/`、`src/combat/`、`src/profile/` 及其测试）在独立评审期间一律未动。

## 修复记录（本阶段发现的问题与处置）

1. **e2e 脚本缺陷**（3 处，均为测试自身问题，非产品缺陷）：playwright 不能序列化函数参数（改为页面回调内联行走体）、`pz` 变量遗漏、`bots0` 未传入页面。修复后受影响场景重跑通过。
2. **测试期望错误**：GR回防→B窗 的 `viaAny` 未含 `grStairs`（MAP 报告明确的 GR 专用楼梯路线）。修正期望后通过；路线本身物理可达。
3. **e2e.mjs 用例 1 断言过期**：该用例固定 `?map=transport-ship` 后断言仍写「默认选中沙漠灰」。改为断言「URL 指定运输船选中；沙漠灰可选」；新用户默认沙漠灰由 e2e-desert 用例 1（无 URL 参数）覆盖。
4. **产品缺陷（跨模块）**：bSite 地标机位被墙阻挡 — 见上文窄修复。

TDD 说明：集成准备期的工作先于严格 TDD 要求，不追溯声明；本阶段新发现的缺陷均按「先验证/复现 → 修复 → 复跑受影响测试」处理，其中产品级缺陷（bSite 机位）以真实碰撞射线验证作为失败证据、修复后复跑 14/14 + 重建 + 重拍。

## 已知限制

- 沙漠灰当前可玩模式为团队竞技（默认）与练习定位；爆破规则/UI 属阶段 3（`defaultMode:'tdm'`，`supportedModes` 已含 bomb）。
- 白盒美术：灰白程序纹理/包点喷漆已具备，檐口与远景为纯视觉装饰；最终抛光属后续阶段。
- 导航图边当前全部 `requires:'walk'`（无 crouch/jump 边）；bots 的蹲/跳边消费逻辑已在（契约接口），待后续地图数据使用。
- e2e 的中门/B连接腿走的是 ≤28m 直连捷径（无中间节点，区域列表为空）——符合导航适配层「直连捷径」设计，拓扑断言只对要求预期区域的腿生效。
- 功能测试均在软渲染低画质下进行，未做帧率/性能声明；≥600s 真实渲染、20 回合爆破等最终验收属阶段 6。
- 地标/总览截图为相机直摆（仅视觉证据）；移动正确性由 World.move 路线腿与机器人活跃度检查单独证明。

## 状态

阶段 2 实施完成，停止。协调者可启动独立并行 GLM MAX 评审。
