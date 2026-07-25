# v1.7.13 发版前桌宠客户端全链路测试安排

> 制定：2026-07-24（Kimi Code）
> 范围：桌宠客户端（Tauri）全部功能面 + 智子试炼场 + 题库 V2 数据 + 更新通道
> 已知待验证 bug：① 知识卡映射不准确 ② 答错后"打开知识卡"按钮无反应

---

## 〇、出口标准（全部满足才可发版）

- [ ] 两个已知 bug 修复并回归通过
- [ ] 本计划 P0 用例 100% 通过，P1 ≥ 95%（失败项有记录且评估为不阻塞）
- [ ] `npm test`、`npm run build`、`npm run build:dungeon`、`npm run test:question-bank`、release-gate 全绿
- [ ] 四个渠道题目在客户端真实可见、可答、解析完整（含 super 19 道、exam 12 卷）

## 一、环境与前置准备

| 项 | 内容 |
|----|------|
| 数据基线 | question-bank-v2 当前快照（daily=703 super=19 exam=177 dungeon=793，去重 894） |
| CF Worker | `/api/question-bank/v2/manifest` 已 `wrangler deploy`，线上 manifest 指纹 = 本地 manifest 指纹 |
| 客户端构建 | `npm run build` + `npm run build:dungeon` + `npm run tauri build`（或 `tauri dev` 热调） |
| 测试工具 | Playwright（playwright-cli）做页面级用例；桌宠窗口行为用 tauri dev 人工/半自动 |
| 测试账号 | 全新本地状态（清 localStorage）+ 一个已有进度的旧状态（验证升级兼容） |

## 二、P0-1 已知 bug：知识卡映射不准确（先定位后修）

**现象**：byValue/byRef/byPointer（函数参数传递）的题答错后推荐「递归与递推」知识卡。

**定位步骤**：
1. 查 `public/course-data/question-knowledge-mapping.json` 中该题 ID 的映射条目
2. 查 `src/utils/knowledgePointHelp.ts` 的 `getPrimaryKnowledgePoint` 选取逻辑（是按 confidence 取最高？还是取第一条？）
3. 判断是**映射数据错**（该题被映射到错误知识点）还是**选取逻辑错**（多个候选时选错）

**修复方向**（按定位结果二选一或组合）：
- 数据：对映射做一轮"知识点-题目"合理性抽查（重点：函数/递归/指针/数组/循环五个易混类目），明显错误的批量纠正
- 逻辑：选取时加类目一致性校验或取 confidence 最高项

**回归用例**：
- [ ] 截图中原题（参数传递题）→ 推荐应为「函数」类卡片
- [ ] 每渠道各抽 5 道答错题，人工核对推荐卡片知识点与题目知识点一致率 ≥ 90%
- [ ] 无映射的题 → 不显示入口（不误推）

## 三、P0-2 已知 bug：答错后"打开知识卡"按钮无反应

**现象**：答错后点击"打开知识卡"按钮无任何反应（截图所示）。

**定位步骤**：
1. `src/components/shared/KnowledgePointHelp.tsx:42-53`：`openLearningUrl` 先调 Tauri `openUrl`，catch 后回退 `window.open`
2. 在 tauri dev 中点击按钮，DevTools console 看是否抛错（`openUrl is not allowed` / `plugin not found`）
3. 检查 `src-tauri/capabilities/` 与 `tauri.conf.json` 是否注册 `opener` 插件及 `opener:allow-open-url` 权限
4. 检查桌宠小窗（pet window）与主窗口的 webview 权限是否一致

**修复方向**：
- 若是权限缺失 → capabilities 补 `opener:default` 或显式 allow
- 若是 `window.open` 在 Tauri v2 被吞 → 统一改为 `openUrl`，非 Tauri 环境（浏览器预览）才走 `window.open`，并加环境判断日志

**回归用例**：
- [ ] tauri dev 主窗口：答错 → 点"打开知识卡"→ 系统浏览器打开飞书卡片
- [ ] tauri dev 主窗口：答错 → 点"详细讲解"→ 打开对应讲解页
- [ ] 答对状态的轻量入口同样可点
- [ ] 浏览器 dev preview 下按钮也能打开（回退路径）
- [ ] 智子试炼场内答错 → 按钮同样可用（MemoryRouter 环境）

## 四、P0 全链路功能测试矩阵

### 4.1 数据层（题库 V2 → 客户端）
- [ ] 客户端 manifest 拉取成功，指纹与线上一致；断网时回退到打包内置快照
- [ ] 首次启动下载 5 个渠道快照，SHA-256 校验通过（DevTools Network 核对）
- [ ] 快照增量更新：改远端 manifest 指纹 → 客户端重新拉取并生效

