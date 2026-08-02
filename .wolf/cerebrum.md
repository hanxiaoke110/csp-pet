# cerebrum.md

## 发版流程（v1.7.17 最终版）
1. **改版本号**：`package.json` + `src-tauri/tauri.conf.json` + `src/App.tsx` 三个文件同步更新
2. **读 cerebrum.md**：避免踩已知的坑
3. **commit + tag**：`git tag -a vX.Y.Z -m "..."` 
4. **push**：同时推 GitHub（触发 CI）+ Gitee（备用）
5. **等 CI**：3 个平台构建 → release job 签名 + 上传 Gitee + 更新 update.json
6. **检查 Gitee Release**：确认 3 个安装包都在（`CSP_${ver}_aarch64.dmg` / `_x64.dmg` / `_x64-setup.exe`）
7. **补传缺失文件**：Gitee 大文件并发上传偶尔超时失败，从 GitHub Release 下载后手动 `curl -F` 补传
8. **确认 update.json**：版本号正确 + 全部 Gitee URL（raw 有 CDN 缓存，API 验证）
9. **清理旧 Release**：保留最近 2 个版本，释放 Gitee 1GB 配额
10. **更新 .wolf/**：memory.md + cerebrum.md 记录教训

## Preferences
- 修改代码前先分析根因，确认后再改
- 大幅度改动前先和用户确认方案
- macOS 未签名 DMG 需 `xattr -cr` 后才能打开
- 独立查询（跨文件搜索、GitHub 查资料、多文件探索）优先用 Agent subagent，不占主 context
- **全部更新走 Gitee**：macOS/Windows 统一用 Gitee Release URL，不用 GitHub
- **productName = "CSP 学习助手"**：App 显示中文名，CI 用 `rename_eng()` 把安装包文件名转英文后再签名
- **安装包命名**：`CSP_${version}_aarch64.dmg` / `CSP_${version}_x64.dmg` / `CSP_${version}_x64-setup.exe`

## Learnings
- 当需求本质是“游戏化功能”而非普通 Web 页面时，应在早期主动提出引擎/框架选型（如 Phaser.js、Godot、Canvas 等），不要默认只用 React DOM 实现
- 统一题库选项格式：选项存储时应包含 "A. " 前缀，渲染代码通过 `/^[A-D][.、]\s*/` 去除前缀并单独显示字母标签
- 含 C++ 代码的选择题应将代码放在 `code` 字段（渲染为 `<pre><code>`），选项使用简短标签如 "A. 程序A" / "B. 程序B"
- Tauri v2 插件必须三层配齐：Capability 权限 + Scope 范围 + Rust 端 `.plugin()` 注册
- `appDataDir()` 不保证尾部有 `/`，路径拼接必须显式加 `/` 或用 `join()`
- Gitee 默认分支是 `master`，不是 `main`
- 教练端更新后必须在 `chrome://extensions/` 彻底移除旧版再加载新版
- Tauri v2 签名密钥对必须配套：`tauri.conf.json` 的 pubkey 和签名的私钥必须是一对
- Tauri 签名命令：`--private-key` 吃字符串，`--private-key-path` 吃文件路径，别混
- 密钥生成后立即保存到 `~/.tauri/`，并更新 GitHub Secrets
- Gitee git remote 可以带 token 避免认证问题：`https://user:token@gitee.com/owner/repo.git`
- Tauri minisign 签名内嵌了文件名，上传时不能改名，否则验签失败
- `.app.tar.gz` 比 `.dmg` 更适合 Tauri updater（gzip 原生支持）
- 版本号用 `@tauri-apps/api/app` 的 `getVersion()`，不要用不存在的 `/version` 接口
- Gitee 仓库附件总配额 1GB，不发版时清理旧 Release
- 新增精灵需要同时做：spritesheet → Gitee + preview → public/ + pet.ts 配置，缺一不可
- **Gitee 安装包命名规则**：`CSP_${version}_${arch}.dmg` / `CSP_${version}_x64-setup.exe`。productName 用中文（`CSP 学习助手`），CI 构建后重命名为英文再签名。
- **Gitee contents API 鉴权**：`/contents/update.json` 更新必须用 `?access_token=` query 参数；`Authorization: token` header 在 attach_files 上传可用，但在 contents 接口会报 40001「登录失效」
- **dialog ACL 权限拆分**：`dialog:default` 只含 allow-message/save/open，`window.confirm`（被插件注入脚本转发为 `plugin:dialog|confirm`）需要显式 `dialog:allow-confirm`；客户端避免使用原生 confirm/alert，统一应用内弹窗
- **Gitee 大文件下载加速**：GitHub 直连 ~30KB/s、ghfast.top ~50KB/s 时，用本机代理 `curl -x http://127.0.0.1:7897 -C -` 可达 ~2.3MB/s
- **CI `npm ci` 只装 `csp-desktop-pet/package.json` 的依赖**，如果根目录 `package.json` 有额外依赖，必须同步到子项目
- **CI `sign_file` 用 `grep '^dW50' | head -1` 提取纯签名**，不再读 `.sig` 文件（含说明文字）
- **CI 构建文件名处理**：productName 保留中文 → Tauri 输出中文名 → CI rename_eng() 替换为英文 → 再签名 → 文件名/签名/URL 全部对齐
- **GitHub Token 需 `workflow` scope** 才能 push `.github/workflows/` 下的文件
- **update.json 统一走 Gitee**，所有平台都可用 Gitee Release URL
- **发版后清理旧 Gitee Release**，保留最近 2 个版本，释放 1GB 配额

