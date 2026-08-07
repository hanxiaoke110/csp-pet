# Windows 第二智子卡死专项 — 迭代修复记录（2026-08-04）

> 目的：给后续接手的人一份完整记录，包含现象、根因、已做的 3 轮修复、真实机反馈、待验证项和复测清单。
> 当前状态：**代码已合入 GitHub master，未打 tag、未发版**；最新测试包在 CI 构建中，待 Windows 真机复测。

## 1. 现象（孩子/家长反馈原文整理）

Windows 电脑、已解锁 2 个及以上桌面伙伴位置时，开启第二智子会出现：

1. 点「设为桌面伙伴 2」→ 按钮变「正在启动…」→ 漫长等待 → 按钮变「收回桌面伙伴 2」（主程序认为成功了），但**桌面没有出现第二只智子**；
2. 主窗口开始异常：当前界面图片加载消失，选择题 2 级 / CSP 真题 / OJ 训练 / 学习资料 / 课程数据 / 智子试炼场全部卡在「加载中…」；
3. 点「收回桌面伙伴 2」后问题不消失，**软件无法正常关闭**，只能任务管理器强杀；
4. 若在「已收回」状态下强杀后重开 → 软件正常；
5. 再开第二智子 → 周打卡选择题正常，其余再次出问题；
6. 若在「设为桌面伙伴 2」状态下强杀后重开 → 启动后无限卡在加载页。

## 2. 根因（两层）

### 2.1 为什么窗口不出现（前端逻辑缺陷）

- Rust 创建 `pet-2` 窗口时是 `visible(false)`，等页面精灵就绪后才 `show()`，防闪白；
- `show_desktop_companion` 命令只要**窗口建好**就返回 Ok，不等待「窗口真的可见」；
- 前端收到 Ok 就把按钮改成「收回桌面伙伴 2」，形成**假成功**；
- 「刀盾守卫」等传说宠物是远程素材（安装包内没有），首次启用要从 Gitee 下载，失败按 10s→30s→90s→270s 指数退避，最长约 6.5 分钟，期间窗口一直隐藏；且**没有任何超时强制显示**。

### 2.2 为什么整个软件卡死（Windows/WebView2 层）

- pet / pet-2 / pet-3 共享同一套 WebView2 浏览器/GPU 进程；
- 项目自有的 Windows 性能分析（2026-08-03）已确认：3 个透明 WebView2 窗口做 60fps CSS 逐帧动画是最大瓶颈；
- 部分 Windows 机器上，共享环境里**创建第二个窗口会把整个应用拖死**（Tauri 官方 issue #8196 同类问题），表现就是图片消失、异步加载全部挂起、关闭无响应；
- 另外：主窗口点 X 被设计成「关闭→隐藏到托盘」（`prevent_close`），用户找不到退出入口只能强杀；强杀留下孤儿 WebView2 进程，导致下次启动卡加载。

## 3. 迭代记录

### 第 1 轮（commit `ec26ade`）— 假成功 + 超时兜底

