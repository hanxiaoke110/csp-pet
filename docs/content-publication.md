# 公共内容校验与局部发布

统一只读校验：`npm run content:validate`。可用 `npm run content:validate -- --targets=collector,wardrobe,accessories,learning,questions` 选择目录；发布工具入口为 `npm run content:release -- <命令及参数>`。退出码非零即禁止发布。输出包含客户端原始 schema 校验、最低渲染版本、课程课号/链接/版本、题库原有完整性与证据发布门槛、全部引用本地图片的实际格式、字节数和 SHA-256。外部 HTTPS 题图单独列在 `externalReferences`；没有联网核验外站存活或图片内容，不把它们描述为已核验本地资源。

`.github/workflows/content-validation.yml` 在内容与校验器相关 PR、master push 或手动触发时执行统一门槛及发布保护测试，仅申请 `contents: read`；现有 release preflight 同样调用此门槛。两个流程均不因此新增部署行为。

不运行全量资源重建。尤其不能用旧 `.cloudflare-static` 覆盖线上已有 67 张典藏卡（版本 9）、18 件配饰（版本 2，最低渲染 2）、100 个课程槽位等更新。2026-11-01 已验证的 `/tmp/csp-collector-finale-publish-20261101` 只能作为候选基线；使用前仍需重新核对完整线上快照和 revision。

## 本地可复核流程

`scripts/content-release.mjs` 提供 `inventory`、`prepare`、`apply`、`rollback`。以下命令只读本地目录或创建审阅文件；不发布：

```sh
node scripts/content-release.mjs inventory --baseline /absolute/verified-live-stage --revision LIVE_REVISION --out /tmp/expected-live.json
node scripts/content-release.mjs prepare --baseline /absolute/verified-live-stage --revision LIVE_REVISION --expected /tmp/expected-live.json --changes /absolute/collector-only-changes --targets collector --out /tmp/collector-release.json
node scripts/content-release.mjs apply --baseline /absolute/verified-live-stage --revision LIVE_REVISION --bundle /tmp/collector-release.json
```

`--changes` 中的路径相对于静态资源根目录。例如典藏卡只允许 `collector-cards/*`，学习目录只允许两个 `learning-catalog*.json` 文件。`wardrobe` 同时覆盖 v1/v2。新文件、替换文件必须显式放入该目录；不支持隐式删除。prepare 在临时目录合成“完整当前线上快照 + 指定变更”并重新校验，不从仓库其他过时目录重建。审阅包同时保存变更前目标字节、候选字节、完整线上资源 inventory、来源 revision 和校验结果；输出文件存在时拒绝覆盖。

## 可执行的 Cloudflare 发布适配器

仓库包含 `scripts/content-release/cloudflare-adapter.mjs`，复用本机 Wrangler OAuth 或现有 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`，无需新建凭据。固定 Wrangler 4.151.0。首次使用指定**完整已验证快照及其当时的 deployment ID:version ID**；不能拿过时目录套用刚查询到的新 revision。否则遗漏线上新资源的目录仍可能破坏内容。

```sh
export CSP_CONTENT_BASELINE_STAGE=/tmp/csp-collector-finale-publish-20261101
export CSP_CONTENT_BASELINE_REVISION=VERIFIED_DEPLOYMENT_ID:VERIFIED_VERSION_ID
# 可选：所有同一 Worker 发布者共享这两个目录；默认在当前用户 ~/.codex 下
export CSP_CONTENT_STATE_DIR=/absolute/shared/csp-card-publication
export CSP_CONTENT_LOCK_DIR=/absolute/shared/csp-card-publication.lock

