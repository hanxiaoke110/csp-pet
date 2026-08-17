# anatomy.md — CSP 学习助手项目结构

> 最后更新：2026-08-17（修复 v1.7.36 学生端 dialog ACL 报错：新增 DungeonConfirmModal 替换两处 window.confirm）

## 项目目录

```
csp学习助手（师+生）/
├── csp-desktop-pet/          # 学生桌面 App (Tauri v2 + React)
│   ├── src/
│   │   ├── App.tsx           # 主路由 + 课程加载 + 签到逻辑
│   │   ├── App.css           # 全局样式 (~1468行)
│   │   ├── main.tsx          # 入口 (ErrorBoundary 包裹)
│   │   ├── pet.tsx           # 宠物悬浮窗入口
│   │   ├── components/
│   │   │   ├── layout/AppShell.tsx    # 侧边栏 + 签到
│   │   │   ├── ErrorBoundary.tsx       # React 错误边界
│   │   │   ├── admin/AdminPage.tsx     # 老师管理页 (/admin)
│   │   │   ├── courses/               # 课程组件 (8个)
│   │   │   ├── pet/                   # 宠物组件 (10个)
│   │   │   │   ├── PetPanel.tsx        # 主面板 (Tab切换+商城+改名)
│   │   │   │   ├── PetStatus.tsx       # 智子Tab (属性+喂食+列表)
│   │   │   │   ├── PetSettings.tsx     # 显示Tab (尺寸+漫游+显隐)
│   │   │   │   ├── WishWall.tsx        # 许愿墙 (班级码锁+投票+提交)
│   │   │   │   ├── PetWindow.tsx       # 桌面悬浮窗
│   │   │   │   ├── PetSprite.tsx       # 精灵渲染
│   │   │   │   ├── HatchPanel.tsx      # 孵化面板
│   │   │   │   ├── CeremonyModal.tsx   # 召唤/进化仪式
│   │   │   │   ├── RaisingGuide.tsx    # 饲养指南
│   │   │   │   └── PetStateMachine.ts  # 状态机
│   │   │   ├── ai/AIChat.tsx
│   │   │   ├── access/ClassAccessGate.tsx  # 班级码门禁 (useClassAccess + ClassAccessRequired, 6h 本地缓存, GET /api/classes/validate)
│   │   │   ├── shared/KnowledgePointHelp.tsx  # 题后知识点帮助入口：答错显示"没懂？看XX知识卡"按钮，答对显示"巩固这个知识点"文字链。接入QuizPractice/ExamChoice/BattleScreen四个入口。知识卡URL为空时静默隐藏，不阻塞答题。
│   │   │   ├── quiz/QuizPractice.tsx
│   │   │   ├── exam/ExamTraining.tsx       # CSP 真题训练 (班级码门禁: 月度复盘/超级挑战/真题/智子试炼场需班级码，自由练习免)
│   │   │   ├── achievements/AchievementsPanel.tsx
│   │   │   ├── oj/OJTraining.tsx
│   │   │   ├── resources/                # 学习资料入口 (2026-07-08 新增；2026-07-09 升级为飞书链接预置机制)
│   │   │   │   ├── LearningResourcesPage.tsx  # /resources 页：REMOTE_RESOURCE_INDEX_URL 远程索引优先(tauriFetch)+本地兜底；type 过滤；status(hidden 不展示)+lessonNo 升序排序；openUrl 系统浏览器；🔒资源复用 useClassAccess 门禁
│   │   │   │   ├── ResourceCard.tsx           # 卡片：缩略图(空/失败降级占位)/P{lessonNo}徽标/status(ready 打开·coming_soon 制作中仍可点)/阶段/标签/🔒班级码徽标
│   │   │   │   └── types.ts                   # LearningResource 类型（lecture/fable/practice/review + status ready/coming_soon/hidden + lessonNo/thumbnailUrl/updatedAt/description）
│   │   │   └── settings/SettingsPage.tsx  # 设置 (AI配置+班级绑定+学习数据+集训)
│   │   ├── stores/
│   │   │   ├── petStore.ts      # 宠物数据 (Zustand + localStorage)，含经验池与战斗属性初始化
│   │   │   ├── quizStore.ts     # 选择题数据
│   │   │   ├── hatchStore.ts    # 孵化数据
│   │   │   ├── courseStore.ts   # 课程数据
│   │   │   ├── aiStore.ts       # AI配置
│   │   │   └── achievements.ts  # 成就系统
│   │   ├── utils/
│   │   │   ├── crypto.ts        # AES加密 + 许愿票周限 + 设备ID
│   │   │   ├── validateName.ts  # 宠物改名验证
│   │   │   ├── markdown.ts      # Markdown渲染
│   │   │   ├── knowledgePointHelp.ts  # 知识点帮助数据工具（加载kp目录+题目映射，供KnowledgePointHelp组件查询）
│   │   │   └── spriteDownloader.ts
│   │   ├── types/pet.ts         # 精灵类型定义 + 商城数据
│   │   ├── lib/storage.ts       # 安全的 localStorage 操作
│   │   ├── lib/tauriEvents.ts   # safeListen/safeWindowListen — 解决 Tauri 事件 unlisten 竞态与 unregisterListener 抛错（2026-07-06 新增）
│   │   └── services/ai/         # AI 服务 (3个文件)
│   ├── src-tauri/               # Rust 后端
│   │   └── (tauri-plugin-window-state 已接入：main 窗口 visible:false，插件 on_window_ready 恢复尺寸后 show；lib.rs setup 内 1.5s 兜底 show 防卡死；pet 窗口 denylist 排除)
│   ├── cf-workers/api.js        # Cloudflare Worker API (~670行)
│   ├── teacher-app/index.html   # 教师 Web 后台 (SPA)
│   ├── public/course-data/      # 课程数据 (JSON)
│   │   ├── unified-quiz-bank.json               # 统一题库 1023 题
│   │   ├── learning-resources.json              # 学习资料索引 24 份（飞书公开只读链接）
│   │   ├── knowledge-points.json                # 知识点目录 21 项（2026-07-10 新增）— 阶段/批次/知识卡URL/讲义URL/关联课程/前置知识点
│   │   └── question-knowledge-mapping.json      # 题目→知识点映射 967/1023（2026-07-10 新增）— 每题1个primary+0-2个secondary
│   ├── package.json
│   ├── vite.config.ts
│   └── wrangler.toml
│
├── csp-chrome-ext/              # Chrome 教练插件
│   ├── coach/
│   │   ├── sidepanel.js         # 侧边栏主入口
│   │   ├── sidepanel.html
│   │   ├── sidepanel.css
│   │   └── components/
│   │       ├── coach-library.js     # 课程库浏览
│   │       ├── coach-course-mgr.js  # 课程管理
│   │       └── coach-debug.js       # Debug面板
│   ├── shared/services/         # AI 服务 (复用)
│   └── scripts/                 # 数据处理脚本
│
├── docs/superpowers/specs/      # 设计文档
│   ├── cf-config.md             # Cloudflare 配置
│   ├── csp-roadmap.md            # 升级路线图
│   ├── 2026-06-02-wish-wall-design.md  # 许愿墙方案
│   └── 2026-06-29-智子试炼场-design.md  # 智子试炼场（宠物回合制地牢战斗）
├── scripts/question-bank/         # 题库 V2 管道脚本
│   ├── build-canonical.mjs         # 构建 canonical bank
│   ├── publish-snapshots.mjs       # 发布 channel 快照
│   ├── release-gate.mjs            # 发布门禁
│   ├── verify-csp-batches.mjs      # CSP 批量验证
│   ├── generate-explanations.mjs   # DeepSeek v4-pro 解析生成
│   ├── test-full-chain.mjs         # 🔑 全链路题库可靠性测试 (85项检查, npm run test:question-bank)
│   ├── lib/
│   │   ├── channels.mjs            # Channel 规则 + isPublishableCsp
│   │   ├── validate.mjs            # 题目自动验证
│   │   ├── ai-jury.mjs             # AI 评审
│   │   ├── deterministic.mjs       # 确定性解答
│   │   ├── source-match.mjs        # 原卷匹配
│   │   ├── csp-evidence.mjs        # CSP 证据收集
│   │   └── normalize.mjs           # 标准化
│   └── data/
│       └── csp-choice-recovery.json # 166 道官方原卷恢复题 (全部有解析)
│
├── docs/release/                # 发版前手动测试清单 (2026-07-08 新增)
│   └── manual-test-checklist-1.7.x.md  # 1.7.x 发版前人工/Tauri 实机验收清单
├── docs/codex-knowledge-card-spec.md  # Codex 知识卡生图+上传规范 (2026-07-10)
│
└── .wolf/                       # 项目记忆 (OpenWolf)
    ├── anatomy.md               # 本文档
    ├── cerebrum.md              # 学习 + 禁忌
    ├── memory.md                 # 会话记忆
    └── buglog.json              # Bug 记录
```

