# anatomy.md — CSP 学习助手项目结构

> 最后更新：2026-06-30

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
│   │   │   ├── quiz/QuizPractice.tsx
│   │   │   ├── achievements/AchievementsPanel.tsx
│   │   │   ├── oj/OJTraining.tsx
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
│   │   │   └── spriteDownloader.ts
│   │   ├── types/pet.ts         # 精灵类型定义 + 商城数据
│   │   ├── lib/storage.ts       # 安全的 localStorage 操作
│   │   └── services/ai/         # AI 服务 (3个文件)
│   ├── src-tauri/               # Rust 后端
│   ├── cf-workers/api.js        # Cloudflare Worker API (~670行)
│   ├── teacher-app/index.html   # 教师 Web 后台 (SPA)
│   ├── public/course-data/      # 课程数据 (JSON)
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

```
src-dungeon/
├── index.html                     # 像素风入口 HTML
├── main.tsx                       # React 入口
├── App.tsx                        # 路由（HashRouter）+ 3级数据加载
├── App.css                        # 像素 RPG 主题样式（~250行）
├── types/dungeon.ts               # 所有 TS 类型（Player/Dungeon/Badge/API/智子战斗等）
├── stores/dungeonStore.ts         # Zustand 核心状态管理（~270行）
├── data/
│   ├── dungeons.json              # 8 副本定义（40 关卡，每关含 enemyPet 敌方宠物配置）
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
│   │   ├── BattleScreen.tsx       # 核心战斗（智子试炼场：宠物回合制答题驱动）
│   │   ├── SkillTooltip.tsx       # 技能悬浮提示
│   │   ├── RewardScreen.tsx       # 结算画面（EXP/金币/评级）
│   │   ├── LeaderboardScreen.tsx  # 排行榜（班级/全服 × 4维度）
│   │   └── ProfileScreen.tsx      # 个人档案+24徽章墙
├── utils/
│   ├── gameLogic.ts               # 数值公式（~230行）
│   ├── combatLogic.ts             # 智子试炼场：宠物战斗数值（元素克制/伤害/先手）
│   ├── combatLogic.test.ts        # combatLogic 单元测试（vitest）
│   ├── api.ts                     # API 客户端
│   └── questionLoader.ts          # 3级题目加载 + 按技能标签选题
```

### API 端点（cf-workers/api.js 新增 ~280行）

| 端点 | 功能 |
|------|------|
| POST /api/dungeon/register | 注册（4字段+流派，缺一不可） |
| GET /api/dungeon/status | 获取完整状态 |
| POST /api/dungeon/sync | 同步进度 |
| POST /api/dungeon/report | 上报答题 |
| GET /api/dungeon/leaderboard | 排行榜（scope+type参数） |
| GET/POST /api/dungeon/daily-tasks | 每日任务 |
| POST /api/dungeon/claim-daily | 领取每日奖励 |
| GET /api/dungeon/broadcasts | 全服广播 |
| GET /api/dungeon/teacher/students | 教师查看学生 |
| POST /api/dungeon/teacher/students/remove | 软删除学生 |
| POST /api/dungeon/teacher/students/restore | 恢复学生 |
| GET /api/dungeon/teacher/analytics | 班级分析 |

### D1 新表（6张）

dungeon_players, dungeon_progress, dungeon_attempts, dungeon_badges, dungeon_daily_tasks, dungeon_broadcasts
