# cerebrum.md

## Preferences
- 修改代码前先分析根因，确认后再改
- 大幅度改动前先和用户确认方案
- macOS 未签名 DMG 需 `xattr -cr` 后才能打开
- 发版流程：改版本号 → push + tag → 同时推 Gitee → CI 构建 → 手动上传 Gitee
- 独立查询（跨文件搜索、GitHub 查资料、多文件探索）优先用 Agent subagent，不占主 context

## Learnings
- Tauri v2 插件必须三层配齐：Capability 权限 + Scope 范围 + Rust 端 `.plugin()` 注册
- `appDataDir()` 不保证尾部有 `/`，路径拼接必须显式加 `/` 或用 `join()`
- Gitee 默认分支是 `master`，不是 `main`
- 教练端更新后必须在 `chrome://extensions/` 彻底移除旧版再加载新版
- Tauri v2 签名密钥对必须配套：`tauri.conf.json` 的 pubkey 和签名的私钥必须是一对
- Tauri 签名命令：`--private-key` 吃字符串，`--private-key-path` 吃文件路径，别混
- 密钥生成后立即保存到 `~/.tauri/`，并更新 GitHub Secrets
- Gitee git remote 可以带 token 避免认证问题：`https://user:token@gitee.com/owner/repo.git`
- Tauri minisign 签名内嵌了文件名，上传时不能改名，否则验签失败
- Gitee Release 下载经过 2 次 302 跳转，Tauri macOS updater 无法正确处理（下载卡死），Windows 可以用
- `.app.tar.gz` 比 `.dmg` 更适合 Tauri updater（gzip 原生支持）
- 版本号用 `@tauri-apps/api/app` 的 `getVersion()`，不要用不存在的 `/version` 接口
- Gitee 仓库附件总配额 1GB，不发版时清理旧 Release

## Do-Not-Repeat
- **绝不**: Promise 链只用 `.then()` 不加 `.catch()` — 错误会被静默吞掉
- **绝不**: 在 Tauri WebView 中用浏览器 `fetch` 访问外部 URL — 用 `@tauri-apps/plugin-http`
- **绝不**: 在 Tauri v2 中配了 fs plugin 但不加 `fs:scope` — 默认 scope 为空
- **绝不**: 在 Cargo.toml 加了插件依赖但不在 lib.rs 注册 `.plugin()`
- **绝不**: 用 `convertFileSrc` + `fetch()` 加载本地文件 — 用 fs plugin 的 `readFile`/`readTextFile` + Blob URL
- **绝不**: 路径字符串直接拼接而不加分隔符 — `${base}${subdir}` → 永远是 `${base}/${subdir}`
- **绝不**: `cargo tauri signer sign --private-key` 传文件路径 — 该 flag 吃字符串不读文件，用 `--private-key "$PRIVKEY"` 或 `--private-key-path`
- **绝不**: Tauri 签名后的文件改名 — 签名内嵌了原始文件名，改名就验签失败
- **绝不**: macOS 更新用 Gitee Release 下载 URL — 多级 302 重定向 Tauri updater 处理不了
- **绝不**: 用 `fetch('/version')` 取版本号 — 该接口不存在，用 `getVersion()`