改动：
- `PetWindow.tsx`：挂载 2.5s 超时强制显示（loading 兜底），显示后广播 `pet-companion-shown`；
- `desktopCompanions.ts`：新增 `waitForCompanionVisible`（事件 + 原生窗口 `isVisible` 轮询双通道，10s 超时）；
- `PetStatus.tsx`：设为桌面伙伴需等窗口真正可见，超时自动回滚位置并销毁窗口；
- `App.tsx`：启动恢复 pet-2/pet-3 改为非阻塞 + 8s 超时 + 失败清位；
- `lib.rs`：隐藏/收回桌宠时暂停 WebView2 渲染（`Webview::hide`），收回时销毁窗口；
- `main.rs`：Windows 注入 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu-compositing`。

真机反馈：**仍卡死在「正在加载课程数据..」**（截图确认），第二智子仍不显示，收回后仍卡。说明共享环境问题 JS 层救不回来。

### 第 2 轮（commit `1b13ddf`）— 进程隔离

改动：
- `lib.rs`：Windows 上 pet-2/pet-3 改用**独立 WebView2 用户数据目录**（`appdata/webview2-pet-{slot}`），把桌宠窗口与主窗口进程隔离（Tauri #8196 官方 workaround）；
- 收回不再 `destroy()`（销毁可能等待挂死的 WebView2 进程而阻塞主线程），改为「暂停渲染 + 隐藏」；
- `PetSettings.tsx` / `PetWindow.tsx`：尺寸/漫游偏好镜像到 SQLite（独立环境 localStorage 不共享后仍能跟随主设置）。

真机反馈：**开启/收回不再卡**（隔离生效），但**第二智子仍不显示**、软件关不掉、强杀后重启卡加载。

### 第 3 轮（commit `be2e328`）— 退出 + 数据轮询

改动：
- `lib.rs`：Windows 主窗口点 X = **真正退出整个应用**（先清理桌宠窗口再 `exit(0)`）；不再统一「关闭→隐藏托盘」；
- `PetWindow.tsx`：独立环境 localStorage 为空 + SQLite 写入异步，初次读取可能拿不到桌面伙伴 → **每 300ms 轮询重试读取 pet_data（最长约 4.5s）**；
- `App.tsx`：启动恢复桌宠**延后到主界面加载完成之后**，避免与课程数据加载竞争。

真机反馈：**尚未复测**（此轮构建后用户转向了试炼场问题）。

### 附带：同批测试包内的其他修复

- commit `22a2ac2`：成就计数与卡片同口径（4/6 vs 6/6 问题）；
- commit `c44feaa`：试炼场「题库正在准备中、打不过去」修复（选技能现场重载 + 重试按钮 + 题库加载退避重试 + 知识点兜底 + 战斗路由门禁）。

## 4. 当前代码清单（文件级）

| 文件 | 作用 |
|---|---|
| `src/utils/desktopCompanions.ts` (+`.test.ts`) | 窗口可见性握手、超时、恢复辅助 |
| `src/components/pet/PetWindow.tsx` | 2.5s 强制显示、`pet-companion-shown` 事件、数据轮询重试、SQLite 偏好读取 |
| `src/components/pet/PetStatus.tsx` | 设为桌面伙伴的手动流程：等待可见、失败回滚 |
| `src/components/pet/PetSettings.tsx` | 尺寸/漫游偏好双写（localStorage + SQLite） |
| `src/App.tsx` | 启动恢复延后到主界面加载完成、8s 超时 + 失败清位 |
| `src-tauri/src/lib.rs` | 独立 data_directory、隐藏暂停渲染、收回不销毁、Windows 主窗口 X=退出 |
| `src-tauri/src/main.rs` | Windows WebView2 稳定性参数（`--disable-gpu-compositing`） |

## 5. 待验证 / 风险项（后续接手重点）

1. **最新测试包（第 3 轮 + 试炼场修复）未在 Windows 真机复测**：重点验证 ① 第二智子是否出现（数据轮询后应出现）；② 点 X 是否完全退出；③ 重开是否正常、第二智子是否自动恢复；④ 收回是否无卡顿。
2. `--disable-gpu-compositing` 在隔离后可能已非必需：若性能回退明显可移除；若仍崩溃升级为 `--disable-gpu`（`main.rs` 注释已写明）。
3. 收回现在「不销毁窗口、只暂停渲染+隐藏」：如果该 WebView2 进程已挂死，资源会保留到应用退出——这是为避免阻塞主线程的取舍，可后续优化（如退出前统一清理）。
4. Windows 主窗口 X=退出 改变了原有「关闭→隐藏托盘」的产品行为（macOS 仍保持隐藏）；确认该 UX 变更可接受。
5. 启动恢复失败会自动清掉 `desktopCompanionIds`（用户需重新设置第二智子），属防卡死的设计。
6. 已发公告（id 18，老师口吻）：Windows 同学暂缓使用第二智子；**发版验证通过后需发新公告撤销**。

## 6. Windows 真机复测清单

- [ ] 打开软件 → 主界面正常进入（不再卡「正在加载课程数据」）
- [ ] 设桌面伙伴 2 → 等 5 秒左右，第二智子出现（可能先有 loading）
- [ ] 点主窗口 X → 进程完全退出（任务管理器无 `csp-desktop-pet`）
- [ ] 重新打开 → 主界面正常，第二智子在主界面加载完成后自动恢复
- [ ] 收回第二智子 → 无卡顿
- [ ] 试炼场进战斗 → 选技能正常出题；题库未就绪时提示带「重试」按钮
- [ ] 任务管理器观察：pet-2 为独立 `msedgewebview2` 进程，关闭应用后消失

## 7. 构建/发布信息

- GitHub Actions：`Build & Release` 手动触发（workflow_dispatch），不推 tag 则不会发版；
- 测试包产物：artifact `windows-x86_64` → NSIS `CSP 学习助手_1.7.29_x64-setup.exe`（未签名，SmartScreen 需「更多信息 → 仍要运行」）；
- 本机已下载：`~/Desktop/CSP_1.7.29_x64-setup-test.exe`（注意每次 CI 完成后需要重新下载替换）；
- 已推送提交：`22a2ac2` → `ec26ade` → `1b13ddf` → `be2e328` → `c44feaa` → `75db2de` → `61ff84c` → `fb28b1a` → `f22d211`（master）。

## 8. 追加：智子拖不动（点击穿透回归，2026-08-04 方案 A）

### 现象

更新后（v1.7.26+）主窗口和智子窗口同时出现时，智子总是「选中不到」，拖拽很困难。

### 根因

- 点击穿透逻辑 v1.7.13 就有（防止智子挡住主窗口按钮，如知识卡），但只影响主窗口聚焦时；
- **v1.7.26（commit `5680e71`）删掉了智子窗口显示时的 `set_focus()`**（为避免抢焦点/闪烁），同时把穿透范围扩大到 pet/pet-2/pet-3，并强制智子置顶；
- 后果：主窗口一直有焦点 → 智子永远处于点击穿透 → 鼠标事件到不了智子 → `startDragging()` 永远不触发 → 「总选中不到」。

### 方案 A（已实现，随 v1.7.30 发布）

**区域感知穿透**（Windows）：只有「主窗口有焦点」且「智子有一半以上面积压在主窗口上」时才点击穿透；智子在桌面空白处始终可交互、可拖拽。

- `lib.rs` 新增 `window_rect` / `overlap_ratio` / `should_pet_ignore_cursor` / `recompute_pet_click_through`；
- 主窗口焦点变化（防抖后）按区域重算穿透 + 置顶；
- 智子/主窗口移动或缩放时（`WindowEvent::Moved/Resized`）实时重算穿透，拖到主窗口上方会变穿透、拖回桌面立即恢复可拖；
- `show_desktop_companion` 显示后立即重算一次；
- macOS 保持原行为（主窗口聚焦即穿透）。

### 待真机验证

- 智子在桌面空白处能否直接拖拽；
- 智子压在主窗口上时是否仍不挡主窗口按钮；
- 拖拽过程中从桌面拖到主窗口上方是否会被打断（设计上主窗口失焦 → 不切穿透，应不会打断）。

## 9. 发版与当前状态（2026-08-05 更新）

- **v1.7.30 已正式发版**（2026-08-04 晚）：tag `v1.7.30`，CI run #30885331503 三平台构建 + release 全部 success；
- Gitee Release v1.7.30 已创建；`update.json` = 1.7.30（下载 URL 走 GitHub Release 兜底，三个安装包链接已验证可下载）；
- 版本内容：题库大修（29 题修复 + 28 题白名单，预制最新题库数据，sha256 全部匹配）、试炼场题库修复、成就计数修复、Windows 稳定性调整（含本专项全部 3 轮 + 方案 A）；
- **Windows 第二智子问题仍未完全解决**：用户反馈开启后智子仍可能不显示/卡顿；公告已明确写清：
  - 公告 id 19（置顶）：v1.7.30 发版公告，注明「Windows 第二智子问题仍在修复中，请继续暂缓使用」；
  - 公告 id 18（置顶）：标题「Windows 电脑的同学请注意：第二智子继续暂缓使用」，明确「即使更新到 v1.7.30 也请继续暂缓」。
- CI 防护（commit `fb28b1a`）：release 任务只在 `v*` tag 时执行；手动 workflow_dispatch 只出构建产物，不再碰线上 update.json。

### 后续待办（接手重点）

1. Windows 真机复测 v1.7.30：第二智子显示、区域穿透拖拽、点 X 退出、重启恢复、收回不卡；
2. 若仍不显示，优先检查 pet-2 独立 WebView2 环境下的数据链路（`get_setting('pet_data')` 轮询）与 `PetSprite` 远程素材加载；
3. 若仍崩溃，把 `main.rs` 的 `--disable-gpu-compositing` 升级为 `--disable-gpu` 或调整独立环境策略；
4. 修复完成后发 v1.7.31+，并更新/撤销公告 id 18、19 中“暂缓使用”的提示。

## 10. 第四轮（2026-08-05，v1.7.30 真机仍不显示/点不到之后）

用户反馈 v1.7.30 后第二智子仍不显示、智子点不到。本轮四处改动：

1. **指针级点击穿透取代方案 A**（核心）。方案 A 有死锁：智子出生位置 (280,160) 大概率压在主窗口上 → 主窗口聚焦 + 重叠≥50% → 穿透 → 孩子的点击全落在主窗口上、主窗口保持焦点、穿透永远保持 → 没有任何办法抓住智子。现改为 `PetWindow.tsx` 内 150ms 轮询 `cursorPosition()`：只有光标悬停在精灵本体上窗口才接收鼠标事件，其余透明区域始终穿透；穿透中光标移入精灵立即恢复交互；拖拽途中（`dragStarted`）不切穿透。Rust 侧 `should_pet_ignore_cursor` / `overlap_ratio` / `recompute_pet_click_through` / 焦点防抖器全部移除，焦点事件只保留置顶。Windows/macOS 行为统一。
2. **数据轮询加固**：pet-2 读 `pet_data` 从裸 `invoke` 改为带 5s 超时的 `sqliteGet`（独立 WebView2 环境 IPC 挂起会让整条轮询链卡死在一次尝试上）；轮询从 4.5s 延长到约 30s，每 ~2s 补发 `pet-request-sync`（覆盖主窗口监听未注册时首次同步请求丢失的竞态）。
3. **空数据渲染占位卡**：`activePet` 为空时不再返回 null（强制 show 后整窗完全透明 = “没出现”），改为渲染「智子正在赶来…」占位卡（可拖拽），约 30s 后提示可收回重试。
4. **Windows 关闭不再 destroy 桌宠窗口**：挂死的 WebView2 会让 `destroy()` 阻塞、进程退不掉；只暂停渲染 + 隐藏后直接 `exit(0)`。

### 附带：试炼场题库真正根因（同批修复）

v1.7.30 后「题库正在准备中」仍复现。根因：V2 canonical 题库 705 道 GESP 题 `exam.group` 为 `null`，`toLegacyQuestion` 透传 → 抽题过滤器（`group==='J' || GESP level≤4`）滤掉全部 GESP 题 → 高难副本 [3,4] 难度段匹配与兜底均为 0 → 技能永远出不了题。修复：`adapters.ts` 按 `source==='gesp'` 推断 group='GESP'（可用池 88→785）；`loadQuestionBank` V2 路径补上统一排除名单预加载。另：答题面板改为「选选项 → 点提交」两步确认防误触。

### 验证

- `cargo check` 通过；`tsc --noEmit` 通过；`vitest` 136/136 通过（新增 2 条组别推断用例）；`vite build` 通过。
- 待 Windows 真机复测：① 第二智子出现（可能先看到占位卡再变精灵）；② 悬停精灵可点可拖、压在主窗口上时只有精灵本体挡点击；③ 点 X 完全退出；④ 重开自动恢复；⑤ 收回不卡；⑥ 试炼场高难副本技能正常出题。

## 11. 第五轮（2026-08-05 晚）：架构重构——单窗多宠

第四轮仍是补丁思路。复盘结论：**「运行时给每个伙伴创建一个透明 WebView2 窗口」这个地基在部分 Windows 机器上不可用**（Tauri #8196），独立数据目录 workaround 则带来 localStorage 不通、跨窗数据同步、ACL、孤儿进程、退出挂死等连环故障。没有 Windows 真机，继续打补丁无法收敛。

**最终方案（成熟做法，Shimeji/直播桌宠 overlay 同款）**：一个覆盖整个工作区的全屏透明置顶窗口（沿用现有 `pet` 窗口），内部渲染 N 只智子。第二智子与第一只走完全相同的代码路径——第一只在该机器上可用，因此第二只不再有额外的故障面。

- 窗口：启动时 `currentMonitor()` → 覆盖工作区；整窗默认 `setIgnoreCursorEvents(true)`（失败安全），PetWindow 内 150ms 轮询 `cursorPosition()`，光标悬停在任一精灵本体上才放开交互。
- 位置/漫游/拖拽：全部是 DOM `transform` 位移（窗口本身不动），漫游不再每 100ms 移动 OS 窗口（旧闪烁源消除）；位置存 v3 窗口相对逻辑坐标，v2 自动迁移。
- 数据：与主窗口同 WebView2 环境，localStorage 直接共享 + `pet-data-sync` 事件驱动；设置/收回伙伴 = 纯数据操作，无窗口创建、无握手、无超时回滚、无启动恢复。
- 删除：`show_desktop_companion`/`hide_desktop_companion` 命令、独立数据目录、`desktopCompanions.ts(+test)`、`App.tsx` 恢复逻辑、`main.rs` 的 `--disable-gpu-compositing`。
- `PetSprite`：逐帧动画 background-position → transform（全屏窗口下避免整面重绘）；`apiRef` 实例句柄解决多实例抢 window 全局。
- capabilities：补 `core:window:allow-set-ignore-cursor-events`（JS 调它必须显式授权，**这也是第四轮轮询方案在 ACL 下会被静默拒绝的隐患**）；`cursor-position`/`current-monitor` 已含在 core:window:default。
- 顺带修正文案：设置页「独立窗口」→「同屏显示」。

验证：`cargo check`、`tsc`、`vitest` 129/129（删了 desktopCompanions 7 条）、`vite build` 全通过；**macOS `tauri dev` 真机端到端验证通过**（2026-08-05 晚）：三只智子同屏显示、悬停点击冒泡、拖拽移动、点击穿透正常（Quartz CGEvent 合成事件验证）。

**Windows 真机复测清单（v1.7.31 候选）**：① 设桌面伙伴 2 → 立即出现在桌面（与主智子同屏）；② 悬停精灵可点（冒泡）可拖；③ 精灵以外区域全部穿透（主窗口按钮不受挡）；④ 拖到主窗口上方再拖走不卡；⑤ 点 X 完全退出、重开自动恢复；⑥ 收回即消失；⑦ 低配置机器开 3 只智子的流畅度；⑧ 任务管理器确认只有 1 组 pet WebView2 进程。

## 12. 追加：工坊智子点击闪烁（豆包闪烁，2026-08-05 晚已修）

- 现象：点击工坊生成的智子会"闪一下"，内置精灵正常；此前也有孩子反馈过智子闪烁。
- 根因：早期工坊生成器写入的 meta 不规范：`animsOrder` 错别字键（PetSprite 只认 `animOrder`）、`anims: {"idle":[0,5]}` 数组写法、声明 1 行但 PNG 实际 9 行。PetSprite 回退 7 行布局 → idle 帧数为数组 → 非法动画名（idle 静止）；点击切 interact → 按错误行号跳帧 → 闪烁。
- 修复：`PetSprite.tsx` 新增 `normalizeSheet`——以 PNG 真实几何为准（行数定布局：9 行 Codex / 7 行标准），声明仅在实际行数相符时采信；数组写法取帧数；逐帧 keyframes 覆盖 1..12；条带宽度用真实列数。
- 真机验证：豆包 idle 恢复动画、点击正常播放 jumping 行、不再闪烁（用户确认 + 像素 diff 验证动画在播放）。
- 影响面：所有工坊/远程素材（AppData 26 份 meta 审计过，9 行/7 行/数组写法三种变体均兼容）。

## 13. 多屏支持：方案 D「一键换屏」（2026-08-05 晚，Mac 双屏实测通过）

单窗多宠把智子限定在主屏（旧版小窗可拖到任意屏，属能力回退）。调研成熟项目后确认：**不做横跨多屏的大窗口**（WebView2 横跨混 DPI 显示器有已知 bug：WebView2Feedback#5253、wails#5677；CrossOver 等成熟 overlay 也用整窗跳屏）。实现为「窗口永远完整待在一块屏内，一键整体搬到下一块屏」：

- 入口：设置页「🖥️ 智子在哪块屏幕」行 + 主智子操作条 🖥️ 图标，均只在检测到 >1 块屏时出现；2 屏互换、3+ 屏循环；偏好存 `csp_pet_monitor`，重启恢复。
- **macOS 坐标坑（实测标定）**：① tao `set_outer_position` 用窗口当前 backingScale 换算，跨屏异 scale 直接设物理坐标偏移一半 → `applyMonitor` 两阶段落定（LogicalPosition 近似 → 350ms → PhysicalPosition 精确校正）；② tao `cursorPosition` 全屏统一返回「逻辑 × 主屏 scale」→ 命中测试 macOS 侧统一到逻辑点比较，Windows 侧维持物理像素（PMv2）。
- Mac 双屏实测：搬到副屏精确落位、副屏点击冒泡/命中正确、搬回主屏正常。
- Windows 真机待验：混 DPI 双屏下换屏 + 命中（代码路径与单屏一致，风险低）。

## 14. Windows 桌宠「打开→关闭→再打开 = 未响应幽灵窗」（2026-08-07 修复）

- 现象（Windows 用户反馈）：显示桌宠 → 隐藏 → 再显示，宠物窗口标题变「CSP Pet（未响应）」（Windows 幽灵窗口机制：窗口挂死时系统画的替身）。
- 根因：第 1 轮修复引入的「隐藏时暂停 WebView2 渲染」(`w.as_ref().hide()` = controller `SetIsVisible(false)`)——部分机器/运行时上重新激活 `SetIsVisible(true)` 静默失败，窗口从此冻结成幽灵。
- 修复（`lib.rs` `hide_pet_os_window`)：Windows 上隐藏只做 OS 层 `hide()`，不再手动暂停 WebView2 合成；OS 隐藏后 Chromium 页面可见性自动变 hidden，渲染自然暂停（原来担心的后台 60fps 重绘由浏览器自身节流覆盖）。macOS 行为不变。
- 另：v1.7.30 的 `--disable-gpu-compositing`（软件合成）也可能参与该类挂死，本轮重构已移除。