## 架构

```
Teachers  →  teacher-csp.pages.dev (Web)
                  │
                  ▼
Students  →  api.cspstudy.top (CF Worker + D1)
                  │
                  ▼
           D1 Database (8 tables: wishes, votes, teachers, classes, 
                         class_students, meta, generated_codes, feedback)
```

## 数据流

- 学生绑定：SettingsPage → POST /api/classes/bind → D1 class_students
- 许愿提交：WishWall → POST /api/wishes (+class_code) → D1 wishes
- 投票：WishWall → POST /api/vote → D1 votes (UNIQUE INDEX 防重复)
- 教师管理：Web App → GET/POST /api/classes → D1 classes
- 兑换码：Web App → POST /api/codes/exc|camp → 与 Chrome 插件算法一致
- 月度清理：懒触发 (GET /api/wishes 首次访问当月)

### src-dungeon/ — 潜龙闭关・学霸副本攻略（2026-06-13 新增，2026-06-29 升级为「智子试炼场」）

独立 Web 应用，CSP-J 初赛沉浸式闯关游戏，部署到 `dungeon.cspstudy.top`。
2026-06-29 升级方向：将原「答题扣 HP」战斗改为「宠物回合制对战 + 编程题驱动技能释放」。
2026-07-01 再次升级：BattleScreen 引入 Phaser.js 渲染卡牌战斗场景，能量/护盾/敌方意图/连击buff 机制落地。
2026-07-01 清理：修复 src-dungeon 全部 noUnusedLocals/noUnusedParameters 错误（12 文件，仅删未使用 import/局部变量/类字段，逻辑零改动；BattleScene.dungeonTitle 字段删除后 add.text 改独立调用保留标题显示）。

