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
- 第三轮（Windows 实机：开启/收回不卡了，但智子不显示、软件关不掉、强杀后重启卡加载）：⑨ Windows 主窗口点 X 改为真正退出整个应用（原来统一“关闭→隐藏托盘”，只能强杀导致下次启动异常）；⑩ pet-2 窗口数据改为轮询重试（独立环境 localStorage 为空 + SQLite 异步写入，初次读取拿不到桌面伙伴 → 空透明窗口看不到智子）；⑪ 启动恢复桌宠延后到主界面加载完成后再做。
- 第四轮（2026-08-05，v1.7.30 后用户反馈仍不显示/点不到，本轮改动）：
  - ⑫ **指针级点击穿透取代面积启发式**（PetWindow.tsx 内按 `cursorPosition()` 150ms 轮询）：只有光标悬停在精灵本体上窗口才接收鼠标，其余透明区域始终穿透。旧方案 A「主窗口聚焦 + 智子≥50% 压主窗口 → 穿透」会形成死锁——智子出生位置大概率压在主窗口上，穿透后永远抓不到（“点不到”根源）；轮询方案即使正在穿透，光标移入精灵也会立即恢复交互。Rust 侧穿透逻辑（`should_pet_ignore_cursor`/`recompute_pet_click_through`/焦点防抖器）全部移除，焦点事件只保留置顶。
  - ⑬ **数据轮询加固**：pet-2 读 pet_data 改用带 5s 超时的 `sqliteGet`（裸 invoke 在独立 WebView2 环境挂起会让整条轮询链卡死在一次尝试上）；轮询从 4.5s 延长到约 30s，期间每 ~2s 补发 `pet-request-sync`（覆盖主窗口监听未注册时首次同步请求丢失的竞态）。
  - ⑭ **空数据不再渲染不可见窗口**：activePet 为空时渲染「智子正在赶来…」占位卡（可拖拽），30s 后提示可收回重试；此前返回 null → 强制 show 后整个窗口完全透明，孩子以为没出现。
  - ⑮ Windows 主窗口关闭时不再 `destroy()` 桌宠窗口（挂死的 WebView2 会让 destroy 阻塞、进程退不掉），只暂停渲染+隐藏后直接 exit。
- 待 Windows 真机验证：第二智子显示（含占位卡→精灵切换）、悬停可点可拖、压主窗口不挡精灵外区域、点 X 退出、重启恢复、收回不卡。
- 相关代码：`src/utils/desktopCompanions.ts`、`PetWindow.tsx`、`PetStatus.tsx`、`App.tsx`、`src-tauri/src/{lib,main}.rs`；测试 136/136 通过，`cargo check` 通过。

### 第五轮（2026-08-05）：架构重构——单窗多宠，彻底取代多 WebView2 窗口方案

- 结论：前 4 轮都在给「运行时创建第二个透明 WebView2 窗口」打补丁，该方案在部分 Windows 机器上天生不稳（Tauri #8196），独立数据目录 workaround 又引入 localStorage 不通/跨窗同步/孤儿进程/退出挂死连环故障。**改为成熟方案：一个覆盖工作区的全屏透明置顶窗口，内部渲染 N 只智子**（Shimeji/直播桌宠 overlay 标准做法）。第二智子与第一只走完全相同的代码路径（第一只在该 Windows 机器上可用）。
- 改动：
  - `lib.rs`：删除 `show_desktop_companion`/`hide_desktop_companion` 命令与独立数据目录逻辑；Windows 关闭只处理 pet 一个窗口（hide 不 destroy）。
  - `main.rs`：移除 `--disable-gpu-compositing`（多窗口时代 workaround，对全屏透明窗口是性能负担）。
  - `PetWindow.tsx` 重写：窗口覆盖工作区；智子位置 = DOM transform（漫游不再每 100ms 移 OS 窗口，无闪烁）；拖拽 = DOM 位移；气泡/点击/双击回位按 slot 独立；位置存 v3（窗口相对逻辑坐标），v2 自动迁移。
  - 点击穿透：整窗默认穿透（失败安全），150ms 轮询 `cursorPosition()`，光标悬停在任意精灵本体上才放开交互；拖拽途中不切穿透。capabilities 补 `core:window:allow-set-ignore-cursor-events`（注意：JS 调 setIgnoreCursorEvents 必须显式授权，core:default 不含；cursorPosition/currentMonitor 已在 core:window:default 内）。
  - `PetSprite.tsx`：逐帧动画 background-position → transform（合成器渲染，全屏窗口必须）；新增 `apiRef` 实例句柄 + `exposeGlobals`（多实例不再抢 window 全局）。
  - `PetStatus.tsx`：设为/收回桌面伙伴 = 纯数据操作（pet-data-sync 驱动），无窗口创建/握手/超时回滚；`App.tsx` 启动恢复删除；`desktopCompanions.ts(+test)` 删除。
