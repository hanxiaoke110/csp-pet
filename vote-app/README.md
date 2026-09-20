# 智子典藏卡人气投票站

公开地址规划：`https://vote.cspstudy.top`

## 本地预览

```bash
npm run vote:catalog
npm run vote:dev -- --port 4179
```

默认连接生产 API。联调本地 Worker 时使用：

```text
http://127.0.0.1:4179/?api=http://127.0.0.1:8787
```

## 更新候选目录

`npm run vote:catalog` 会分页读取线上工坊全部 active 智子，将缩略图压缩为 320×320 WebP，并生成 `catalog.json`。候选图片作为 Pages 静态资源发布，浏览页面不会逐张消耗 Worker 请求额度。

## 发布

1. 发布 `cf-workers/api.js`，首次请求会自动执行 D1 v11 迁移。
2. 在 Cloudflare Turnstile 创建 `vote.cspstudy.top` 对应的 Managed Widget。
3. 为 Worker 配置 `TURNSTILE_SITE_KEY` 变量与 `TURNSTILE_SECRET` Secret；未配置时本地联调仍可提交。
4. 刷新候选目录并发布静态 Worker（Cloudflare 新版 Pages 发布方式）：

```bash
npm run vote:deploy
```

`deploy/wrangler.vote.toml` 已固定项目名、静态目录与 `vote.cspstudy.top` 自定义域名，避免发布时误继承主应用配置。
发布命令固定从独立的 `deploy` 目录运行，既不会读取项目根目录中用于旧流程的环境变量，也不会把 Wrangler 临时文件混入静态资源。

5. 第一次上线时，在 Worker `api` 中设置 `TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY`；之后普通静态页面更新不需要重建密钥。

## 数据规则

- 每个匿名设备标识仅允许一张选票。
- 每张选票可选 1–5 只不重复的 active 智子。
- 数据库成功写入后才返回星光回执；重复请求返回原选票和原回执。
- 投票期间公开接口只返回参与人数，不返回实时排名。
- 管理员结束活动时，服务端重新汇总全部原始选票并封存最终结果。
- Cron 每五分钟刷新当天的 D1 统计快照，并在现有 `SPRITES` KV 中保存一份同日备份。
- CSV 导出不包含设备标识、姓名、手机号或 IP。

## 验收尺寸

- 手机：390×844、微信内置浏览器、iPhone Safari、Android Chrome。
- 平板：768×1024。
- 桌面：1366×768、1440×900。
- 页面级无横向滚动；筛选条自身允许横向滑动。
- 卡片点击/触摸均可翻面，投票不依赖 hover。
