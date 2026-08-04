# 当前待办与状态速览（2026-08-03）

## 待办（近期）

- [ ] **客户端发版前，教师端不要发 CMP 补偿码**：教师端补偿码面板已上线（teacher.cspstudy.top），但学生端旧版（v1.7.26）不认识 CMP- 码，兑了只会提示无效；等客户端新版本发版后再开始发补偿码。
- [x] **PetWindow 加“超时强制显示”兜底**：已实现 2.5s 超时强制显示 + `pet-companion-shown` 事件握手；`waitForCompanionVisible` 双通道（事件 + isVisible 轮询）确认，10s 超时自动回滚位置并销毁窗口（2026-08-04）。
- [ ] **新客户端发版内容清单**（代码已就绪、未发版）：补偿码 CMP 兑换、优秀码服务端校验、优秀码仅当天有效（北京时间）、学生端移除本地密钥 `csp-coach-2025`。
- [x] **阅读题“没选项”修复（代码已改、未发版）**：① `refreshQuestionBankV2` 改为内容级校验（版本号相同也比对缓存 sha256 与远程 manifest，不一致强制重下/丢弃坏缓存）；快照选择同版本优先内置；② `toLegacyQuestion` 兜底：带 code、无 options、有 children 的 choice 自动按 reading 转 multipart；③ 选择题入口过滤掉无选项题。测试 120/120、构建通过、坏缓存 e2e 复现通过。**需随下个客户端版本发版**。
- [ ] 发版后提醒老师：优秀码“当天有效 + 需联网兑换”。

## 性能优化 backlog（Windows 卡顿，待真机验证后推进）

1. 精灵动画 background-position → transform（合成器动画，最大收益）
2. Canvas + 固定低帧率（15-20fps）/ 失焦暂停
3. petStore save() 合并防抖（43 处调用 → 300-500ms 合并）
4. pet-data-sync 按窗口切片（只发该窗口需要的宠物，不发全量）
5. SQLite 双写降频（localStorage 为主、SQLite 低频兜底）
6. 主 bundle 路由懒加载（1.4MB）；lessons.json 2.8MB 启动优化
7. 隐藏宠物窗口 WebView2 TrySuspend；additionalBrowserArgs 真机验证
8. quizStore.errors 上限（当前无上限累积）

## Windows 第二智子卡死专项（2026-08-04 已改代码，待真机验证）