- 验证：cargo check / tsc / vitest 129 / vite build 全通过；**macOS tauri dev 真机验证通过**（2026-08-05 晚）：三只智子同屏显示、悬停点击冒泡、拖拽移动、空白处穿透正常（Quartz CGEvent 端到端打点验证，脚本在 `.tmp/pet_click_test.py`）。
- 待 Windows 真机验证：第二智子显示、悬停可点可拖、空白处全穿透、点 X 退出、重启自动出现、收回即消失、低配置性能。

### 多屏支持：方案 D「一键换屏」（2026-08-05 晚已实现 + Mac 双屏实测通过）

- 背景：旧版单智子小窗口可拖到其他屏幕，单窗多宠后智子被限定在主屏——能力回退，需补。
- 调研结论（成熟项目）：**没有任何知名项目用"一个窗口横跨所有显示器"**——CrossOver（Electron overlay）用「整窗跳到下一屏」；截图工具用「每屏一个窗口」；Desktop Goose/Shimeji 多屏都没做好。且 WebView2 横跨混 DPI 显示器有多个已知 bug（#5253 内容错位、wails#5677 缩小消失）。**结论：窗口永远完整待在一块屏内，整体搬屏**。
- 实现：设置页「🖥️ 智子在哪块屏幕」（只在 >1 块屏时显示）+ 主智子操作条 🖥️ 图标（同条件）→ `pet-hop-monitor` 事件/直接调用 → 循环搬屏（2 屏互换、3+ 屏循环）；偏好存 `csp_pet_monitor`（名字优先、序号兜底），重启恢复；搬屏后智子收进新屏边界（400ms 过渡）。
- **两个 macOS 坐标坑（实测标定，已在代码注释固化）**：
  1. tao `set_outer_position` 用窗口**当前** backingScale 换算，跨屏到异 scale 屏直接设物理坐标偏移正好一半 → `applyMonitor` 两阶段：先 LogicalPosition 近似落位 → 350ms 等 backingScale 切换 → PhysicalPosition 精确校正；
  2. tao `cursorPosition` 在 macOS 上对所有屏统一返回「逻辑点 × **主屏** scale」，与窗口坐标「逻辑 × 各自屏 scale」约定不一致 → 命中测试在 macOS 统一换算到逻辑点比较（光标 ÷ 主屏 scale）；Windows 无全局逻辑空间，维持物理像素比较（PMv2 下 GetCursorPos 即物理）。
- Mac 双屏实测：搬到副屏（位置/尺寸精确）、副屏点击冒泡、命中正确、搬回主屏命中正确。漫游中点击可能落空（元素在动，mouseup 落点不在精灵上）——与旧版窗口漫游时同类表现，非回归。

### Windows 桌宠「打开→关闭→再打开 = 未响应」（2026-08-07 已修）

- 现象：显示桌宠 → 隐藏 → 再显示，窗口变「CSP Pet（未响应）」幽灵窗。
- 根因：第 1 轮引入的隐藏时 `SetIsVisible(false)` 暂停 WebView2 渲染——部分机器重新激活静默失败，窗口冻结成幽灵。
- 修复：Windows 隐藏只做 OS 层 `hide()`（`hide_pet_os_window`)，Chromium 页面可见性自动 hidden 即暂停渲染；macOS 不变。cargo check 通过。

