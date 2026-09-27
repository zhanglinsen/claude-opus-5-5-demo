你是通过 CLI 调用的 GLM-5.3 旗舰，effort=max。当前是沙漠灰/运输船单文件游戏的收口。请直接工作，不开子代理、不提交或推送。

范围：仅 `cf-transport-ship/src/game.js`、`src/actor.js`、`src/player.js`、`scripts/e2e-bomb.mjs`、`scripts/accept-restart-check.mjs`（按真实根因最小修改）及 `.ultra/reports/flagship-c4.md`。绝不碰 `src/env.js` 或其他视觉文件；另一 CLI 进程会处理它们。仅做必要的聚焦验证，避免无关全量重跑。

已知事实：`.ultra/reports/visual-integrate.md` 记录 id0 携包断言 3/3 失败，`carrierId=0` 但 `carryingC4=false`。前一 Flash 进程已把 e2e-bomb 第 8 节改为 8 个 rAF 的逐帧采样；它跑出一次 `e2e-bomb:36/36`，前 8 帧均 `carrierId=0, carrying=true`，但进程因 Flash 额度耗尽退出，未交正式报告。请查明原先失败是否是开局观察竞态，是否有真实引擎状态不一致；不要仅靠等待来掩盖真正缺陷。若真实逻辑有问题，按 TDD 写聚焦失败测试再修；若只是浏览器观察竞态，采用事件/稳定条件等待并证明实际玩家可携包、掉包、按 5、安放，且测试断言仍有意义。保留真实走路、真实输入链路。

另请独立判断 `accept-restart-check.mjs` 的 10 次重开判据：原两次数据分别为 textures `[99,98,98,101,97,98,97,88,98,98]` 和 `[97,99,101,97,98,98,98,99,97,101]`，geometries 恒定 154、drift -3.7/0、无异常。当前 >+3 单步即 fail。只有数据支持时才调整判据（例如阈值 5 + 首尾趋势 + geometry 恒定），不能只改断言求绿；可重跑一次真实重开验证。报告要写旧数据与新数据、判据理由。

必要验证：`npm run build`、`node scripts/e2e-bomb.mjs` 两次，必要时聚焦 unit 或重开脚本一次。若 e2e 环境偶发超时，指出发生位置，不把环境异常说成通过。写 `.ultra/reports/flagship-c4.md`：根因、修改、红绿/两次浏览器证据、重开判据证据、剩余问题。控制上下文和工具输出，最多 30 turns；模型额度有限。
