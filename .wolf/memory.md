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
