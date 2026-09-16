# 云端静态素材发布

统一域名：`https://cards.cspstudy.top`

当前静态内容：

- `/collector-cards/`：典藏卡目录与分层卡面
- `/wardrobe/`：头像框、背景、挂件等星相衣橱素材
- `/profile/`：生肖与星座头像
- `/workshop/`：公开工坊智子的目录、缩略图与完整精灵图
- `/course-data/`：课程阶段、课程正文、验证题与课程图片

## 发布

```bash
npm run cloud-assets:deploy
```

发布脚本会即时读取线上工坊的全部 active 智子，生成 WebP 缩略图并复制完整精灵图。学生浏览工坊和购买后下载均走 Cloudflare 静态资源；教师上传、审核与目录源数据仍走原 API。

典藏卡和衣橱目录优先读取 Cloudflare，失败后依次回退至 Gitee、本机缓存和安装包素材。当前随应用安装的创始卡与创始衣橱不会重复下载；只有更高 `version` 或全新 ID 才会使用在线素材。

## 在线课程更新

应用启动时只检查 `/course-data/version.json`。版本未变化时不会下载课程正文；版本增加后才会更新 `stages.json`、`lessons.json` 和 `unified-quiz-bank.json`，随后保存在本机。加载顺序为 Cloudflare、Gitee、本机缓存、安装包离线课程。

发布课程时：

1. 修改 `public/course-data/stages.json` 与 `lessons.json`，需要时同步更新验证题和课程图片。
2. 保持已经发布的课程 `id` 不变，新课程使用从未用过的新 `id`，这样学生进度不会错位。
3. 将 `public/course-data/version.json` 的整数版本加一。
4. 执行 `npm run validate:assets` 和 `npm run cloud-assets:deploy`。

课程文件是静态 CDN 内容，不读取 KV、D1 或 Worker API。客户端会校验阶段、课程 ID、顺序和标题；格式异常时继续使用上一次缓存或安装包内容。

## 试炼场写入策略

- 战斗失败不写 D1。
- 无奖励的重复挑战不写 D1。
- 只同步发生变化的副本，不再发送 8 个副本全量状态。
- `report-battle` 成功后不再用 `sync` 重复写同一条进度；仅在上报失败时补写进度。
- 新徽章仍立即同步，保证跨设备恢复。

这套策略保留服务端防重复发奖、排行榜和跨设备恢复，同时显著减少重复写入。若以后日活继续增长，应优先升级 Workers Paid，而不是取消服务端权威结算。