## Do-Not-Repeat
- **绝不**: 将 C++ 代码塞进 quiz options 数组 — 应放在 `code` 字段，选项用简短标签
- **绝不**: 选项字段包含来自相邻题目的渗入文本 — 数据导入后应校验选项完整性
- **绝不**: Promise 链只用 `.then()` 不加 `.catch()` — 错误会被静默吞掉
- **绝不**: 在 Tauri WebView 中用浏览器 `fetch` 访问外部 URL — 用 `@tauri-apps/plugin-http`
- **绝不**: 在 Tauri v2 中配了 fs plugin 但不加 `fs:scope` — 默认 scope 为空
- **绝不**: 在 Cargo.toml 加了插件依赖但不在 lib.rs 注册 `.plugin()`
- **绝不**: 用 `convertFileSrc` + `fetch()` 加载本地文件 — 用 fs plugin 的 `readFile`/`readTextFile` + Blob URL
- **绝不**: 路径字符串直接拼接而不加分隔符 — `${base}${subdir}` → 永远是 `${base}/${subdir}`
- **绝不**: `cargo tauri signer sign --private-key` 传文件路径 — 该 flag 吃字符串不读文件，用 `--private-key "$PRIVKEY"` 或 `--private-key-path`
- **绝不**: Tauri 签名后的文件改名 — 签名内嵌了原始文件名，改名就验签失败
- **绝不**: 用 `fetch('/version')` 取版本号 — 该接口不存在，用 `getVersion()`
- **绝不**: 新增精灵只上传 spritesheet 不生成 preview — 商城和智子都会白屏
- **绝不**: preview 用 48×52 — 原始素材预览都是 200×200，尺寸不一样就是糊的
- **绝不**: 用 sips 做预览图 — `-r 90` 会旋转、`-c` 参数易出错。统一用 Python PIL：`crop(0,0,192,208) → resize(200,217) → center crop(200×200)`

- **绝不**: 用 `cargo install tauri-cli --version "^2"` 这种浮动版本！`^2` 可能拉到有编译错误的版本（如 2.11.2）。CI 必须锁死具体版本，如 `--version "=2.10.4"`，升级时手动验证后改版本号。
- `window.set_minimizable/set_maximizable(false)` 可在 Windows 上禁用系统菜单，配合 `decorations:false`
- PetPanel 拆组件原则：用 zustand hooks 直接在子组件取数据，减少 props 传递
- 组件拆分不碰数据层，对现有用户数据零影响