```
src-dungeon/
├── index.html                     # 像素风入口 HTML
├── main.tsx                       # React 入口
├── App.tsx                        # 路由（HashRouter）+ 3级数据加载
├── App.css                        # 像素 RPG 主题样式（~250行）
├── tsconfig.dungeon.json         # 独立 TypeScript 配置，用于类型检查 src-dungeon
├── types/dungeon.ts               # 所有 TS 类型（Player/Dungeon/Badge/API/智子战斗等）
├── stores/dungeonStore.ts         # Zustand 核心状态管理（~560行）
├── data/
│   ├── dungeons.json              # 8 副本定义（40 关卡，每关含 enemyPet 敌方宠物配置，副本含 bgImage / guardianLine / bossLine 剧情字段）
│   ├── fables.json                # 13 篇 CSP 知识点寓言
│   ├── question-mapping.json      # 240 题 → 副本/关卡映射
│   ├── schools.json               # 5 流派 × 8 段位
│   └── skills.ts                  # 4 技能定义与 CSP 知识点标签
├── components/
│   ├── screens/
│   │   ├── TitleScreen.tsx        # 标题画面
│   │   ├── RegisterScreen.tsx     # 2步注册（班级码+流派选择）
│   │   ├── DungeonMap.tsx         # 世界地图（8节点）
│   │   ├── DungeonEntrance.tsx    # 副本入口（关卡列表+Boss）
│   │   ├── BattleScreen.tsx       # 核心战斗：React 外壳 + Phaser Canvas 卡牌回合制
│   │   ├── BattleScreen.css       # 题目覆盖层样式
│   │   ├── SkillTooltip.tsx       # 技能悬浮提示
│   │   ├── RewardScreen.tsx       # 结算画面（EXP/金币/评级）
│   │   ├── LeaderboardScreen.tsx  # 排行榜（班级/全服 × 8维度）
│   │   └── ProfileScreen.tsx      # 个人档案+24徽章墙
│   └── shared/
│       ├── FableCard.tsx          # 知识点寓言卡片
│       └── DungeonConfirmModal.tsx  # 试炼场应用内确认弹窗（替代 window.confirm，dialog 插件 2.7+ 移除 confirm 命令；2026-08-17 新增，DungeonMap/TrialSupplyScreen 使用）
├── phaser/                        # Phaser.js 战斗场景（2026-07-01 新增）
│   ├── BattlePhaserGame.ts        # Phaser.Game 实例管理
│   ├── types.ts                   # Phaser 战斗内部类型
│   ├── scenes/
│   │   └── BattleScene.ts         # 主战斗场景（布局/动画/回合逻辑）
│   ├── entities/
│   │   ├── PetSprite.ts           # 宠物精灵（受击/攻击/庆祝/倒下动画）
│   │   ├── HealthBar.ts           # 血条
│   │   ├── EnergyOrb.ts           # 能量球
│   │   ├── Card.ts                # 技能卡牌
│   │   ├── CardHand.ts            # 手牌管理
│   │   ├── TurnIndicator.ts       # 回合指示器
│   │   ├── ComboCounter.ts        # 连击计数器
│   │   ├── IntentBubble.ts        # 敌方意图气泡
│   │   └── DamageText.ts          # 伤害飘字
│   └── effects/
│       └── (预留特效管理器)
├── utils/
│   ├── gameLogic.ts               # 数值公式（~230行）
│   ├── combatLogic.ts             # 智子试炼场：宠物战斗数值（元素克制/伤害/先手/能量/护盾/意图/灼烧）
│   ├── combatLogic.test.ts        # combatLogic 单元测试（vitest）
│   ├── api.ts                     # API 客户端
│   └── questionLoader.ts          # 3级题目加载 + 按技能标签选题
```

