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

### 新增精灵流程
1. 用户提供精灵素材（PNG + JSON）
2. 上传到 Gitee `pet-sprites-remote/2d/`（稀有/传说）或放到 `public/pet-sprites/2d/`（普通/初始）
3. 修改 `src/types/pet.ts`：添加 speciesId、名字、`PET_TIERS` 分级
4. 修改 `src/stores/petStore.ts`：加入商城/抽卡池（如需要）
5. 重新发版（更新版本号 + tag + push）
6. 学生更新 App 即可看到新精灵
7. 稀有/传说精灵首次使用时自动孵化下载

### 课程数据更新流程
1. 教练端编辑课程 → 导出 lessons-coach.json
2. 上传到 Gitee `public/course-data/`（更新 lessons.json + version.json）
3. 学生 App 启动时自动检测更新 → 自动下载新课程数据
4. 无需发新版