- **绝不**: 用 PlayerState.exp 直接当 totalExp 传给 getLevelFromExp()——exp 是当前等级内经验，getLevelFromExp 期望从头累计。LV2+ 不先重建总累积就会掉级。
- **绝不**: 在版本发布说明中出现"防篡改"等字眼——统一写"修复部分已知问题"
- **绝不**: 硬编码任何密码/密钥在前端代码——统一用教练端生成＋学生端校验
- **绝不**: Gitee 上传安装包时用中文原始文件名——必须用 `filename=csp-v${short}-${arch}.${ext}` 格式，否则 UpdateChecker 的下载链接 404
- **绝不**: 发版只改 `package.json` 不改 `tauri.conf.json`——版本号显示会错，且 CI 构建的文件名也会错
- **绝不**: 在非 `csp-desktop-pet` 的 `package.json` 加依赖——CI 的 `npm ci` 只看子项目自己的 `package.json`
- **绝不**: Worker 端点直接信任客户端写入金币、等级、经验、段位等经济/排名敏感字段——应服务端计算或走专用上报端点
- **绝不**: 盲目给 Worker 加限流用 KV——D1 建个 rate_limits 表更轻量，带 reset_at 滑动窗口
- **绝不**: 用宠物系统等级（喂养升级）作为智子试炼场的战斗属性等级——应使用潜龙闭关的 playerLevel，两者是完全独立的升级体系。宠物等级通常 1-3 级而副本敌人 1-10 级，混用导致后期指数碾压。
- **绝不**: 敌方伤害跳过玩家防御——resolveEnemyIntent 必须像 calculateDamage 一样先减 defender.defense 再乘元素克制，否则后期高攻敌人一击秒杀。
- **绝不**: 发版操作前不读 .wolf/cerebrum.md——已有教训：签名格式、Gitee 配额、macOS 重定向等问题都有记录，不读就踩坑。

## 2026-06-02/03 许愿墙 + 班级系统新增

### Preferences
- 兑换码日期用**本地时间**（非 UTC），与 Chrome 插件保持一致
- 班级码用纯随机字符串（不要编码 teacher_id），服务端查表验证
- 许愿墙风格与主应用统一（暖橙白）
- 教师端和学生端分离：学生只管绑定，教师管理所有操作

### Learnings
- ensureSchema 必须用 `CREATE TABLE IF NOT EXISTS` 覆盖核心表（不仅是 ALTER），否则新 D1 部署崩溃
- 投票防竞态：INSERT-try-catch + UNIQUE INDEX 比 check-then-insert 可靠
- 教师/Admin 两套 token 体系需要每个端点都处理两种认证
- Cloudflare Pages 部署后旧 URL 可能缓存，需用新部署 URL 验证
- `prompt()`/`confirm()` 在 Tauri WebView 中不可靠，需替换为自定义弹窗
- unpkg.com 在国内加载慢，用 cdnjs.cloudflare.com 替代
- 周计算算法 `(jan1.getDay() + 6) % 7` 正确，`jan1.getDay() + 1` 有偏差

### Do-Not-Repeat
- **绝不**: 在新 Worker 端点的 INSERT 中使用未定义的变量（如 `realName` vs `real_name`）
- **绝不**: 在 `ensureSchema` 中只做 ALTER TABLE 不做 CREATE TABLE
- **绝不**: 许愿票的先加后扣——必须先扣钱再给票
- **绝不**: 忘记给 votes 表建 UNIQUE INDEX（INSERT-try-catch 依赖它）
- **绝不**: API 的 `resp.json()` 不检查 `resp.ok`——非 2xx 响应会导致 JSON 解析抛异常
- **绝不**: Promise 链只用 `.then()` 不加 `.catch()` —— 错误会被静默吞掉

## 2026-07-10 飞书集成新增

