你是 GLM-5.3-Flash HIGH，视觉补充波次 lane P：视觉对照计划。背景：六阶段已交付，但人工核对 `artifacts/accept-gpu-desert-grey.png` 与 `artifacts/dg-vis/p6-final-medium-*.png` 发现沙漠灰仍偏蓝白矩形白模——A 大/B 点/出生点墙面几乎同一冷色白灰、立面多为一整块直角平面、远景建筑像孤立立方体、木门/石拱/墙基/檐口/门窗阴影/沙尘磨损不足。任务：产出对照计划，**不改任何 src 产品代码**。不提交，不调用子代理。额度紧张：控制在聚焦范围内，不要跑无关测试。

允许动作：下载参考图到 `cf-transport-ship/artifacts/dg-ref2/`（仅供开发目视对照，绝不进运行时资源）；用现有 `artifacts/desert-visual-shots.mjs` 或轻量变体重拍/复用现有截图；读 `src/maps/desert-grey*.js`、`src/textures.js`、`src/env.js` 现状。

参考（目视对照用）：俯视图 https://ol.3dmgame.com/gl/15988.html；A/通道木箱与光照 https://cf.17173.com/content/2015-09-06/20150906102425658.shtml；经典墙体和门洞 https://cf.17173.com/content/2015-03-04/20150304095540179_2.shtml?_platform=PC。若某链接拉取失败，如实记录并用已有 `artifacts/dg-ref/` 旧参考替代，不得编造参考内容。

交付 `.ultra/reports/visual-plan.md`：
1. **对应表**：潜伏者出生点、后花园、A 门/A 大/A 平台/A 小道、中门/桥下、B 洞上下/B 门/B 窗/B 点、保卫者出生点 ↔ 参考图特征 ↔ 本地现有截图文件名，逐点给「现状 vs 参考」一句话差距。
2. **前三个最影响辨识度的差距**（排序 + 理由），不得用 HUD/菜单/天空面积掩盖地面区域。
3. **实施拆分**（供两条并行 lane 的精确工作说明书）：
   - lane M（材质）：`src/maps/desert-grey-materials.js` 单文件——把冷色白灰大面墙改成暖灰/沙石层次（给出具体色值/粗糙度/高度场改动点与现有函数名）、砖/灰泥破损、道路磨损、分档策略（low/medium/high 各自采样成本）。
   - lane D（装饰/立面）：`src/maps/desert-grey.js`（视觉装饰部分）——墙基、门框/木门强调、窗檐、横梁、局部阴影遮片、远景建筑成组街镇立面（替换孤立立方体感）；每项标注：纯 scene 附加（零碰撞）还是需要真实碰撞/遮挡；若新增显著突出体块须放在不可达区域或同步碰撞并复查导航（列出需复查的路线）。
   - 两 lane 的接口约定（材质 id/参数命名）与 D 波不得依赖 M 未交付项的说明。
4. **验证与性能预算**：A 大/中门/B 点/远景同机位前后截图清单；中画质预算目标（draw calls/triangles 现状数字从 accept-gpu 或探针读取）；合批/实例化建议。
5. 报告附：每张所用现有截图文件名与 mtime，确保证据真实。
