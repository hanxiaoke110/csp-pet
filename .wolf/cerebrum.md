# cerebrum.md

## Preferences
- 修改代码前先分析根因，确认后再改
- 大幅度改动前先和用户确认方案
- macOS 未签名 DMG 需 `xattr -cr` 后才能打开
- 发版流程：改版本号 → push + tag → 同时推 Gitee → CI 构建 → 手动上传 Gitee

## Learnings
- Tauri v2 插件必须三层配齐：Capability 权限 + Scope 范围 + Rust 端 `.plugin()` 注册
- `appDataDir()` 不保证尾部有 `/`，路径拼接必须显式加 `/` 或用 `join()`
- Gitee 默认分支是 `master`，不是 `main`
- 教练端更新后必须在 `chrome://extensions/` 彻底移除旧版再加载新版

## Do-Not-Repeat
- **绝不**: Promise 链只用 `.then()` 不加 `.catch()` — 错误会被静默吞掉
- **绝不**: 在 Tauri WebView 中用浏览器 `fetch` 访问外部 URL — 用 `@tauri-apps/plugin-http`
- **绝不**: 在 Tauri v2 中配了 fs plugin 但不加 `fs:scope` — 默认 scope 为空
- **绝不**: 在 Cargo.toml 加了插件依赖但不在 lib.rs 注册 `.plugin()`
- **绝不**: 用 `convertFileSrc` + `fetch()` 加载本地文件 — 用 fs plugin 的 `readFile`/`readTextFile` + Blob URL
- **绝不**: 路径字符串直接拼接而不加分隔符 — `${base}${subdir}` → 永远是 `${base}/${subdir}`
