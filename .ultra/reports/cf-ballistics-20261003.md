CF 弹道修复交付，2026-10-03。基线 b0406ea，产品提交 fb424765f8df5639dcc5d218fed4c4744804130a，分支 codex/cf-desert-ballistics。独立工作树：/Users/sen/.codex/worktrees/cf-desert-shooting/claude-opus-5-5-demo。本次只改特效和中门布局，原工作区产品文件保持原状。

沙漠灰与运输船共用枪械散布、后坐力、命中和穿透代码。已确认沙漠灰中门的地图特有错误：两片可穿透木门被混凝土实体完整覆盖，射向木门先在 3.8m 命中 block 混凝土，实际木门位于 3.85m。现侧墙只保留门框，木门、1.4m中缝与上方门楣保留。碰撞和视觉由同一地图数据生成，木门仍挡人，混凝土门框/门楣仍挡弹。

共用可视弹道另有三处错误：尾迹按已截断头部计算，永不自然消亡；面片正面背向镜头而被剔除；共线时有限矩阵仍导致零宽和纵向失真。现尾部持续推进，头部保留落点裁剪，面片朝向镜头，共线基底采用不平行参考轴。正常路径无新增对象分配，原 FrontSide 材质、速度380、尾迹7m、48实例上限、画质/阴影配置保留。共线现实触发频率尚未证明；这些共享问题不能被称为沙漠灰专有故障。

按TDD执行：木门左侧、右侧分别 RED→最小GREEN；曳光寿命、朝向分别 RED→GREEN。第一版共线测试仅检查有限性，首跑通过，不能证明几何正确；验收补强真实实例顶点、长度、方向与宽度，RED为8通过/2失败（实际纵边2.6870m，应3.8m），最小fallback后首次GREEN10/10。裁剪测试也改为真实几何顶点，避免错误使用缩放Z轴。实际通过：特效10、中门5、已有布局/高度导航/原创沙图46，共61项针对性单测。未重复未变全套测试。

zcode-kit确实并发执行了两路 GLM-5.3-Flash 主体实现，自然成功；另有全新GLM-5.3-Flash（--effort max）只读中门审查自然PASS。续派共线任务生成失败测试后耗尽10次429重试，is_error=true；新的精简上下文也持续429且未执行任何工具，由root仅终止该自有进程并交native agent完成边界修复。独立native审查特效PASS。原失败/限流日志全部保留，未改代理账号或路由。GLM中门审查的哈希工具受其CLI权限限制，root已独立确认冻结两文件SHA256一致。

Chrome实测使用 AMD Radeon Pro 5500M / ANGLE Metal，低画质1000×625，离线经典图集。两图真实菜单开局、鼠标开枪均 shots=1、AWM弹药5→4；受控公开Game/Effects API场景另检查准确射线和逐步渲染。沙漠灰中门射线仅命中 wood/pen，真实traceBullet穿门到z=-37.4；运输船仍在金属障碍处z=-28.3停止。两图首次曳光count=1、法线面向相机且矩阵有限，推进1.25s后count=0；另受控同时生成60条曳光，peak=48、清空后count=0。暖机后几何/纹理数量：沙漠灰93/48→93/48，运输船166/87→166/87。两图页面错误0、外链请求0。此为功能与资源计数验收，没有FPS对照测量，不据此宣称帧率提升。

离线、Y8、GameMonetize三目标构建成功。证据保存在 cf-transport-ship/artifacts/cf-ballistics-20261003：identity.json绑定源码与构建SHA256，candidate-browser.json含逐项结果，baseline-valid-browser.json是有效基线；首个 baseline-browser.json 的速度未初始化导致探针NaN，明确无效且保留，未当验收。before/after截图、所有RED/GREEN、作者/独立报告与实际CLI原始日志均保留。

离线文件：/Users/sen/.codex/worktrees/cf-desert-shooting/claude-opus-5-5-demo/cf-transport-ship/dist/index.html。复现驱动 browser-probe.mjs 的导入及服务器指向本工作树，执行候选场景；构建产物、原始证据未加入Git，产品/测试与本报告提交到隔离分支。