### 4.2 每日练习（/quiz，daily=703）
- [ ] 列表/随机出题正常；GESP 各级别题目均可抽到
- [ ] 答题 → 判分正确（用 10 道已知答案题核对，含 16 道回滚题中的 2 道：gesp-2023-12-1-01 答案 A、gesp-2025-12-4-15 答案 B）
- [ ] 答错显示解析（抽查 20 道，解析非空且与答案一致）
- [ ] 进度持久化：答完 3 题退出重进，进度保留

### 4.3 CSP 真题（/exam，exam=177，12 卷）
- [ ] 12 张试卷全部可见，每张题数 ≥12（2019-J:16、2022-S:13、2023-J:12 等重点核对恢复卷）
- [ ] 2022-S 卷：13 道题完整可答（昨天还是 1 题的"幽灵卷"）
- [ ] 每卷抽 2 题核对答案判定与解析（含 csp-s-2021-c02=B、csp-j-2020-c13=C 两道修正题）
- [ ] csp-j-2021-c14：无向图图片正常显示，答案 B 判分正确
- [ ] 试卷内顺序：choice → reading → fillBlank 按原卷题号排序

### 4.4 超级挑战（super=19）
- [ ] 19 道大题全部可见（5 道 CSP-J 程序题 + 14 道恢复题）
- [ ] 14 道恢复题每道子题数正确（87 子题：2021 每题 5-6、2022 每题 6-7、2023 每题 5-6、2024 每题 5-6）
- [ ] 逐题过一遍子题选项与判分（重点：super-2021-completion-1 的 5 个空、super-2024-completion-2 的 40 题"B 或 C"情形）
- [ ] 子题判分与官方答案一致（每道大题抽 2 个子题）

### 4.5 智子试炼场（dungeon=793，专项）
- [ ] 入口：从主界面进入试炼场，全屏 MemoryRouter 不嵌套、可正常返回
- [ ] 战斗流程：出题 → 答题 → 判分 → 伤害/血量结算 → 胜利/失败结算
- [ ] GESP L1-4 题与 J 组 CSP 题混合出现（dungeon 构成核对）
- [ ] 试炼场内答错 → 解析 + 知识卡入口显示且按钮可用（P0-2 回归点）
- [ ] 排行榜（leaderboard）提交与拉取正常（CF Worker D1）
- [ ] 中途退出/重进：试炼进度按预期（记录或重置，符合设计）

### 4.6 其他页面
- [ ] /courses 课程列表正常
- [ ] /ai-coach AI 对话可用（或明确降级提示）
- [ ] /achievements 成就统计与答题数据一致
- [ ] /oj-training OJ 训练流程
- [ ] /resources 学习资源页：知识卡列表与飞书文档对应（配合 P0-1 复核）
- [ ] /settings 设置项读写正常；/admin 管理页（如适用）

### 4.7 桌宠窗口（pet window）
- [ ] 桌宠显示、拖拽、贴边隐藏、右键菜单
- [ ] 桌宠窗口内打开主面板各路由正常
- [ ] 桌宠窗口内点外部链接（知识卡）能打开（P0-2 第二现场）
- [ ] 开机自启/托盘行为符合设置

### 4.8 升级兼容
- [ ] 旧版本（v1.7.12）数据目录 → 新版本启动不丢进度、不崩
- [ ] 旧版缓存的旧快照被新 manifest 正确替换

## 五、P1 体验与边界

- [ ] 长解析/长代码题的排版（滚动、代码高亮、LaTeX `$...$` 渲染——截图中 `$1\ 200\ 300$` 形式的选项需渲染正常）
- [ ] 图片题（流程图 SVG、无向图 PNG）加载速度与占位
- [ ] 窗口缩放/最小化/高分屏显示
- [ ] 网络慢/断网场景的加载提示
- [ ] 连续答 50 题无内存泄漏迹象（DevTools Memory 粗查）

## 六、发版检查单（测试全绿后）

- [ ] `package.json` / `tauri.conf.json` 版本号 → v1.7.13，CHANGELOG 更新
- [ ] git commit + tag v1.7.13（GitHub 推送，用 github 令牌）
- [ ] CI 构建安装包（Win/macOS）
- [ ] CF Worker 确认线上为最新（cloudflare 令牌，`wrangler deploy` + 线上指纹核对）
- [ ] Gitee Release 创建 v1.7.13 并上传安装包（gitee 令牌），顺带补传 v1.7.9-v1.7.12 缺的包（如要）
- [ ] `.wolf/` anatomy.md / cerebrum.md / memory.md / buglog.json 更新
- [ ] 发版后真机 smoke：下载安装包安装 → 打开 → 答 3 题 → 试炼场一局

## 七、执行顺序与分工建议

1. **先修两个 P0 bug**（定位在 §二/§三，预计各 0.5-1 天）
2. **数据层 + 四渠道题目验证**（§4.1-4.5，可用 Playwright 半自动，我来做）
3. **桌宠窗口 + 升级兼容**（§4.7-4.8，tauri dev 人工为主）
4. **P1 体验项**（§五，边测边记，不阻塞的不修）
5. **发版检查单**（§六，你提供令牌后我执行，每步可复核）