### 顺手修复：工坊智子点击闪烁（豆包闪烁根因，2026-08-05）

- 现象：点击工坊生成的智子（如豆包 ws-CFQC6VR6A0）会"闪一下"；内置精灵不闪。
- 根因：早期工坊生成器写的 meta 不规范——`animsOrder`（错别字键，PetSprite 只认 `animOrder`）、`anims: {"idle":[0,5]}`（[行,帧数] 数组写法）、只声明 1 行但 PNG 实际 9 行。PetSprite 回退到 7 行 ANIM_ORDER → idle 帧数取到数组变成非法动画名（静止）→ 点击切 interact 按错误行号跳帧 → 闪烁。
- 修复（PetSprite.tsx `normalizeSheet`）：一律以 PNG 真实几何为准——行数定布局（9 行 = Codex 布局、7 行 = 标准布局），声明仅在实际行数相符时采信；数组写法取帧数；帧数 keyframes 1..12 全覆盖；条带宽度用真实列数。修复后豆包 idle 恢复动画、点击正常跳 jumping 行，真机验证通过。

## 试炼场“题库正在准备中，打不过去”（2026-08-05 根因已修复，未发版）

- 2026-08-04 第一轮（重载+重试+兜底+门禁）只是缓解；发版后仍复现，2026-08-05 查到真正根因：
- **根因**：V2 canonical 题库中 705 道 GESP 题的 `exam.group` 为 `null`（级别存在 `exam.level` 上），`toLegacyQuestion` 原样透传 → 试炼场抽题过滤器要求 `group === 'J' || (group === 'GESP' && level <= 4)` → 全部 GESP 题被滤掉，只剩 88 道 CSP-J；高难度副本（[3,4] 难度段）标签匹配与兜底全部为 0 → 技能永远出不了题，「题库正在准备中」死循环，后面的关卡根本过不去。
- 修复：① `adapters.ts` 按 `source === 'gesp'` 推断 group 为 'GESP'（修复后可用池 88 → 785，各副本各技能均有题，含 [3,4] 兜底 29 道）；② `loadQuestionBank` 的 V2 路径之前不会预加载统一排除名单（excluded-question-ids），已提到最前面两条路径共用。
- 另：答题面板改为「先选选项、再点提交按钮」两步确认（孩子反馈点选项即提交容易误触），选中项金色高亮，未选择时提交按钮禁用。
- 验证：136/136 测试通过（新增 2 条组别推断用例），tsc 通过，vite build 通过。

## 智子拖不动（点击穿透，2026-08-05 指针级方案取代方案A）

- 根因：v1.7.26 删掉智子显示时的 `set_focus()` 并扩大穿透范围到全部智子 → 主窗口有焦点时智子永远穿透 → 拖拽事件收不到。
- 方案A（v1.7.30 已发）：Windows 区域感知穿透——“主窗口有焦点 + 智子≥50%面积压在主窗口上”才穿透。**已被取代**：智子出生位置大概率压在主窗口上，一旦穿透孩子没有任何办法抓住它（点穿到主窗口、主窗口保持焦点、穿透保持）——“点不到”的死锁仍在。
- 最终方案（本轮）：PetWindow 内指针级穿透——150ms 轮询 `cursorPosition()`，只有光标悬停在精灵本体上窗口才接收鼠标，其余透明区域始终穿透；拖拽途中不切穿透。即使正在穿透，光标移入精灵也立即恢复交互，无死锁。Rust 侧穿透逻辑全部移除（焦点事件只保留置顶），Windows/macOS 行为一致。
- 代码：`src/components/pet/PetWindow.tsx`（轮询）、`src-tauri/src/lib.rs`（移除 `should_pet_ignore_cursor`/`recompute_pet_click_through`/防抖器）。
- 待 Windows 真机验证：桌面可拖、压主窗口只有精灵本体挡点击、拖动不被打断。

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

## 部署状态（2026-08-05 更新）

