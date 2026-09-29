# 独立审核的逐条处理记录

审核者：GLM `glm-5.3`（旗舰，max，只读，新上下文，51 轮、50 次工具调用）。原始报告：`REVIEW-glm-report.md`。审核对象：`7d0ca83`。
处理原则：**不采信自述**，每条都对照代码核实后再处理；先补会变红的测试，再修实现。

| 编号 | 审核结论 | 我的核实 | 处理 |
|---|---|---|---|
| A1 重要 | `isPlaying()` 不含 `!adPaused`，广告暂停期间触屏输入可穿透到冻结的对局 | **成立**。`game.js` 的 `enterAdPause()` 只置 `adPaused` 并停循环、不置 `paused`；`player.pressed` 每帧末才清，广告结束后第一帧补触发 | 已修：`isPlaying()` 加 `!g.adPaused`；同步契约 §2 与 `fake-env.mjs`；新增 3 条测试（动作按钮、摇杆/视角、模块层），修前变红 |
| A2 重要 | `resetTouchState()` 不清 `mouse.lp`，暂停后恢复可能走火一发 | **成立，而且是我自己写的**：`fireDown` 置 `mouse.lp`，清零清单里却没有它；`rp`（“镜”按下置位）同理 | 已修：清 `mouse.r/lp/rp`；补 2 条测试（blur 与“按住开火+暂停”），修前变红 |
| S1 建议 | iPadOS 13+ UA 伪装成 Macintosh，不显示“添加到主屏幕” | 成立 | 已修：`Macintosh` + `maxTouchPoints > 1` 视为 iOS；测试覆盖 iPad 与无触点桌面 Mac，修前变红 |
| S2 建议 | `menu.js` 的 `aria-label` attach 时一次性取词，切语言后不更新 | 成立，仅无障碍标签陈旧，按钮文本本身会更新 | **不改**，记为已知边角 |
| S3 建议 | `destroy()` 后 window 监听仍在，resize 会重建探针 | 成立 | 已修：`_destroyed` 标志，`_scheduleLayout` 早返回；测试修前变红 |
| S4 建议 | 模块 detach 后 `_placed` 残留已移除元素 | 成立，仅无效样式写入 | **不改**：需要给契约加注销 API，收益太小，记为已知边角 |
| S5 建议 | `menu-module.test.mjs` 标题写“9 个按钮”实际断言 8 个 | 笔误，成立 | 已修 |
| S6 建议 | `shell.test.mjs` 允许 `MOBILE_BASE` 覆盖基线 | 属设计取舍：默认值正确，仅在被误设时会对错误基线断言 | **不改**，已在测试注释里说明 |
| 弱点 1 | “导入无副作用”测试受 ESM 模块缓存影响，若排到别的 import 之后会静默空转 | 成立（这正是项目里出现过的那类假绿） | 已修：改在**子进程**里导入；变异验证：在 `fullscreen.js` 顶层加一行 `window` 访问，该测试变红，已还原 |
| 弱点 2 | 缺“按钮触摸不会同时变成视角触点”的端到端断言 | 成立 | 已补：断言按钮 `touchstart` 的 `stopPropagation`/`preventDefault`（这条修前就是绿的，代码本来是对的，属防回归） |
| 弱点 3/4 | HUD 只测声明的盒子；浏览器主体未跑 | 已知，报告与 `test.todo` 已如实声明 | 无需处理，仍待浏览器/真机 |

## 审核者认为没问题、我也复核过的重点
桌面路径零变化的机械证据（早返回、`style.css` 块外逐字相同、`catalogs.js` 只增 7 个 `touch.*` 键、`index.html` 只增 meta、禁区零触碰）、E1–E8/E14 落实、暂停交互矩阵、音频挂起/恢复顺序、泄漏与幂等、层叠关系、几何。

## 结果
处理后：移动端 + 兼容契约测试 220 项，218 通过、0 失败、0 跳过、2 待办；守卫对性能基线通过。
审核者**未**运行任何浏览器/构建/accept 脚本，也没有发现阻断项；它的“可作为合并候选”结论的前提是：任务 9 的浏览器验收与 `device-checklist.md` 的真机验证仍须完成，且合并需用户确认。

## 一点说明
审核者在“需要真机/浏览器确认”一节列了 6 项，与 `device-checklist.md` 已有条目一致（`.screen` 上的双击缩放、iOS 后台事件顺序与 `interrupted`、HUD 真实包围盒、`orientationchange` 晚于视觉旋转、`screen.orientation.lock`、热区手感）。其中“`.screen` 上的双击缩放”是它新补的一条细节：画布与按钮有 `touch-action:none`，但 `.screen` 故意没设（要保留滚动），所以那里的双击缩放是否发生需真机确认，我已把它加进清单。