### API 端点（cf-workers/api.js 新增 ~280行）

| 端点 | 功能 |
|------|------|
| POST /api/dungeon/register | 注册（4字段+流派，缺一不可） |
| GET /api/dungeon/status | 获取完整状态 |
| POST /api/dungeon/sync | 同步进度（仅允许非敏感字段，禁止客户端写金币/等级/经验/段位） |
| POST /api/dungeon/report-battle | 战斗结束后上报（服务端校验、写 dungeon_attempts、赢时服务端加金币） |
| GET /api/dungeon/leaderboard | 排行榜（scope+type参数，班级榜需验证设备归属） |
| GET/POST /api/dungeon/daily-tasks | 每日任务 |
| POST /api/dungeon/claim-daily | 领取每日奖励 |
| GET /api/dungeon/broadcasts | 全服广播 |
| GET /api/dungeon/teacher/students | 教师查看学生 |
| POST /api/dungeon/teacher/students/remove | 软删除学生 |
| POST /api/dungeon/teacher/students/restore | 恢复学生 |
| GET /api/dungeon/teacher/analytics | 班级分析 |

### D1 新表（6张）

dungeon_players, dungeon_progress, dungeon_attempts, dungeon_badges, dungeon_daily_tasks, dungeon_broadcasts

- `dungeon_attempts` 含 `earned_reward INTEGER DEFAULT 0`，用于标记该次挑战是否发放金币奖励

### 精灵工坊 + 教师上限（2026-07-07 新增/完善）

**主后端**：`csp-pet-gitee/cf-workers/api.js`（~1640 行，根 anatomy 早期标 csp-desktop-pet ~670 行已过时）。学生桌面 App 与教师后台都消费它。

**两个管理 UI（勿混淆）**：
- `teacher-app/index.html` — **管理员/教师 Web 后台主 UI**（单 HTML + CDN React，无构建）。标签页：👥教师管理/💡许愿管理/🎫兑换码/💬需求收集/📦精灵工坊/📚我的精灵。编辑交互统一 prompt()/confirm() + toast()。**管理功能改这里**
- `src/components/admin/AdminPage.tsx` — 学生桌面 App `/admin` 路由的**许愿墙精简页**（仅看许愿）。勿在此加管理功能

**端点**：
- `POST /api/workshop/upload` — 图片上传 R2，速率限制 5/h、20/d + 总数上限校验
- `POST /api/workshop/pets` — 创建精灵记录（FormData/JSON 两分支），两分支 INSERT 前都有总数上限校验（修了 FormData 内联上传绕过漏洞）
- `GET/POST /admin/settings` — 全局默认精灵上限 `pet_limit_default`（meta 表，默认 20，POST 校验 ≥1 + 失效缓存）
- `POST /admin/teachers/:id/max-pets` — 教师独立上限（body `{max_pets}`：null 恢复默认 / ≥1 整数）
- `GET /admin/teachers` — 返回含 `max_pets`(可空) + `pet_count` + class_count + student_count

**上限解析**：`getTeacherPetLimit(db, teacher)` = 教师独立 `teachers.max_pets` > 全局 `meta.pet_limit_default` > 20（`_petLimitCache` 60s 内存缓存）。`checkTeacher` 的 SELECT 已含 `max_pets`（不加则独立上限永不生效）

## 2026-07-17 评估+版本同步

- `src/App.tsx` — 含 `ChangelogModal` 与 `VER` 常量，发版时必须同步
- `update.json` — Tauri updater 远程元数据，发版时必须同步版本/日期/URL/signature
- `.wolf/buglog.json` — 版本号不同步问题已记录
- `.wolf/memory.md` — 本次修复已记录