- [x] **v1.7.30 已发版**（2026-08-04 晚）：题库大修（29+28，预制最新题库数据）+ 试炼场题库修复 + 成就计数修复 + Windows 第二智子 3 轮修复 + 方案A 区域穿透；tag v1.7.30，CI 三平台 + release 全 success，Gitee Release / update.json=1.7.30（GitHub 兜底 URL 已验证）。
- [x] 公告 id 19（发版）+ id 18（警示）均已置顶，明确「Windows 第二智子问题仍未解决，请继续暂缓使用」。
- [ ] **Windows 第二智子专项仍未解决**：待真机复测/继续修复（详见 `docs/2026-08-04-windows-second-pet-fix-record.md`）。
- [x] CI 防护：release 只在 v* tag 执行（commit fb28b1a），手动构建不再误改线上 update.json。

## 飞书版本更新文档（2026-08-10）

- 文档：https://scncdgmg7m6w.feishu.cn/docx/VJmgd3RB0oOzPfxV9MxcKzzyn1b（bot 创建，老师 full_access；分享前设“链接可阅读”）
- 自动更新：`node scripts/update-feishu-release-doc.mjs`（发版后跑一次，自动抓 Gitee 最新安装包 + 公告更新说明）

## 下载链接被 Chrome 报“危险网站”（2026-08-10）

- 原因：Gitee 附件下载会 302 到 `foruda.gitee.com/attach_file/...`，该公开文件托管域名被 Google 安全浏览标记（尤其未签名 exe）。
- 已做：① 飞书文档已直接上传三个安装包附件（Windows exe + Mac ARM/Intel dmg），用户可从飞书附件直接下载（feishu.cn 可信域名，无警告）；② `cf-workers/api.js` 新增稳定直链 `/dl/win|mac-arm|mac-intel`（Worker 代理 Gitee 最新版，自动指向最新安装包，链接永不变）。
- 待办：`npx wrangler login` 后在仓库根目录 `npx wrangler deploy` 部署 Worker；部署后把飞书文档里的下载链接换成 `https://api.cspstudy.top/dl/win` 等稳定直链（并同步 update-feishu-release-doc.mjs 的链接替换逻辑）。

## 部署状态（2026-08-08 更新）

- [x] **v1.7.31 已发版**（2026-08-07 晚）：单窗多宠架构重构（Windows 第二智子根源解决）+ 指针级点击穿透（智子点不到）+ 桌宠隐藏再显示「未响应」修复 + 多屏一键换屏 + 工坊智子闪烁修复（normalizeSheet）+ 试炼场题库根因（GESP group=null）+ 答题提交按钮防误触。**Windows 真机验证通过**（孩子机器，全套清单）。
- [x] **v1.7.32 已发版**（2026-08-07 晚）：Windows 主窗口 X 恢复最小化到托盘（学生反馈）+ CI 三包并行上传（发布 30min→约 25min 全程）。update.json=1.7.32 签名干净、三包 HEAD 验证 200。
- [x] 公告：id 20（v1.7.31 发版）、id 21（v1.7.32 发版）置顶；id 18 改为「已修好」、id 19 取消置顶。
- [x] **事故记录**：手动触发 CI 不带 --ref 时跑在积灰的 main 分支（旧工作流无 tag 门禁），曾把 Gitee update.json 覆盖为垃圾值——已恢复，且 GitHub 默认分支已改 master，杜绝复发。教训：gh workflow run 永远带 `--ref master`。
- [x] **Windows 第二智子专项关闭**：真机验证通过（显示/点击/拖拽/收回/退出/重开恢复/换屏）。
- [x] **通关榜少算修复已上线（2026-08-08）**：服务端 sync 通关状态修复通道（只升不降）+ 客户端启动修复推送（94fa578）。worker 已部署。部署通道已彻底修好（2026-08-08）：`./deploy-worker.sh` 一键部署（wrangler 优先、直接 API 兜底）；注意 ① 本机 wrangler 4.103 只认旧变量名 CLOUDFLARE_API_TOKEN，token 存项目根 .cf-api-token（gitignored）；② 必须 `-c wrangler.toml`，否则 wrangler 会向上误用父目录 wrangler.jsonc 部署到 csp 静态 worker。学生重打一遍各副本 Boss 即可修复榜单（当前客户端即可）；下个客户端版本启动自动修复。