### Learnings
- Claude Code 安全分类器会拦截任何包含飞书 App ID 和 App Secret 的 bash 命令（归类为 "Credential Materialization" / "Credential Leakage"），即使在环境变量或 .env 文件中也不行
- lark-cli（`~/.npm-global/bin/lark-cli`）是唯一安全的飞书文档操作方式——它以用户身份运行，不需要在命令中暴露凭证
- lark-cli 命令使用 `+` 前缀：`docs +create`、`docs +fetch`、`docs +update`
- lark-cli 的 `--content "@file.md"` 必须使用当前工作目录的相对路径，不支持绝对路径
- 飞书 Docx 块类型编号：text=2, heading1=3, heading2=4, ..., heading9=11, bullet=12, code=14, callout=16
- 文本颜色只支持 1-7（8+ 触发 "field validation failed"）
- divider 块类型不能通过 children API 创建，用文本分隔符替代
- lark-cli 文档创建的限流是 99991400，约 13 次 / 短时间窗口，需间隔 2.5s 以上
- 知识卡文档 URL 格式：`https://scncdgmg7m6w.feishu.cn/docx/<document_id>`
- 飞书云空间 domain 固定为 `scncdgmg7m6w.feishu.cn`

### Do-Not-Repeat
- **绝不**: 在 Claude Code 的 bash 命令中包含飞书 App ID 或 App Secret——会被安全分类器拦截。只用 lark-cli --as user
- **绝不**: 用飞书开放平台 API（curl + tenant_access_token）在 Claude Code 中操作文档——安全分类器会阻止。用 lark-cli 替代
- **绝不**: lark-cli docs +create 连续创建超过 13 个文档不加大于 2s 延迟——触发 99991400 限流
- **绝不**: 在飞书 Docx 中使用 text_color ≥ 8——会触发 "field validation failed"
- **绝不**: 尝试通过 children API 创建 divider 块——不支持，用文本分隔符替代

- **默认 OCR 引擎：PaddleOCR**（`source-match.mjs` 中 `USE_PADDLEOCR` 默认为 true）
  - 通过 `~/.claude/skills/paddleocr/ocr.sh` 调用，走独立 venv
  - PDF→图片用 PyMuPDF (`fitz`)，图片→文本用 PaddleOCR
  - 中文识别精度比 pdfjs-dist 高得多
  - 关闭方式：`USE_PADDLEOCR=false` 环境变量回退到 pdfjs-dist
- **PaddleOCR 提取速度**：每页约 5-10s（含 OCR 推理），整卷约 30-60s
- **source-match.mjs 中的 PaddleOCR 缓存**：同一 PDF 只 OCR 一次，结果缓存在 `pdfCache` Map 中

## 2026-07-23 — 全链路题库可靠性测试

### Preferences
- **每次发版前必须运行 `npm run test:question-bank`**，85 项检查全部通过才能发布
- 题库管道变更（改 channels / canonical / verification / pipeline 脚本）后必须重跑全链路测试
- 测试脚本 `scripts/question-bank/test-full-chain.mjs` 是题库可靠性的最终关卡

### Learnings
- 全链路测试覆盖 10 维度 85 项检查：Canonical 完整性(9) / Verification 一致性(9) / Channel 发布规则(17) / Manifest 哈希(18) / Exam Manifest 交叉引用(16) / 内容质量(6) / Release Gate(5) / 跨 Channel 一致性(2) / 源数据(3)
- 题库计算公式：canonical 1183 → channels(daily 215 + super 5 + exam 179 + dungeon 305) = 704 题实例，394 道去重题
- 隔离题分类：718 auto_probable (GESP) + 27 auto_verified 非目标 + 24 disputed + 20 broken
- 6 道 CSP choice 隔离题明细：2019-J c08 disputed, 2020-J c13 disputed, 2021-J c14 broken, 2023-J c08 disputed, 2024-J c12 auto_probable, 2021-S c02 auto_probable
- `test-full-chain.mjs` 是纯 Node.js 脚本，不依赖 vitest，直接 `node` 运行
- Manifest SHA-256 哈希校验确保每个快照文件与 manifest.json 完全一致
- 跨 channel 共享题目（305 道在多个 channel）数据一致性由 JSON 序列化比对验证
- 所有 166 道 recovery 题现在都有解析，0 道缺失

### Do-Not-Repeat
- **绝不**: 发版前不跑 `npm run test:question-bank`——已有教训：provenance 过滤误杀 14 题、verification contentHash 不同步
- **绝不**: 修改 channels.mjs 的 isPublishableCsp 后不重跑全链路测试——隔离/放行逻辑直接影响学生端可见题目
- **绝不**: 手动改 verification.json 的 contentHash 对齐后不跑全链路测试——需要确认所有 verdict 与 canonical 完全一致

