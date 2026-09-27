# GPT-6 Luna 单任务试跑：沙漠灰 A 平台轮廓

你是独立执行者，模型为 GPT-6 Luna medium。用户只授权这一项限域任务，用于评估 Luna 是否适合本工程的后续局部开发。当前工作树有大量未提交改动，都是用户与现有 GLM 任务的成果；不得重置、覆盖或整理无关文件。当前没有 GLM 并行写者。

## 目标

看随命令提供的经典参考（俯视图、A 区截图）和当前 A 平台/A 坡道截图，再读 `.ultra/reports/architectural-fidelity-progress.md` 与当前地图代码。指出**一个**仍显著影响 A 平台建筑轮廓辨识度、且有参考依据的差距。若能在不破坏路线/碰撞/交火视线的前提下做一个小范围修正，就按测试先行方式实施；若参考分辨率不足以支持可靠改动，保持代码不变并解释原因。不要为了展示产出而添加无依据的装饰。

## 文件边界

只可修改 `cf-transport-ship/src/maps/desert-grey-layout.js`、`cf-transport-ship/src/maps/desert-grey.js`，以及直接对应的 `cf-transport-ship/tests/unit/desert-layout.test.mjs` 或 `height-navigation.test.mjs`。不得修改 game.js、HUD、bomb、transport、共享渲染/材质、构建脚本、平台扩展草案或其他地图。参考图片仅供观察，不可复制进运行资源。

## 验证预算

改代码前先写或强化一个会失败的结构/路线测试，然后实施并跑 `node --test tests/unit/desert-layout.test.mjs tests/unit/height-navigation.test.mjs`。若几何影响可走区域，再跑一次 `E2E_ROUTE_ONLY=1 node scripts/e2e-desert.mjs`。若可用现有脚本单独拍 A 平台视角，则只拍一张；不要做十机位、双地图 GPU、600 秒长跑或全量测试。没改代码则不跑测试。并发浏览器/GPU 测试不得启动。

## 输出

在最终消息写清：差距与参考依据；改动文件及验证结果；是否建议把 Luna 扩大到更多视觉任务；若没有改动也明确说明。不要宣称整张地图视觉验收完成，不要提交 Git、不推送。
