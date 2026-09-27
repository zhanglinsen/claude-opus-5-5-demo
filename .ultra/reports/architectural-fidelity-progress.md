# 沙漠灰建筑轮廓调整记录（进行中）

2026-09-27。用户指出当前最不像 CF 的是**整体布局与建筑轮廓**，据此停止单纯增加贴图细节，改为对照项目已保存的经典端游参考图：`cf-transport-ship/artifacts/dg-ref2/ref1-overhead.jpg`、`ref2-a06.jpg`、`ref3-wall02.jpg`。原图来源见 `.ultra/reports/visual-plan.md`。参考图为低分辨率攻略截图，足以判断楼群连片、B 区半露天顶棚、A 区高台坡道等宏观特征，不足以反推出精确尺寸。

## 本轮具体变化

- 潜伏者前院新增三组有碰撞的街屋，留出中央与 A/B 向巷道；取消一条穿越新建筑的 AI 直连边。出生点实景从正前方空院变为建筑夹出的通路。前后截图可对照 `artifacts/dg-vis/p7-after-medium-blSpawn.png` 与 `artifacts/visual-candidate/blSpawn.png`。
- A 平台由矩形整块改为主台 + 前臂的内凹轮廓；入口楼梯改连续坡面。修复了所有坡面视觉楔形此前遗漏世界坐标、顶面绕序错误、UV 四角坍缩的问题，坡面现在实际可见且有贴图。截图：`artifacts/visual-candidate/aPlatform.png`、`aRamp.png`。
- B 区增设高木梁和断续屋面，形成原图可辨的半露天轮廓；保留射线、碰撞和 AI 通路。截图：`artifacts/visual-candidate/bSite.png`。
- 移开阻断 B 点与 A 平台导航边的箱堆，新增标准角色逐边可通行测试。原先两条被拒边是 `bs3->bs4`、`pf4->pf3`。

## 已验证

- `npm run build`：成功，离线 HTML 约 10,273 KiB。
- `node --test tests/unit/desert-layout.test.mjs tests/unit/height-navigation.test.mjs`：28/28，包括真实碰撞支撑、两图导航适配、全部沙漠灰导航边可通行。
- 最后前院版本浏览器回归 `scripts/e2e-desert.mjs`：34/34，123/123 边通过、97/97 节点可达、双方 A/B 路线物理移动通过、运输船可开局，页面无脚本异常。结果在 `cf-transport-ship/artifacts/e2e-desert-results.json`。
- SwiftShader 1280×720 中画质截图无脚本异常，供视觉判断，不用于 GPU 性能指标。
- 为减少无效等待，`E2E_ROUTE_ONLY=1 node scripts/e2e-desert.mjs` 后续只跑菜单/导航/路线/AI 检查，跳过十机位截图和运输船冒烟；完整脚本留给最终候选。此开关只通过语法检查，尚未单独执行（完整路线已通过）。

## 未完成门槛

- 现有地图依然只是按低分辨率参考估算的可玩重建，街区外轮廓、建筑开口位置和高度不构成原版尺寸级复刻。新街屋仍是简化的矩形砌体；需要再按参考逐点判断是否继续重塑立面和外轮廓。
- 当前主机高负载下同类截图约 10–14 FPS，不能从 SwiftShader 截图推断独立显卡帧率。最终候选需在相对空闲时重新做同机 1080p 中画质对比和长时间资源检查；不能宣称性能通过。
- Sol xhigh 终验报告中的四项功能阻塞已修，但视觉候选仍变化中；定向 Sol 复核保留到候选冻结后。
