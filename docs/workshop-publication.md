# 工坊自动上架

教师成功创建、更新或删除工坊角色元数据后，API Worker 在 `ctx.waitUntil` 中原子递增 D1 发布事件版本。原始图片上传 `/api/workshop/upload` 不触发；未登录、无效请求、数据库写入失败或没有修改到自己的角色时也不触发。

GitHub Actions 每 5 分钟只轻量读取一个数字事件版本，与线上 `/workshop/publication-event.json` 中已确认的版本比较；没有变化时跳过全量目录扫描、依赖安装、构建和部署。发现新版本才检查真实目录并发布。每小时 UTC 第 7 分钟保留权威全量目录比对，每天 UTC 19:17 保留强制图片刷新，覆盖后台事件写入失败、旧客户端和同名图片覆盖等情况。平台调度可能延迟，不承诺固定分钟内上线。

无需用户创建令牌、登录新服务或配置凭据。任务复用已有 GitHub Actions 和 `CLOUDFLARE_API_TOKEN` 发布凭据；API Worker 不需要 GitHub token，也不向 GitHub 发请求。教师端「我的精灵」仍通过真实静态目录比较显示发布状态；事件数字和 marker 只是调度提示，不是上架成功依据。教师端「检查」只核对现有目录，不会把排队当作上传失败。

- 发布工作流：`.github/workflows/workshop-publication.yml`。
- 单独 Worker：`csp-workshop-assets`，仅接管 `cards.cspstudy.top/workshop/*`。
- 不重发桌面安装包，不覆盖典藏卡、衣橱、装备或课堂资料目录。
- 新教师端上传使用唯一文件名，避免同名角色互相覆盖图片。
- 每天 UTC 19:17 强制重新读取图片，兜底旧客户端同名文件覆盖；旧端纯图片变化最迟等待该审计，不属于普通元数据变更检测。
- 发布前验证所有图片、动画尺寸、完整分页；异常时保留上次成功线上目录。
- 少于原目录一半且减少超过 10 个角色会阻止发布；确认批量删除属实后，手动运行时才勾选 `allow_large_delete`。
- 手动运行 `refresh_images` 可立即重新读取所有源图片；不需要更改桌面版本。
- 发布凭据为 GitHub Actions 加密 secret `CLOUDFLARE_API_TOKEN`，不在仓库、桌面包或教师网页中。
- 教师网站的正式 Pages 分支为 `main`（不是 GitHub 的 `master`）；部署时使用 `wrangler pages deploy teacher-app --project-name teacher-csp --branch main`，并回读正式域名脚本的 JavaScript Content-Type。其他分支仅为预览，不会更新正式域名。
- GitHub 定时任务存在平台排队和长期无活动停用限制，需保留工作流失败通知并定期检查 Actions。上线验证使用手动任务，不向生产工坊添加测试角色。

## 事件版本与恢复

D1 复用 `meta` 表中的独立键 `workshop_publication_revision`，无需新表，只存递增数字。成功元数据写入后追加一次后台事件写入，SQL 原子递增避免并发上传丢失版本。事件记录失败不会撤销已成功保存的角色，每小时权威目录检查负责兜底。

公开只读接口 `GET /api/workshop/publication-revision` 返回原始 JSON 数字，例如 `123`，设置 `Cache-Control: no-store`；没有事件时为 `0`。接口不返回老师、学生、图片或凭据信息，也没有手动触发工作流的写入口。读取异常时返回错误，不把异常当作「没有新事件」。

构建只确认开始构建前读取的事件版本，并将其写入完整快照中的 `/workshop/publication-event.json`。即使该版本的编辑最终撤销、真实角色目录没有变化，也发布包含 marker 的完整快照，避免下轮不断重复检查同一个事件。发布期间的新事件不被更大的「构建后版本」覆盖，下一轮仍能检测到；发布失败时线上 marker 保持旧值，后续自动重试。

本地隔离测试使用内存 SQLite 和伪造网络响应，不读取真实凭据、不向线上工坊添加测试角色。覆盖原子并发递增、成功创建/更新/删除及表单上传、原图上传不触发、未授权/无效/写入失败不触发、只返回公开数字、版本相同跳过、marker 确认和发布期间的新事件。

本地校验：

```sh
npx vitest run cf-workers/workshop-publish-events.test.mjs scripts/workshop-publication.test.mjs scripts/workshop-publication-view.test.mjs
node scripts/build-workshop-static.mjs --check
node scripts/build-workshop-static.mjs --build
node scripts/build-workshop-static.mjs --verify
```

学生已安装版本读取原静态地址即可获得新目录；已打开的工坊需要离开后重新进入或重新打开应用。已购买角色和本地存档不因目录更新而删除。
