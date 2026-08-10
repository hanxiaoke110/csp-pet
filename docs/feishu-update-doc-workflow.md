# 飞书「智子客户端更新」文档 — 更新流程（2026-08-10）

## 1. 文档信息

- 文档地址：https://scncdgmg7m6w.feishu.cn/docx/VJmgd3RB0oOzPfxV9MxcKzzyn1b
- 文档 token：`VJmgd3RB0oOzPfxV9MxcKzzyn1b`
- 权限：已设为「获得链接的人可阅读」（含组织外），可直接分享给学生/家长。
- 文档内容：最新版本 + 更新说明 + 使用视频（内嵌播放）+ 安装包附件（Windows/Mac ARM/Mac Intel）+ Windows/macOS 下载说明（含两张截图、xattr 命令）+ 孵化提醒。

## 2. 更新方式（二选一）

### 方式 A：CI 自动更新（推荐，发版后自动执行）

发布流程已接入 `release.yml` 的 `update-feishu-doc` 任务：

- 触发条件：打 `v*` tag 触发发版，release 任务成功后自动运行；
- 行为：安装 lark-cli → 用 bot 身份配置 → 运行 `node scripts/update-feishu-release-doc.mjs --as bot`；
- 前置条件：GitHub 仓库需配置两个 Secrets：
  - `LARK_APP_ID`（飞书自建应用 App ID，如 `cli_aac71457e9f8dbd0`）
  - `LARK_APP_SECRET`（对应 App Secret）
- 应用权限：自建应用需开通文档读写权限（docx:document:readonly / write_only 等），并把「智子客户端更新」文档授权给该应用（文档已由该应用创建，无需额外授权）；
- 未配置 Secrets 时该任务自动跳过（`if` 守卫），不影响发版。

### 方式 B：手动更新（一条命令）

在项目根目录执行：

```bash
node scripts/update-feishu-release-doc.mjs
```

默认用 bot 身份；想用自己身份跑：`LARK_CLI_AS=user node scripts/update-feishu-release-doc.mjs`。
加 `--dry-run` 只预览不写入。

## 3. 脚本行为（update-feishu-release-doc.mjs）

只做**精准更新**，不会覆盖文档里的手工内容（视频、图片、提醒、安装包附件）：

1. 从 Gitee 找**带安装包的最新 release**（自动跳过只有源码包的版本，如 v1.7.31）；
2. 从公告接口取该版本更新说明（标题以 `vX.Y.Z` 开头的最新公告）；
3. 用 `block_replace` 更新 6 处：
   - 「📦 最新版本：vX.Y.Z」
   - 「更新日期：…」
   - 「本次更新：…」
   - Windows 下载链接（稳定直链 `https://api.cspstudy.top/dl/win`）
   - Mac M 芯片下载链接（`/dl/mac-arm`）
   - Mac Intel 下载链接（`/dl/mac-intel`）
4. 下载链接是**稳定直链**，自动指向最新安装包，发版后无需改动。

## 4. 发版后要手动确认的内容

自动更新完成后，打开文档检查：

- [ ] 版本号、日期、更新说明是否与本次发布一致；
- [ ] 三个「点此直接下载」链接是否可用（`api.cspstudy.top/dl/win|mac-arm|mac-intel`）；
- [ ] 使用视频、两张截图、三个安装包附件是否还在。

> 注意：安装包附件（飞书云空间里的 exe/dmg）不会自动更新——每次发版如果想让文档里也带**新安装包附件**，需要手动把新安装包上传到文档对应位置（用 `lark-cli docs +media-insert`，或让 AI 代传）。稳定直链 `/dl/*` 会自动指向最新版，可以只靠直链。

### 同步安装包附件（`--sync-attachments`）

脚本支持一步完成「删旧附件 → 传新附件」：

```bash
LARK_CLI_AS=user node scripts/update-feishu-release-doc.mjs --sync-attachments
```

- 会自动删除文档里旧的 `CSP_*.exe / CSP_*.dmg` 附件块（不动视频和图片），再上传最新版三个安装包附件；
- 安装包从 Gitee 下载到 `.tmp/doc-assets/`（已存在则跳过下载）；
- **必须用 user 身份**：上传文件到飞书需要用户的 `drive:file:upload` 权限，bot 应用默认没有该权限（实测 bot 上传报 invalid token）；
- CI 自动更新默认只同步文字；如需 CI 也同步附件，需先在飞书开发者后台给应用开通「上传文件」权限，并把 CI 命令改为 `node scripts/update-feishu-release-doc.mjs --as bot --sync-attachments`。

## 5. 常见问题

- Chrome 提示「危险网站」：不要再使用 Gitee 附件直链（`gitee.com/.../releases/download/...` 会 302 到 `foruda.gitee.com`，被安全浏览标记）。文档里的链接已全部换成 `api.cspstudy.top/dl/*` 或飞书附件；
- 下载后 Windows 提示「未知发布者」：这是未签名 exe 的正常提示，点「更多信息 → 仍要运行」即可，与「危险网站」无关；
- macOS 打不开：终端执行 `xattr -cr "/Applications/CSP 学习助手.app"`（文档里已写明）；
- CI 任务被跳过：检查 GitHub Secrets `LARK_APP_ID` / `LARK_APP_SECRET` 是否已配置。

## 6. 相关文件

- 脚本：`scripts/update-feishu-release-doc.mjs`
- CI：`.github/workflows/release.yml`（`update-feishu-doc` 任务）
- Worker 稳定直链：`cf-workers/api.js`（`/dl/win|mac-arm|mac-intel`）
- 本流程记录：`docs/feishu-update-doc-workflow.md`
