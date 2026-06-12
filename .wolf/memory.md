# 2026-05-29 — 包体优化 & 孵化系统 & 代码审查

## 2026-06-08 — PetSettings 虚弱状态禁隐藏
- PetSettings.tsx "显示精灵" toggle 在 hunger <= 10 时禁用
- 禁用状态：cursor not-allowed + opacity 0.5 + 灰色背景
- 提示文案替换为："智子已进入虚弱状态，请先喂食！😿"
- 通过 usePetStore 读取 activePet 的 hunger 状态

# 2026-05-29 — 包体优化 & 孵化系统 & 代码审查

## 方案决策

### 精灵分级 + 孵化下载 (v1.1.0)
- 普通精灵(30只) + 初始(4只) 内置安装包，稀有(27) + 传说(8) Gitee raw 按需下载
- 安装包 140MB → ~81MB，Gitee 100MB 限制通过
- 孵化机制隐藏下载等待：普通 1.5-3min，稀有 5-10min，传说 10-20min
- Gitee 完全能承载 10000 学生（峰值不到限制 10%），无需额外 CDN
- 备用 CDN 预留：spriteDownloader.ts FALLBACK_BASE

### Gitee 限制（已确认）
- raw 文件单线程 < 2MB/s
- 单 IP 60 次/3分钟(Web)，API 180 次/3分钟
- 单文件上传 100MB（Release 上传限制 — 安装包不能超过 100MB）
- 无 SLA 保证，不能当 CDN 但孵化分散了压力

### CDN 备选
- 无畏云：30GB/月，免备案需实名
- 阿里云 ESA + 腾讯云 COS：不限流量，需实名 + ICP 备案域名

## 代码审查发现 & 修复（3b195a3）

### 严重 Bug
1. **金币扣两次** — ShopPanel 先 spendCoins，claimHatchedPet 又 buyPet 再扣
   - 修复：claimHatchedPet 直接 add pet，不扣金币（已在前置流程扣过）
2. **App 重启后下载中断** — 孵化中的稀有/传说蛋关闭后下载不会恢复，蛋永远孵不出
   - 修复：load() 中检测 incubating 且 downloadStatus != done 的蛋，重新调用 resumeDownload
3. **TypeScript 编译 20+ 错误** — 会直接导致 CI 失败
   - 修复：去除未用 import(readFile, doGacha, buyPet)，删除死代码 GachaCeremony，修复重复声明，补充 PetState 接口

### 关键架构
- spriteDownloader.ts: 下载管理（随机延迟、指数退避、本地缓存）
- hatchStore.ts: 孵化状态（egg 生命周期、时间戳计时、下载恢复）
- HatchConfirmModal.tsx + HatchPanel.tsx: 孵化 UI
- PetSprite.tsx: 优先查 app_data_dir 缓存，convertFileSrc 加载本地文件

### 文件拆分
- 远程精灵: pet-sprites-remote/2d/ (70 文件 68MB，推送到 Gitee raw)
- 内置精灵: public/pet-sprites/2d/ (34 只，59MB)
- 下载 URL: https://gitee.com/hanliuliu110/csp-pet/raw/main/pet-sprites-remote/2d/{petId}.{ext}

### 新增依赖
- @tauri-apps/plugin-fs (读写 app data 缓存)
- src-tauri/Cargo.toml: tauri-plugin-fs = "2"
- capabilities/default.json: fs:default, fs:allow-appdata-read/write, fs:allow-exists, fs:allow-mkdir

## 其他
- 仓库已改为公开（GitHub Actions 不限时）
- 已添加 MIT LICENSE
- macOS 未签名应用需右键打开或 xattr -cr

## 2026-05-29 — 孵化系统 6 层 Bug 修复 (v1.1.1)

### 背景
稀有/传说精灵孵化永远卡在「即将完成」，实际是 6 层独立问题叠加，因缺少 .catch() 全部被静默吞掉。

