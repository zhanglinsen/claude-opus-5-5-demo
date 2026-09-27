你是 GLM-5.3-Flash MAX，独立只读审核员，全新上下文。禁止编辑任何文件、禁止子代理；只允许 Read/Glob/Grep 与只读 Bash（node --test、node --input-type=module、git diff/status）。工作目录 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。

审核域：沙漠灰爆破 **规则/C4/Game 协调**（对应实现报告 `.ultra/reports/phase-3-rules.md` 与 `.ultra/reports/bomb-zero-id-fix.md`；契约 `.ultra/reports/phase-3-parallel-contract.md`；规格 `.ultra/specs/desert-grey.md#rules`）。AI/UI 域由另一审核员并行负责，不要重复深审 bots.js 内部与 HUD 渲染细节，但可检查跨 lane 契约对表。

代码范围：`src/modes/bomb.js`、`src/modes/bomb-session.js`、`src/modes/index.js`、`src/game.js`（爆破协调部分）、`src/maps/registry.js`、`tests/unit/bomb-core.test.mjs`、`tests/unit/bomb-runtime.test.mjs`、`scripts/e2e-bomb.mjs`。

必须核实（逐条给证据）：
1. 规格规则参数：5v5/normal/固定阵营/先赢7；准备5s、回合150s、安包5s、拆包7s、引爆40s；安包后 BL 全灭仍等待拆除或引爆；GR 全灭（未安包）判 BL 胜；未安包超时 GR 胜。
2. 玩家数字 id 0：修复后的 `bomb.js` 对 id 0 携包/事实合并/死亡掉包是否正确（读代码 + 运行 `node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs`，原 skip 是否已转真断言）。
3. C4 生命周期：携带/丢弃/死亡掉落/拾取/安放/拆除/引爆事件序列与结算唯一性；临界同帧（如拆除完成 vs 引爆）按精确完成时间仲裁、爆炸优先的平局规则是否实现。
4. 暂停冻结（无墙钟泄漏）、重开清理（计时器/输入/C4/比分）、回合统一复活、死亡观战不泄露敌方（观战列表只含同队）。
5. `objectiveView`/`objectiveCommand` 公共接缝与三个实现 lane 报告声称的字段（plantable/defusable/pickupable/inSite 字符串 'A'/'B'/plantHold/defuseHold/spectate）是否一致；有无布尔 inSite 残留。
6. 运行 `node scripts/e2e-bomb.mjs` 核对 26 项是否真实通过（读 artifacts/e2e-bomb-results.json 时间戳）；抽查两三个用例的脚本内容是否非空洞断言。

输出：最终消息返回完整报告（你是只读会话，不要写文件）：结论（APPROVE / REQUEST_CHANGES）→ 逐点证据 → 缺陷列表（P1/P2/P3，文件:行号）→ 非阻塞建议。基于实际代码与真实命令输出，不得臆测。
