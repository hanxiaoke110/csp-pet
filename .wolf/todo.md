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
- 待 Windows 真机验证：第二智子复现步骤是否还卡死；若仍崩溃把参数升级为 `--disable-gpu`；若性能回退明显则移除该参数。
- 相关代码：`src/utils/desktopCompanions.ts`、`PetWindow.tsx`、`PetStatus.tsx`、`App.tsx`、`src-tauri/src/{lib,main}.rs`；测试 130/130 通过，`cargo check` 通过。

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
