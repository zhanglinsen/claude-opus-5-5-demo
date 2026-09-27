# 音频收口接线 — playFlashPop / playSmokePop 替换复用音效

执行：GLM-5.3-Flash HIGH（D 波接线会话收口）。改动文件：仅 `src/game.js` 两行。未提交。

## 改动点

音频 lane（`.ultra/reports/phase-6-polish.md` §3）交付的专用起爆音效接入，替换此前复用的落点音：

| 位置 | 旧 | 新 |
|---|---|---|
| `flashbang(p)`（原 game.js:243） | `audio.playGrenadeBounce(p)` | `audio.playFlashPop(p)` |
| `smokeOut(p)`（原 game.js:270） | `audio.playGrenadeBounce(p)` | `audio.playSmokePop(p)` |

投掷物撞击音 `updateNades` bounce 分支的 `playGrenadeBounce`（|impactSpeed|>2 闸门）保持不变；两个新方法在 `src/audio.js:732/752` 已由音频 lane 交付并带 `_warn` 守卫，game.js 仅改调用。

## 验证

| 项 | 结果 |
|---|---|
| `node --test tests/unit/*.test.mjs`（glob） | **223 pass / 0 fail** |
| `npm run build` | `built dist/index.html 947.9 KB` |
| `node scripts/e2e-wiring.mjs`（覆盖 flash/smoke 起爆路径：flashbang 经 HE 后投掷引爆、smokeOut 经烟雾引爆） | **16/16 通过** |

e2e-wiring 的闪光致盲与烟雾遮挡断言（真实投掷 → 引爆 → 行为翻转）全部保持绿，证明两处起爆调用点替换未影响 detonate 分发与效果接线；音效选择属表现层，无规则语义变化。

## 状态

候选版冻结前最后一次 game.js 改动完成；工作树未提交（合流后建议随波次基线一并落盘）。
