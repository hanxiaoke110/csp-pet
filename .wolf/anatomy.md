# anatomy.md — CSP 学习助手项目结构

> 最后更新：2026-06-08

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
│   │   │   ├── petStore.ts      # 宠物数据 (Zustand + localStorage)
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
│   └── 2026-06-02-wish-wall-design.md  # 许愿墙方案
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
