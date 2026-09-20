# 星相衣橱在线上新

桌宠发布后，新增装扮只需要把素材放入 `public/wardrobe/`、更新同目录的 `catalog.json`，再发布 Cloudflare 静态素材站，无需重新发布安装包。头像素材也可放在 `public/profile/`，目录会一并发布到 `cards.cspstudy.top`。

每个远程商品需要提供唯一 `id`、递增的 `version`、分类、稀有度、获取方式，以及素材地址。图片建议使用 WebP；头像、头像框与挂件应保留透明通道。

可购买商品：

```json
{
  "id": "avatar-summer-comet",
  "version": 1,
  "category": "avatar",
  "name": "夏夜彗星",
  "rarity": "epic",
  "acquisition": { "type": "coin", "price": 520 },
  "thumbnail": "./thumbs/summer-comet.webp",
  "asset": "./items/summer-comet.webp",
  "assetBytes": 12345,
  "checksum": "64 位小写 SHA-256"
}
```

条件奖励商品把 `acquisition` 改为：

```json
{
  "type": "condition",
  "description": "完成指定活动后获得"
}
```

条件商品目前必须填写应用已经支持的 `achievementId` 或 `rule`。新增一种全新的任务判断规则仍需更新应用；单纯新增金币商品、头像、头像框、背景和挂件不需要更新应用。

## 发布到 Cloudflare

```bash
npm run cloud-assets:deploy
```

命令会自动完成：

1. 重新校验衣橱目录和素材哈希。
2. 从工坊 API 生成全部公开智子的静态快照。
3. 汇总典藏卡、头像、衣橱和工坊素材。
4. 发布到 `https://cards.cspstudy.top`。

应用的读取顺序为：Cloudflare → Gitee 备用目录 → 本机缓存 → 安装包内创始素材。Cloudflare 暂时不可用不会清除孩子已经拥有的物品。

发布注意事项：

1. `catalog.version` 每次上新递增。
2. 修改同一商品素材时，同时递增该商品的 `version`。
3. `assetBytes` 使用文件的实际字节数。
4. `checksum` 可用 `shasum -a 256 文件名` 生成。
5. 已经发放过的商品不要删除；需要停售时保留条目和素材，避免换电脑后无法恢复。
6. Cloudflare Static Assets 单文件不得超过 25 MiB；构建脚本会自动拦截超限文件。
7. 修改素材必须递增对应条目的 `version`，否则孩子电脑会继续使用已校验的旧缓存。
