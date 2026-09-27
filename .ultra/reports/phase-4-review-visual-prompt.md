你是 GLM-5.3-Flash MAX，独立只读审核员，全新上下文。禁止编辑文件、禁止子代理；只允许 Read/Glob/Grep 与只读 Bash（node --test、node --input-type=module、git diff/status、只读截图查看）。工作目录 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。

审核域：C 波 **沙漠灰画面**（实现报告 `.ultra/reports/phase-4-visual.md`；规格 `.ultra/specs/desert-grey.md#map`）。

代码/证据范围：`src/maps/desert-grey-materials.js`、`src/maps/desert-grey.js`（视觉部分）、`src/env.js`、`src/textures.js`、`artifacts/dg-vis/`（48 张三档截图 + manifest）、`artifacts/desert-visual-shots.mjs`、`artifacts/e2e-desert-results.json`。注意 guns.js 此后已由投掷物 lane 正式修复（`.ultra/reports/guns-builders-fix.md`），e2e 已在无 shim 态复验 34/34。

必须核实：
1. **玩法冻结**：读 git diff / 代码确认 `DESERT_LAYOUT`、碰撞体、导航节点、出生点、包点、报点区域一行未变；贴花不进 world（零碰撞零导航）。运行 `node scripts/e2e-desert.mjs` 或读取最新 results JSON 验证 34 项（97 节点可达、8 物理腿、0 拒绝边）在当前代码仍成立。
2. **规格符合**：材质三贴图组、风化细节、固定种子；desertDay/dusk 日照（运输船海图预设未动）；低/中/高三档策略（low 128px 无法线/0 点光源是否如实声明）。
3. **地标辨识**：查看 artifacts/dg-vis/ 至少 8 张关键视角截图（overview、aDoor、aPit、aPlatform、aShort、midDoors、bTunnelLower、bWindow、bSite、双方出生点），对照报告 §4 差异表与规格地标清单，评估轮廓/通道尺度/掩体/明暗是否可辨识；报告差异表是否诚实（承认巷道偏宽、A 小道拉直等）。
4. **bloom 缓解**：skyGain 方案是否只影响可见天空、海图不受影响（读 env.js onBeforeCompile 注入）；根治建议是否合理留档。
5. **性能声明纪律**：报告是否未声称 FPS 成绩；low 档截图是否被如实标注为预期效果。
6. 越界检查：git status/diff 是否只见授权文件（maps/desert-grey*、env.js、textures.js、artifacts）；guns.js 备份还原是否可验证（diff 为空）。

输出：最终消息返回完整报告（不要写文件）：结论（APPROVE / REQUEST_CHANGES）→ 逐点证据 → 缺陷列表（P1/P2/P3，文件:行号）→ 非阻塞建议。
