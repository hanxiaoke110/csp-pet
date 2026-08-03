# 当前待办与状态速览（2026-08-03）

## 待办（近期）

- [ ] **客户端发版前，教师端不要发 CMP 补偿码**：教师端补偿码面板已上线（teacher.cspstudy.top），但学生端旧版（v1.7.26）不认识 CMP- 码，兑了只会提示无效；等客户端新版本发版后再开始发补偿码。
- [ ] **PetWindow 加“超时强制显示”兜底**：宠物窗口改为精灵就绪后才显示；远程素材（稀有/传说）缓存丢失且断网时，素材恢复退避最长约 6.5 分钟，窗口会一直不出现。建议 2-3 秒后无论素材是否就绪都先显示（沿用 loading 兜底）。
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

## 部署状态（2026-08-03）

- 客户端 **v1.7.27 已发版**：阅读题显示修复 + 补偿码/优秀码服务端化 + 题库 revision 50005479323（Gitee 下载/update.json 已就绪）。
- 后端 api worker 已部署（含 comp/redeem/redeem-exc、exc_claims、schema v7、北京时间日期）；生产联调 18/18 通过。
- 教师端 teacher-csp Pages 已部署（补偿码面板上线、学习分析已删）；生产冒烟 4/4 通过。
- 客户端 v1.7.26 已发布（闪烁/置顶/窗口修复 + confirm ACL 修复）。
- 测试账号/班级/联调数据：见根目录 `.tmp/validation-creds.json`（不入库）。
- [ ] 待办：v1.7.27 发版公告（需 CSP_ADMIN_TOKEN）。
