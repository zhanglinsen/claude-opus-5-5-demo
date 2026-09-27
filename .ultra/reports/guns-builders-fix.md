# guns.js builders 缺 flash/smoke 集成缺口修复

实施：GLM-5.3-Flash HIGH（投掷物/战斗 lane 会话延续）。授权文件：`src/guns.js`、`src/viewmodel.js`、`tests/unit/guns-builders.test.mjs`（新）。未动 weapons/game/hud/其它文件，未提交。

## 缺口与修复

`src/weapons.js`（C 波）新增 `flash`/`smoke` 后，`guns.js` 的 `builders` 表无对应构建函数；`game.makeIcons()`（game.js:133-134）启动遍历 `Object.keys(WEAPONS)` 调 `buildGunMerged(id)` → `builders[id] is not a function`，Game.init 中断、所有地图无法开局。同根因影响 `viewmodel.js:101` 的 `buildGun(id)`（装备该投掷物时同样会炸）。

改动：
1. `src/guns.js`：`builders` 表导出（`export const builders`，供测试锁定完整性），新增 `flash(m)` 与 `smoke(m)` 两个程序化 builder（风格/写法与既有 `he`/`c4` 一致：part/CY/BX/Torus + anchor('grip'/'muzzle')，材质复用 gunMaterials 的 steel/metal/black/tan/olive）。
2. `src/viewmodel.js`：HIP 表补 `flash` 与 `smoke` 持握姿态（参考既有 `HIP.he`，闪光弹略微抬起俯仰角区分长条造型）；此前缺项会静默回退 `HIP.ak47`，姿态不合理但不崩溃。

## 模型描述（只求辨识度与风格统一）

- **flash 闪光弹**：细长钢色圆柱筒身（r17mm×95mm）+ 上下端盖；侧身 4 道浅色斜纹带（略宽于筒身两侧露出）；顶部 4 个黑色泄气孔 + 黑色引信帽；侧挂保险杆（lever）与钢色拉环（pin torus），与 he 的拉环写法一致。anchor：grip(0,-0.01,0)、muzzle(0,-0.06,0)。
- **smoke 烟雾弹**：军绿宽罐体（r30mm×110mm，M18 造型）+ 上下金属箍环；环身浅色色带（灰烟标识）；顶部 4 个排气孔、侧挂拉杆与拉环。anchor：grip(0,-0.015,0)、muzzle(0,-0.065,0)。

## 红绿证据

- 红：`node --test tests/unit/guns-builders.test.mjs` 首跑 fail —— builders 未导出（import 报错）+ 表缺 flash/smoke。测试内容：遍历 `Object.keys(WEAPONS)` 断言每个 id 在 builders 表有函数（同时封死未来新增武器忘建模型的回归；几何能否真正构建由浏览器 e2e 兜底，node 无 DOM 不建几何）。
- 绿：补齐后 1/1 通过。
- `npm test` → **187/187 通过**（此前基线 186 + 本测试 1）。
- `npm run build` → `built dist/index.html 918.4 KB`。
- **`node scripts/e2e-desert.mjs` → 34/34 通过**：真实浏览器 init 不再崩，运输船+沙漠灰可开局（含碰撞校验 0 拒绝边、97 节点全可达、8 条物理腿、机器人活跃度、"运输船仍可开局"冒烟、"无页面脚本异常"）。结果与截图在 `artifacts/`。
- `node scripts/e2e.mjs` → 21/21 通过（运输船全量 + file:// 冒烟 + 无脚本异常）。

## 对视觉 lane 截图证据有效性的影响评估

视觉 lane（`.ultra/reports/phase-4-visual.md` §6）的 34/34 与全部截图是在临时 shim 下取得的，其自评"shim 只影响图标渲染的输入，不影响本波任何视觉结论"。复核如下：
- **结论仍成立，且已获无 shim 复验**：本修复后（真实模型、无 shim、无备份残留）重跑同一 `e2e-desert.mjs` 仍 34/34 —— 其关于地图/光照/氛围/碰撞/机器人活跃度的视觉证据在最终代码上等效成立，不依赖 shim 内容。
- **唯一被取代的部分**：若其存档截图包含 flash/smoke 的**图标外观**，那是 shim 几何的渲染结果，已被本次正式模型的图标取代；如需 flash/smoke 图标的像素级视觉确认，应以本次 `artifacts/` 的新截图为准。
- shim 已按字节级还原（其 diff 验证为空），本次构建不含任何 shim 残留。

## 后续接线提示（D 波）

- builders 的 `lever`/`pin` 命名部件可用于第一人称拔销动画；`anchor('grip'/'muzzle')` 与 he 相同约定。
- 投掷物世界模型沿用 `game.throwGrenade` 现有 `buildGunMerged('he')` 的用法，D 波接 flash/smoke 时改为按武器 id 取 `buildGunMerged(id)` 即可（现在三枚投掷物都有模型）。
