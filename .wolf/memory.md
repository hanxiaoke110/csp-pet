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