node scripts/content-release.mjs inventory --adapter ./scripts/content-release/cloudflare-adapter.mjs --out /tmp/expected-live.json
node scripts/content-release.mjs prepare --adapter ./scripts/content-release/cloudflare-adapter.mjs --expected /tmp/expected-live.json --changes /absolute/collector-only-changes --targets collector --out /tmp/collector-release.json
node scripts/content-release.mjs apply --adapter ./scripts/content-release/cloudflare-adapter.mjs --bundle /tmp/collector-release.json
# 审阅后才显式部署
node scripts/content-release.mjs apply --adapter ./scripts/content-release/cloudflare-adapter.mjs --bundle /tmp/collector-release.json --deploy --out /tmp/publication-receipt.json
```

适配器读取实际 serving deployment，拒绝多版本流量拆分。revision 同时包含 deployment ID 与 version ID，因此手动回滚到相同版本也会被发现。初始完整目录绑定当时 revision；后续使用状态目录中成功激活版本的完整快照，revision 不匹配时必须重新保全线上资源，不能只修改旧目录标签。

具体发布顺序：获取共享 `mkdir` 锁；重新核对完整基线 revision、全部本地清单资源的线上哈希及 `_headers` / `_redirects`；生成临时完整目录，使用 `wrangler versions upload` 上传未激活候选；再次检查 serving deployment；使用 `versions deploy 候选@100% --yes` 激活；保存新快照与指针，立即保存 receipt，再核验全部线上文件及配置。命令依据 [Cloudflare Wrangler 官方文档](https://developers.cloudflare.com/workers/wrangler/commands/workers/)。不会调用全量源目录重建，也不会执行 Worker 历史版本整体回滚。

**锁的范围是合作发布者，不是 Cloudflare 服务端 CAS。** 同一机器、同一共享锁路径的进程相互排斥，已持有的锁不会自动抢占；`owner.json` 记录 PID/主机/时间，需确认旧进程已退出后才能人工移除遗留锁。多机器/GitHub runner 的本地文件锁互不相通；若在 GitHub Actions 中运行，应让所有 `csp-card-assets` 写入工作流使用同一个 `concurrency.group: csp-card-assets-publication` 且 `cancel-in-progress: false`，并禁止并发的本机/控制台直接发布。工坊使用不同 Worker 和不同 concurrency group。

Cloudflare 当前命令没有提供这里可用的 revision 条件激活参数，控制台或绕开锁的其他发布者仍可能在最后检查与激活之间竞争。工具会拒绝已发现的漂移并在发布后核验，但无法消除这个窗口；不要把合作锁宣传成平台原子比较交换。完整资源路径集合来自已验证的保全目录，HTTP 校验不能枚举未知路径，因此快照必须绑定保全时的 revision。已保存状态与线上 revision 不一致时停止发布，重新保全。

适配器输出 receipt `verified: false` 表示切换已返回但核验未完成，应先检查线上，不能宣称发布成功。激活命令响应丢失时会查询当前 serving version，已成功则继续保存 receipt，否则报错；不盲目重放激活。上传后发现漂移时不激活候选。状态目录保留完整历史快照，按需人工归档，不能在回滚审阅前清除。

也支持自定义适配器：`snapshot(worker)` 返回 `{revision, files}`；原子实现可提供 `compareAndSwap(plan)`；合作锁实现需同时提供 `withLock(callback)` 与 `guardedPublish(plan)`。部署必须显式 `--deploy`，没有符合接口的发布 runner 时拒绝执行。

## 仅目标回滚

```sh
node scripts/content-release.mjs rollback --adapter ./scripts/content-release/cloudflare-adapter.mjs --bundle /tmp/collector-release.json --receipt /tmp/publication-receipt.json
# 审阅 dry run 后，需要真正执行才加 --deploy --out /tmp/rollback-receipt.json
```

回滚从当前完整快照出发，仅还原目标文件和移除本次新增目标资源。要求当前 revision 恰好等于 receipt revision，并且目标哈希仍等于已发布候选；任何其他发布都令旧回滚失效，应重新准备针对当前线上状态的变更。不会回滚整个 Worker 历史版本，不会撤销之后上线的其他目录。

工坊 `csp-workshop-assets` 的 `/workshop/*` 不在此工具权限范围，继续使用独立工坊发布机制。适配器不能把两个 Worker 混在同一快照。

验证：`npx vitest run scripts/content-release.test.mjs scripts/content-release/cloudflare-adapter.test.mjs`，网络与部署 runner 均注入内存适配器，测试不执行外部写入。