### Bug 链
1. **无 .catch()** — `resumeDownload()` 中 promise 异常静默吞掉
2. **fs:scope 未配置** — Tauri v2 scope 为空，所有路径被拒
3. **fetch CORS** — 浏览器 fetch 请求 Gitee 被跨域拦截
4. **HTTP 插件未注册** — Cargo.toml 有但 lib.rs 漏了 .plugin()
5. **路径拼接缺 /** — appDataDir() 无尾部 /
6. **convertFileSrc 协议不兼容** — asset:// fetch 不支持，asset-localhost 缺少 scope

### 关键变更
- `PetSprite.tsx`: 移除 convertFileSrc，直接用 readFile/readTextFile + Blob URL
- `spriteDownloader.ts`: fetch → @tauri-apps/plugin-http
- `lib.rs`: 注册 tauri_plugin_http::init()
- `capabilities/default.json`: 加 fs:scope、http:allow-fetch

### Tauri v2 安全模型（三层）
每个插件 = Capability 权限声明 + Scope 范围 + Rust .plugin() 注册，缺一不可。
本地文件加载用 fs plugin 直接读写；外部下载用 HTTP plugin。

## 2026-05-29 — 教练端修复

### 集训码按钮不显示
- 原因：Chrome 顽固缓存旧版扩展文件，即使重新加载也不更新
- 修复：修改源文件 → 重新 build（hash 从 `4APYr0px` 变为 `CiGt8dnI`）→ 彻底移除扩展 → 重新加载
- 关键步骤：必须先在 `chrome://extensions/` 中**移除**旧扩展，再加载新版本

### 优秀码重复问题
- 原因：`makeCampCode()` 之前调用 `makeExcRand()`，但生成循环中每个码的随机后缀都相同（可能是旧版 build 未包含随机后缀）
- 修复：将 `makeCampRand()` 独立出来，`makeCampCode()` 和 `makeExcCode()` 各自调用专属随机函数
- 格式确认：
  - 优秀码: `EXC-{level}-{MMDD}-{hash}-{rand}` 
  - 集训码: `CAMP-{YYYYMMDD}-{hash}-{rand}`
  - 学生端正则均支持 `(?:-[A-Z0-9]{4})?$` 可选随机后缀

### 教练端完整按钮列表
5 个按钮（无搜索框）：+ 课程管理 | 📥 导入 | 📤 导出 | ⭐ 优秀码 | 🏕️ 集训码

## 发版流程

### 常规发版
1. 修改版本号：`src-tauri/tauri.conf.json` → `version`
2. 提交代码 + 打 tag（如 `v1.1.0`）
3. `git push origin main --tags`
4. **同时推送到 Gitee**：`git push gitee main --tags`（Gitee Release API 要求 tag 存在于 Gitee 仓库）
5. GitHub Actions 自动构建 → GitHub Release 自动创建并上传安装包
6. **⚠️ 手动上传到 Gitee**：从 GitHub Release 下载安装包 → 本地上传到 Gitee Release（见下方「Gitee 上传」）
7. 更新 Gitee `update.json`（指向 Gitee 下载地址）
8. 学生 App 检测到新版本 → 点更新

### Gitee 上传（手动步骤）
CI 无法可靠上传大文件到 Gitee（美国→中国跨境传 70MB×3 太慢/超时）。改为手动：
```bash
# 1. 从 GitHub Release 下载安装包
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_aarch64.dmg" -o /tmp/csp-arm.dmg
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_x64.dmg" -o /tmp/csp-intel.dmg
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_x64-setup.exe" -o /tmp/csp-win.exe

# 2. 在 Gitee 网页上创建 Release（或通过 API 创建）
# 3. 上传 3 个文件到 Gitee Release
# 4. 更新 update.json，指向 Gitee 下载地址
# 5. 提交 update.json 到 Gitee 仓库
```

### ⚠️ Gitee vs GitHub 分支名陷阱
- GitHub 默认分支：`main`
- **Gitee 默认分支：`master`**
- CI release.yml 中 `target_commitish` 必须用 `"master"`（不是 `"main"`）
- Gitee API 文件的 raw URL 也用 `master`：`https://gitee.com/hanliuliu110/csp-pet/raw/master/...`

### 教练端发版
1. 修改 `coach/manifest.json` → `version`
2. `npm run build:coach`
3. 提交 + 打 tag → push
4. 教练重新加载 Chrome 扩展（`chrome://extensions/` → 刷新）

### 新增精灵流程（完整版 — 严格按顺序执行）

```
素材: pet素材/xxx.zip (含 pet.json + spritesheet.webp)
      ↓
① 解压 → 读 pet.json 获取 id、名字、描述
② webp → png  (sips -s format png in.webp --out out.png)
③ 生成帧元数据 pet-sprites-remote/2d/{id}.json
   - 1536x1872 → frameWidth:192 frameHeight:208 maxFrames:8
   - 7 动画: idle(6) walk(8) sleep(6) celebrate(4) think(6) eat(5) unhappy(8)
④ 生成预览图 public/pet-sprites/previews/{id}.png
   - 取第一帧 (0,0,192,208) → resize 到 200×216 → 居中裁 200×200
   - **必须 200×200**，48×52 在 Retina 屏上会糊
⑤ 复制到 pet-sprites-remote/2d/{id}.png + {id}.json
⑥ 修改 src/types/pet.ts:
   - PETDEX_PETS 添加 speciesId、name、element、description
   - PET_TIERS 添加 speciesId → 'rare' 或 'legendary'
⑦ git add + commit + push gitee main
   (push 后精灵文件即可被 App 下载，无需等发版)
⑧ 发版时以上改动随 App 一起打包
```

**⚠️ 常见遗漏**：
- 忘记生成 preview → 商城/智子界面白色无图
- 忘记 push 精灵文件到 Gitee → 孵化下载 404
- 忘记更新 PET_TIERS → `isRemotePet()` 返回 false，走 bundled 路径
- spritesheet 不是 1536×1872 → 帧元数据需要重新计算

### 课程数据更新流程
1. 教练端编辑课程 → 导出 lessons-coach.json
2. 上传到 Gitee `public/course-data/`（更新 lessons.json + version.json）
3. 学生 App 启动时自动检测更新 → 自动下载新课程数据
4. 无需发新版

## 2026-05-30 — 签名修复 + 密钥迁移 (v1.2.1)

### 问题
v1.2.0 更新失败：「The signature could not be decoded」。`update.json` 中 3 个平台签名全部为空字符串。

### 根因
两层问题叠加：
1. **密钥不匹配**：`.tauri/csp-updater.key`（OpenSSH 格式）的 pubkey 与 `tauri.conf.json` 里写死的 pubkey 是两对不同的密钥。真正配对的私钥锁在 GitHub Secrets 里，无法读取。
2. **CI 签名命令错误**：`release.yml` 中 `sign_file()` 用了 `--private-key /tmp/privkey`，但 `--private-key` 接收的是**字符串**而非文件路径。正确用法是 `--private-key "$PRIVKEY"` 或 `--private-key-path`。

### 修复
1. 重新生成密钥对（minisign 格式）
2. `tauri.conf.json` 更新 pubkey → 版本 1.2.1
3. CI `release.yml` 中签名命令改为 `--private-key "$PRIVKEY"`
4. GitHub Secret `TAURI_UPDATER_PRIVKEY` 更新为新私钥
5. 新密钥保存到 `~/.tauri/csp-updater-v2.key`，不再丢失

### 发版流程优化
CI 只负责构建 + GitHub Release + 推 update.json 到 Gitee。
Gitee 大文件上传 CI 做不了（跨境超时），改为本地操作：
```bash
export GITEE_TOKEN="b346a4706f8c8ee823ab9e8377d1173c"  # 已在 ~/.zshrc
```
本地签名 + 推 update.json 到 Gitee，秒传。

### 特殊操作
- 旧版 App（v0.x, v1.x）无法自动更新到 v1.2.1（pubkey 变了），需手动下载安装一次
- 之后所有更新全自动
- Gitee git remote 带 token：`https://hanliuliu110:TOKEN@gitee.com/hanliuliu110/csp-pet.git`

## 2026-05-30 — 课程数据远程更新 CORS 修复

### 问题
`App.tsx` 中用浏览器 `fetch` 请求 Gitee raw URL（`/public/course-data/version.json`），在 Tauri WebView 中被 CORS 拦截。外层 `try {} catch {}` 静默吞掉错误，学生永远拿不到课程更新。

### 修复
Gitee URL 改用 `@tauri-apps/plugin-http` 的 `fetch`（Rust 后端发请求绕过 CORS），本地打包文件继续用浏览器 `fetch`。

## 2026-05-30 — macOS 更新调试经验（重要）

### 背景
Windows 更新正常，macOS 反复失败。经过多轮排查找到 3 个独立问题。

### Bug 1: 签名中嵌入文件名
Tauri 签名（minisign 格式）包含原文件名：
```
trusted comment: timestamp:1780107621    file:CSP 学习助手_1.2.2_aarch64.dmg
```
上传时改名为 `csp-v122-arm.dmg` 导致文件名不匹配 → 验签失败 → "invalid gzip header"。

修复：上传文件名必须与 CI 构建时的原始文件名一致，不能改。或者本地重新签名用新文件名。

### Bug 2: Gitee Release 下载 URL 多次 302 跳转
Gitee Release 下载链：`gitee.com/releases/download/...` → 302 → `gitee.com/attach_files/.../download` → 302 → `foruda.gitee.com/attach_file/...?token=...`。Tauri updater macOS 端 HTTP 客户端无法正确处理这 2 次跳转，下载卡死。

Windows 不受影响（可能 Windows updater 的 HTTP 栈处理跳转不同）。

### Bug 3: 版本号显示 `v0.1.0`
`UpdateChecker.tsx` 用 `fetch('/version')` 获取版本号，但该接口不存在（fallback `'0.1.0'`）。应改用 `@tauri-apps/api/app` 的 `getVersion()`。

### 关键经验
- Tauri 签名后**文件名不能改**
- Gitee Release 不适合做 Tauri macOS 更新下载源（多次 302）
- DMG 格式可能不如 `.app.tar.gz` 稳定（tar.gz 是 Tauri updater 原生格式）
- 每次发版前先在本地起 HTTP 服务验证更新流程
- Gitee 仓库附件配额 1GB，超出需删除旧 Release
- 版本显示不要用 `/version` 这种不存在的接口，用 `getVersion()`
- 大文件场景下用 Agent subagent 做独立查询，不占主 context


## 2026-06-02 — 安全加固 + 数据保护 + 组件重构

### 安全加固
- 删除硬编码集训密码 `SUMMER2025` — 集训只能通过教练端生成的 CAMP 码激活
- **集训码防篡改** — 随机后缀纳入 hash，和学生端校验同步。改任意一位即失效
- 修复教练端优秀码同样漏洞（合并到同一次修复）

### 数据保护
- **petStore save() 加备份** — 写入 temp 键再 swap，防写盘时崩溃损坏
- **petStore load() 加回退** — 主键损坏时从 temp 恢复
- **ErrorBoundary** — 主窗口 + 宠物窗包裹，崩了不白屏，显示"出了点问题，请重启"
- hatchStore 和 quizStore 已有备份，petStore 补齐

### 组件重构
- **PetPanel 拆分** — 849 行拆成 557 行主文件 + 225 行 PetStatus + 113 行 PetSettings
- 代码更易维护，每个文件职责单一

### 其他修复
- 默认窗口 1000→950, 650→600
- 宠物窗口禁最小化/最大化（防 Windows 系统菜单）
- 二进制 1011 答案修正 12→11
- 素数 100 以内答案修正 89→97
- 孵化面板等待状态加"开始孵化"按钮

### 设计决策
- 暂不做 E2E 测试（搭建成本高，编译检查 + 手动测足够）
- 暂不做 localStorage 迁移到 SQLite（风险大，现有数据兼容难保障）
## 2026-06-02/03 — 许愿墙 + 班级系统 + 教师后台 完整开发

## 2026-06-02/03 — 许愿墙 + 班级系统 + 教师后台 完整开发

### 概述
从单人使用到多教师多班级的完整升级。新增：许愿墙（学生提交/投票，老师管理）、班级码系统、教师Web后台、管理员后台。

### 核心功能

**许愿墙** (`src/components/pet/WishWall.tsx`)
- 班级码锁定：无码显示🔒锁屏，有码显示同老师所有班级许愿
- 三Tab独立：📋许愿规则 / 🔥热门 / 🆕最新
- 投票：商城购票(100g×1, 250g×3)，每周限购3张，每条每人限投1票
- 提交：Lv.10+ 宠物 + 完成本周练习 + 每月限3条
- 隐私：昵称公开，真名+手机号服务端AES加密，仅老师可解密
- 审核：服务端敏感词黑名单60+词
- 月度清理：懒触发（首次访问当月），0票优先，7天保护期

**班级系统**
- 班级码：12位纯随机（如P79VF54MHR37），服务端查表验证
- 学生绑定：SettingsPage弹窗一次性填码+昵称+真名+手机号
- 自动校验：打开设置时验证绑定状态，被移除自动清空
- 修改信息：可修改昵称等，同步到服务端
- 解绑：教师端操作（学生不解绑）

**教师Web后台** (`teacher-app/index.html` → teacher-csp.pages.dev)
- 教师：手机号+密码登录/注册，管理自己班级
- 管理员：密码登录(csp-teacher-2026)，看全校数据
- Tab: 班级管理 | 许愿管理 | 兑换码 | 需求反馈
- 兑换码：内联表单，生成方式与Chrome插件算法完全一致
- 需求反馈：提交类型(功能/Bug/建议)+标题+描述

**Worker API** (`cf-workers/api.js`, ~670行)
- 8张D1表：wishes, votes, teachers, classes, class_students, meta, generated_codes, feedback
- 20+端点：教师认证、班级CRUD、许愿、投票、兑换码、反馈收集
- AES-GCM服务端加密隐私字段（无硬编码回退密钥）
- 投票防竞态：INSERT-try-catch + UNIQUE INDEX
- ensureSchema缓存（只跑一次）+ 完整的CREATE TABLE覆盖

### 关键Bug修复（本次）
1. 许愿票先加后扣钱 → 颠倒顺序
2. 投票无跨老师范围校验 → 三级验证(wish→class→teacher)
3. 投票check-then-insert竞态 → INSERT+UNIQUE INDEX
4. ensureSchema缺CREATE TABLE → 补全核心表
5. ensureSchema缺teacher_name列 → 加ALTER TABLE
6. realName变量名错误 → real_name
7. ensureSchema无UNIQUE索引 → CREATE UNIQUE INDEX
8. 顶层catch无日志 → console.error
9. loadWishes报错不提示 → setMsg
10. 英文昵称无法绑定 → 正则放宽
11. Admin看不到学生列表 → 加Admin token回退
12. 绑定两次HTTP调用 → 合并为一次
13. 周计算偏差 → 修正算法
14. unbind_pending立即被锁 → validate接受pending状态
15. parseInt falsy-zero → Number.isFinite
16. 班级删除缺.catch() → 加错误处理
17. api()不检查resp.ok → 加状态码检查
18. 许愿成功后monthlySubmitted不更新 → 重新拉取
19. Teacher name不显示 → bind返回teacher_name
20. 兑换码日期用UTC → 改为本地时间

### 架构决策
- 兑换码日期：本地时间MMDD(EXC)/YYYYMMDD(CAMP)，与Chrome插件完全一致
- 班级隔离：老师级（同老师所有班级共享许愿墙）
- 学生不解绑，解绑全部由教师端管理
- AES加密密钥来自CF Worker env SERVER_SECRET
- Token生成用crypto.getRandomValues（非Math.random）

### 部署信息
- Worker: api.cspstudy.top (wrangler deploy)
- Web后台: teacher-csp.pages.dev (wrangler pages deploy)
- 管理员密码: csp-teacher-2026
- Cloudflare Token: csp-deploy-v2

### 设计文档
- docs/superpowers/specs/2026-06-02-wish-wall-design.md
- docs/superpowers/specs/csp-roadmap.md
- docs/superpowers/specs/cf-config.md

## 2026-06-03 — 精灵工坊开发

### 核心功能
- 🏭 workshop.cspstudy.top + teacher.cspstudy.top 互通
- AI 多厂商切换（智谱/阿里/混元/豆包），教师各自配 Key
- 参考 Hatch Pet：提示词按基准图→逐行动画→身份锁定→负面约束
- Canvas 帧提取+校验+拼合 spritesheet（8行×9列 Petdex 格式）
- KV 图片存储（免绑卡），缩略图 200×200 + GIF 预览
- pet.json 自动生成（anims/frameWidth/animsOrder/durations）
- 教师专属 localStorage Key（ws_ai_keys_{teacher_id}）

### Bug修复
- 许愿墙投票提示词 Hatch Pet 标准重写
- 参考图预览用 DOM 直接更新
- KV 存储二进制（非 base64 字符串）
- pet_json 反序列化补全
- 精灵列表教师过滤
- Admin 登录 !resp.ok 修复
- 图片加载错误日志修复
- 退出登录只清 token，保留 AI 配置
- submitting 变量声明缺失修复

### 部署信息
- Cloudflare API Token 因 GitHub 扫描泄露已轮换
- wrangler.toml: KV namespace csp-sprites (4fd505c38b4d4ce89833b660afb37703)
- 精灵工坊 Pages 项目: workshop-csp

## 题库图片更新流程

带图的题目：
1. 图片放到 `public/course-data/images/quiz-{id}.png`，push 到 Gitee
2. 题库 JSON 里加上 `<img src="https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/images/quiz-{id}.png">`
3. bump `version.json` 版本号
4. 学生端自动热更新，无需发版

Gitee 仓库路径：`public/course-data/images/`
Gitee raw URL 格式：`https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/images/{filename}`

## ⚠️ 发版文件命名规则

App `UpdateChecker.tsx` 硬编码了下载链接格式，不看 `update.json`：
```
csp-v{版本号去点}-arm.dmg     (如 csp-v140-arm.dmg)
csp-v{版本号去点}-intel.dmg   (如 csp-v140-intel.dmg)
csp-v{版本号去点}-win.exe     (如 csp-v140-win.exe)
```

上传 Gitee 时文件名必须严格匹配这个格式，否则 App 内手动下载 404。

## 2026-06-04 — 学习分析 + 超级挑战调整 + 发版修复

### 学习上报系统
- quizStore.addError 加 fetch 上报到 Worker API
- 全部模式（周常/自由/额外/超级）都上报，静默不阻塞
- D1 quiz_errors 表：question_id, knowledge_point, class_code, device_hash, UNIQUE(question_id, device_hash)
- Worker API: POST /api/quiz/error (上报) + GET /api/quiz/analytics (教师查询)

### 教师端 📊 学习分析 Tab
- 按班级筛选（下拉框切换）
- 本月知识点错题排行（🥇🥈🥉）
- 点击知识点 → 查看具体哪些学生错了
- 仅教师可见，管理员不显示

### 超级挑战调整
- 频率：两周1次 → 每周1次
- 集训模式激活时：不限次数
- 删除 getBiWeekKey，新增 getWeekKeyStr
- 成就无需修改（跟踪完成次数，不依赖频率）

### 发版流程修复
- v1.4.0 GitHub → Gitee 手动上传三平台安装包
- macOS 更新链接问题：App UpdateChecker.tsx 硬编码文件名格式 csp-v{short}-{arch}，不看 update.json
- ⚠️ 上传 Gitee 时文件名必须匹配：csp-v140-arm.dmg, csp-v140-intel.dmg, csp-v140-win.exe
- API Token 因 GitHub 扫描泄露，已轮换新 Token
- update.json 同时推送到 Gitee main 和 master 分支

### 教师端小修复
- 管理员可删除老师（含班级） + 删除反馈
- 精灵工坊链接（🏭）加到教师后台 header
- 管理员登录 resp.ok 检查修复
- 2026-06-05: 修复商城抽卡HatchConfirmModal点X关闭导致蛋丢失-Bug。onClose只清pendingHatch不调addEgg。改为和onLater一样先addEgg再setPendingHatch(null)。
- 2026-06-05: Plan A: 核心数据 localStorage→SQLite 迁移完成。用现有 settings 表+get_setting/set_setting 命令，无需改 Rust。4 个 core key (pet_data, hatch_eggs, quiz_state, problem_status) 迁至 SQLite，localStorage 保留作备份。新增 sqlite-storage.ts / migration.ts / problemStatusCache.ts。改造 petStore/hatchStore/quizStore 的 save/load 为 async+invoke。ProblemViewer 改用缓存 API。PetWindow 改用 invoke。quizStore 移除同步 loadState 初始化器。canDoSuperChallenge 改为读 petStore 内存状态。

## 2026-06-05/06 — 教练端 AI Debug 重构 + 题库修复 + 饥饿系统 + 工坊优化

### 教练端 AI Debug 推倒重来
- 旧：对比参考答案模式 → 太死板 (死磕参考答案)
- 中：评审模式 → 太宽容 (错代码说对)
- 新：推演模式 — AI 当代码追踪器，读题→推演→对比→检查→结论
- 输出极简化：AI 只输出 原因+错代码+正代码，UI 自带标签
- 修复：sendMessage 加 30s 超时、提示词反引号→纯字符串拼接、解析器兼容两种格式
- 部署命令：`CLOUDFLARE_API_TOKEN="xxx" npx wrangler pages deploy coach-app --project-name=coach-csp`

### 题库修复 (version 5→6)
- gesp-2023-12-3-06: 补 C++ 代码 (string::length)
- gesp-2023-12-3-07: 补 C++ 代码 (str[5] 越界)
- gesp-2023-12-3-08: 补 C++ 代码 (char数组初始化)
- gesp-2023-09-2-02: 补 SVG 流程图 + markdown 图片渲染支持
- markdown.ts: renderCodeText 加 ![alt](url) 图片支持

### 饥饿系统 (v1.5.1)
- tickHunger: -2→-1，每 10 分钟触发
- 离线饥饿：每 7 天 -25 (封顶 -75)
- 做题消耗：每题 -1
- lastActiveAt 字段持久化

### v1.5.0 发版
- Gitee API Token 创建 release 成功 (ID 701567)
- 文件格式：csp-v150-arm.dmg / csp-v150-intel.dmg / csp-v150-win.exe
- update.json 签名通过 Gitee API 推送

### 精灵工坊优化
- 🎨 创建精灵 | 📦 导入素材 分为两个独立 Tab
- ImportPanel: 上传 Petdex .zip → 自动解压 spritesheet + pet.json → 填表 → 确认保存
- JSZip CDN 引入
- 保存前确认弹窗（名字/元素/等级/描述均可修改）
- 工坊部署：`CLOUDFLARE_API_TOKEN="xxx" npx wrangler pages deploy workshop-app --project-name=workshop-csp`
- 注意：工坊无自动 CI，需手动 wrangler 部署

## 导入素材功能 (ImportPanel) — 稳定版本

**标签:** v1.5.2-import-stable

### 独立状态变量（和 CreatePanel 完全隔离）
- name, element, style, tier, desc
- resultUrl, thumbUrl, petJsonData
- submitting, imported, creatorName

### 保存流程 (doSavePet)
1. dataUrlToBlob(resultUrl) → FormData 上传到 /api/workshop/upload
2. dataUrlToBlob(thumbUrl || resultUrl) → FormData 上传缩略图
3. POST /api/workshop/pets (含 style, creator_name)

### 学生端下载链路 (WorkshopShop.downloadSprites)
1. fetch KV → writeFile spritesheet.png + pet.json
2. Canvas 截第一帧 192x208 → 缩到 72x78 → writeFile thumb.png
3. return true (‼️ 不能漏！)

### 展示链路 (PetStatus + WorkshopThumb)
- 缩略图: readFile + Blob URL → <img src=blobUrl>
- isRemotePet: 检查 ws- + workshop- 前缀
- getPetTier: 检查 workshop- 前缀

### Worker API
- upload: 支持 JSON (旧) + FormData (新)
- 写入验证: put → get 确认 → 失败重试 3 次
- 限流: 5/h, 20/d, 50总, 5MB/单文件

⚠️ 改 CreatePanel 时不要动 ImportPanel 的状态变量和 doSavePet 函数！

## v1.5.2 发布 — 2026-06-11

### 标签
- `v1.5.2-session` — 本次会话存档
- `v1.5.2` — 发布版本
- `v1.5.2-import-stable` — 导入素材稳定版

### 存储架构
- **load 优先级**: localStorage 先 → SQLite 兜底（降低 SQLite 阻塞风险）
- **persist.ts**: dualSave/dualLoad 公共模块，三 store 去重
- **sqlite-storage.ts**: sqliteGet/sqliteSet 加 5s 超时
- **Rust WAL**: 启动时 `PRAGMA wal_checkpoint(TRUNCATE)` 清理残留

### 饥饿系统
- 在线: 15min -1 | 做题: 2题 -1 | 离线: 7天 -25
- 每日上限 15 点（dailyHungerConsumed + hungerDate）

### 代码结构
- PetPanel 拆 3 文件: PetPanel(273行) + ShopPanel(327行) + WorkshopShop(113行)
- 公共持久化: src/lib/persist.ts

### 工坊 (Workshop)
- CORS 代理: Worker /api/workshop/proxy-image 解决智谱 CDN 无 CORS
- 拼合: base 图填入第 1 行 | toDataURL 三级容错
- 缩略图: 智能裁剪白底
- 保存: Blob/FormData 上传（避免 base64 截断）
- KV 可靠性: 写入验证 + 重试 3 次 + 限流(5/h, 20/d, 50总, 5MB)
- 导入: ImportPanel 完整流程已验证（独立状态,不和 CreatePanel 混）
- 万象: wanx2.1-t2i-turbo + 异步轮询 + ref_image
- 即梦/万象: 只支持固定比例，不适合 spritesheet 生成

### 桌面端关键修复
- tier 存入 OwnedPet: claimHatchedPet 可选 tier 参数
- getPetTier: workshop-/ws- 前缀 + p.tier 优先
- isRemotePet: workshop-/ws- 前缀
- WorkshopThumb: readFile + blob URL 加载缩略图
- HatchConfirmModal: onClose 同 onLater 或 addEgg
- doGacha: 双重扣费修复
- 许愿墙 Lv.10→6

### 新功能
- 更新公告弹窗: ChangelogModal
- AI 对话持久化: aiStore → SQLite (最近20条) + 🗑清空
- 每日饥饿上限: 15 点
- 工坊独立 Tab: PetPanel 主 Tab 🏭智子工坊

### 题库修复 (version 4→14)
- 修复 10+ 道缺代码/答案错误/选项被污染

### Web 端
- 学生反馈: display_name + real_name → 教师端可看到姓名
- 许愿热门: votes DESC, created_at ASC
- CORS: image endpoint + Allow-Methods 加 PUT
- 创建精灵: 去二次确认，直接保存

### 部署
- API: wrangler deploy cf-workers/api.js
- Workshop: wrangler pages deploy workshop-app --project-name=workshop-csp
- Teacher: wrangler pages deploy teacher-app --project-name=teacher-csp