## 2026-07-14 教学资料 + 生图方案新增

### Learnings
- 教学资料在 `/Users/hanliuliu/Desktop/学生成长计划/教学资料/`，不在项目目录内
- AI寓言教学法 71 篇（P1-P71）覆盖完整 CSP 课程，每篇含故事+揭秘映射表+一句话口诀
- 教案 71 份（DOCX + MD 双格式）与寓言一一对应
- CSP集训初赛补充物料：21 DOCX + 1 xlsx（21 张 1024×1536 知识卡片成品图）
- 讲义 68 份 PDF 是独立"领航营"课程体系，不与当前项目混用

### Do-Not-Repeat
- **绝不**: 在没看清全貌前直接跳到执行细节——用户说"评估下"时要先盘点再给方案
- **绝不**: 在关键设计决策上自行脑补——如"图上不写字"vs"完整知识卡片"，应先和用户确认
- **绝不**: 在 21 vs 71、Codex vs Seedream 之间反复横跳——先定范围，再推细节

## 2026-07-25 — 发版收尾：程序题补全 + 答案纠错 + 知识卡映射

### Preferences
- **CSP-S 默认不选**：提高级难度太大，学生主动勾选才加入练习池
- **知识卡图片托管飞书**：图片嵌入飞书文档，通过 `feishuCardUrl` 引用，不存本地
- **isPublishableCsp 新规则**：choice=secondary/local_source_copy + reading/fillBlank=auto_verified+secondary+有子题 + VERIFIED_PROGRAM_IDS
- **发版前必清理旧 hashed snapshot**：`question-bank-v2/` 下未被 manifest.json 引用的 hash 文件应清除

### Learnings
- canonical 中 1183 题全有 reading/fillBlank (每卷 20 题结构完整)，但 channels.mjs 的 isPublishableCsp 白名单只放 choice，导致 S 组 0 道程序题上架
- `question-knowledge-mapping.json` 的 `existingQuizKps` 字段是 canonical knowledgePoint→KP ID 的桥梁，自动映射时用它做关键词匹配
- CSP-J 2023 Q8 后缀表达式 canonical 答案 C 是错的，应为 A (搜索官方答案确认)
- CSP-J 2019 Q8 二叉树存储 canonical 答案 A(6) 是错的，应为 C(15) (搜索确认)
- gesp-2024-03-1-06 canonical 代码/选项与官方 PDF 完全不同——题面伪造，不是简单的答案错
- gesp-2024-09-2-04 for 循环等价的题 B 和 C 都正确——题本身有歧义
- 知识卡只有 21 个分类，GESP L1-2 大量基础题 (计算机硬件、C++语法) 没有对应卡片
- 166 道 `knowledgePoint: "待复核"` 的题全是 CSP 程序阅读/填空题，每题自带极细致的知识点名

### Do-Not-Repeat
- **绝不**: isPublishableCsp 只放 choice 不放 reading/fillBlank——CSP 试卷每卷有 3 阅读+2 填空，全被挡
- **绝不**: question-knowledge-mapping 覆盖不足就发版——44% 发布题无知识卡映射，学生点"知识卡"按钮看不到内容
- **绝不**: 信任 canonical 答案不需要外部验证——本轮发现 2 道答案错误 + 1 道题面伪造 + 1 道双正确答案
- **绝不**: Write 工具输出路径不显式 check——文件可能写到 workspace root 而不是 csp-desktop-pet/
- **绝不**: 发版前不跑全链路 `test-full-chain.mjs`——渠道变更后没测试的话 48 道程序题丢失不会被发现

### 测试班级码
- 测试班级码 `6WB74A1ZPP9E` 用于 ClassAccessGate 校验，发版时确认在白名单内

## 2026-07-23/24 — PaddleOCR + 5-Jury + 题库升级