- 已实现：① PetWindow 2.5s 超时强制显示（远程素材下载慢不再“假成功”）；② 设为桌面伙伴需等窗口真正可见，超时自动回滚并销毁窗口；③ 启动恢复 pet-2/pet-3 改为非阻塞 + 8s 超时 + 失败清位；④ 收回/隐藏桌宠时暂停 WebView2 渲染并销毁窗口（不再后台 60fps 重绘）；⑤ Windows 注入 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu-compositing`（针对透明多窗口 GPU/合成器崩溃类）。
- 第二轮（Windows 实机仍卡死在“正在加载课程数据..”后追加）：⑥ pet-2/pet-3 在 Windows 上改用独立 WebView2 用户数据目录（`appdata/webview2-pet-{slot}`），把桌宠窗口与主窗口进程隔离（Tauri #8196 同类问题，共享环境创建第二个窗口会把整窗拖死）；⑦ 收回改为“暂停渲染 + 隐藏”，不再 destroy（避免等待挂死的 WebView2 进程阻塞主线程）；⑧ 窗口偏好（尺寸/漫游）同步到 SQLite，独立环境 localStorage 不共享后仍能跟随主设置。
- 第三轮（Windows 实机：开启/收回不卡了，但智子不显示、软件关不掉、强杀后重启卡加载）：⑨ Windows 主窗口点 X 改为真正退出整个应用（原来统一“关闭→隐藏托盘”，只能强杀导致下次启动异常）；⑩ pet-2 窗口数据改为轮询重试（独立环境 localStorage 为空 + SQLite 异步写入，初次读取拿不到桌面伙伴 → 空透明窗口看不到智子）；⑪ 启动恢复桌宠延后到主界面加载完成后再做。
- 待 Windows 真机验证：第二智子复现步骤是否还卡死；若仍崩溃把参数升级为 `--disable-gpu`；若性能回退明显则移除该参数。
- 相关代码：`src/utils/desktopCompanions.ts`、`PetWindow.tsx`、`PetStatus.tsx`、`App.tsx`、`src-tauri/src/{lib,main}.rs`；测试 130/130 通过，`cargo check` 通过。

## 试炼场“题库正在准备中，打不过去”（2026-08-04 已修复，未发版）

- 现象：选技能时题库未就绪/加载失败 → 技能被取消且无重试；试炼场所有伤害都靠答题技能，题库空 = 无法输出。
- 已实现：① 选技能遇空题库时现场重载一次再试；② 提示加“重试”按钮（走 Phaser 完整技能校验重新出题）；③ 地牢题库加载失败 0s/3s/8s 退避重试；④ 技能知识点无匹配题时兜底任意可用选择题（答错也有 0.3 倍伤害）；⑤ 战斗路由门禁：题库未就绪前不进战斗，显示“题库准备中 + 重试”。
- 验证：134/134 测试通过（新增 4 条兜底选函数用例），tsc 通过。

## 智子拖不动（点击穿透回归，2026-08-04 方案A 已实现，未发版）

- 根因：v1.7.26 删掉智子显示时的 `set_focus()` 并扩大穿透范围到全部智子 → 主窗口有焦点时智子永远穿透 → 拖拽事件收不到。
- 方案A：Windows 区域感知穿透——只有“主窗口有焦点 + 智子≥50%面积压在主窗口上”才穿透；智子在桌面空白处始终可拖；移动/缩放时实时重算。
- 代码：`src-tauri/src/lib.rs`（`should_pet_ignore_cursor` / `recompute_pet_click_through` 等）。
- 待 Windows 真机验证：桌面可拖、压主窗口不挡按钮、拖动不被打断。

## 部署状态（2026-08-03）

- 客户端 **v1.7.27 已发版**：阅读题显示修复 + 补偿码/优秀码服务端化 + 题库 revision 50005479323（Gitee 下载/update.json 已就绪）。
- 后端 api worker 已部署（含 comp/redeem/redeem-exc、exc_claims、schema v7、北京时间日期）；生产联调 18/18 通过。
- 教师端 teacher-csp Pages 已部署（补偿码面板上线、学习分析已删）；生产冒烟 4/4 通过。
- 客户端 v1.7.26 已发布（闪烁/置顶/窗口修复 + confirm ACL 修复）。
- 测试账号/班级/联调数据：见根目录 `.tmp/validation-creds.json`（不入库）。
- [x] v1.7.27 发版公告已发布（id 16，X-Admin-Token=csp-teacher-2026）。
- [x] 成就“周常完美/超级完美”判定修复（代码已改、测试过、未发版）：周常 5/5 全对重复计数导致 weeklyPerfects 不涨 + 超级完美按总分判定。随下个客户端版本发版。
- [x] 成就全量审计 + 饲养指南更新（代码已改、未发版）：修复“三连完美”不可能达成描述；指南补齐经验来源/商城道具/神秘代码/成就奖励。随下个客户端版本发版。
- [x] 确认项：C4 阶段保留（后续上线）；超级挑战按正确率 ≥60%/≥80% 判定；阶段成就按 25/50/68；指南加多智子说明+硬件温馨提醒。v1.7.28 已取消，改发 v1.7.29。
- [x] **v1.7.29 已发版**（2026-08-03）：成就修复 + 指南更新；Gitee 下载/update.json/公告（id 17）就绪；v1.7.26 旧 release 已清理。