### Preferences
- **OCR 默认 PaddleOCR**：`source-match.mjs` USE_PADDLEOCR 默认为 true，关闭需 `USE_PADDLEOCR=false`
- **5-陪审团标准**：3-role（2 solver + 1 critic）→ 加 2 solver → 5/5 全票 = auto_verified
- **发版前必跑**：`npm run test:question-bank` + release-gate 全部通过
- **Canonical 答案修正优先 OCR**：sim=1.0 的 OCR 官方答案比 canonical 更可信

### Learnings
- PaddleOCR 每页 ~20 秒，15 页 PDF 约 5 分钟（spawnSync 阻塞 event loop）
- ocr.sh 每图重载 PaddleOCR 模型（慢）；改为 Python 脚本单次加载 + 循环处理所有页（快 15%）
- GESP PDF 答案格式均为 `【答案】X`，但 `questionSegment` 的边界检测被 `10.0` 等代码中的数字误判
- `stableContentHash` Node.js vs Python 计算不一致 → 全部 node 端计算
- evidence contentHash 必须与 canonical 严格一致，否则 verify-canonical 静默丢弃
- 多人 jury 共识 > 正则匹配 OCR 答案（用户建议，执行验证有效）
- 5-jury 升级率 86%（第一轮），61%（补跑轮，这些题本身争议更大）

### Do-Not-Repeat
- **绝不**: 在 Python subprocess 中跑 verify-canonical 然后以为文件已保存——cwd 可能不对
- **绝不**: evidence contentHash 用不同语言/环境计算——只用 Node.js `stableContentHash`
- **绝不**: `questionSegment` 用 `\s\d+[.．、\s]` 做边界——会误匹配 `10.0` 等代码数字
- **绝不**: spawnSync timeout 设 300s——PaddleOCR 15 页 PDF 需要 ~350s，至少 600s
- **绝不**: source-catalog 条目设 `url: null` 但不改 `isOfficialUrl` 检查——需同步加 `!resolved.localPath`

### 修复的 Bug 记录
1. bash `true` vs Python `'True'` 大小写 → `int('--all')` 崩溃
2. grep `^\[0\.[0-9]+\]` 漏置信度 1.000 行
3. `questionSegment` 被 `10.0` 截断 → 答案丢失
4. `isOfficialUrl` 拒绝 url:null 的 localPath 条目 → 13 PDF 白费
5. contentHash Node.js/Python 不一致 → evidence 全部被 discard
6. verify-canonical cwd 错误 → 文件未保存

## 2026-07-26 — v1.7.17 发版流程迭代

### Preferences
- **全部走 Gitee**：macOS/Windows 更新 URL 统一用 Gitee，不再区分
- **productName 保留中文**：`CSP 学习助手`，App 显示名不变
- **CI 构建后重命名再签名**：`rename_eng()` 把中文替换为英文，签名嵌英文名，URL 用英文名
- **发版前必读 `.wolf/cerebrum.md`**：避免踩已知的坑
- **发版后清理 Gitee 旧 Release**：保留最近 2 个版本

### Learnings
- Windows git `core.autocrlf=true` 默认把 LF 转 CRLF → `question-bank-v2/*.json` hash 对不上 manifest → `Bundled hash mismatch` → 题库加载失败
- `.gitattributes` 加 `text eol=lf` 可覆盖 Windows 的 CRLF 自动转换
- productName 中文 → Tauri 输出中文文件名 → CI 上传 Gitee 成功但 URL 有中文编码 → 签名嵌中文名 vs URL 解码不一致
- 方案：CI 中 `mv "CSP 学习助手_*" "CSP_*"` 再签名，签名/文件名/URL 全部英文，App 显示名仍是中文
- Gitee Release API 并发上传大文件时可能部分失败（超时），需检查并补传
- GitHub PAT 需要 `workflow` scope 才能 push `.github/workflows/`
- `MAX_PET_LEVEL = 20`，满级称号「大乘(满级)」，不再升级

### Do-Not-Repeat
- **绝不**: 发版不给 `.gitattributes` 加 `text eol=lf` → Windows 构建 hash 必挂
- **绝不**: productName 用英文 → App 显示名会变，学生困惑
- **绝不**: 相信 CI 的 Gitee 上传一定全部成功 → 发版后必须检查 assets 数量
- **绝不**: 用没有 `workflow` scope 的 GitHub token push workflow 文件
