# 工坊自动上架

教师端保存后，GitHub Actions 每 5 分钟检查一次公开工坊数据。只有完整目录变化才安装依赖、构建、校验、发布；GitHub 调度可能延迟，因此不是五分钟内上架的承诺。教师端「我的精灵」根据实际静态目录显示上架状态，可手动检查。

- 发布工作流：`.github/workflows/workshop-publication.yml`。
- 单独 Worker：`csp-workshop-assets`，仅接管 `cards.cspstudy.top/workshop/*`。
- 不重发桌面安装包，不覆盖典藏卡、衣橱、装备或课堂资料目录。
- 新教师端上传使用唯一文件名，避免同名角色互相覆盖图片。
- 每天 UTC 19:17 强制重新读取图片，兜底旧客户端同名文件覆盖；旧端纯图片变化最迟等待该审计，不属于普通元数据变更检测。
- 发布前验证所有图片、动画尺寸、完整分页；异常时保留上次成功线上目录。
- 少于原目录一半且减少超过 10 个角色会阻止发布；确认批量删除属实后，手动运行时才勾选 `allow_large_delete`。
- 手动运行 `refresh_images` 可立即重新读取所有源图片；不需要更改桌面版本。
- 发布凭据为 GitHub Actions 加密 secret `CLOUDFLARE_API_TOKEN`，不在仓库、桌面包或教师网页中。
- GitHub 定时任务存在平台排队和长期无活动停用限制，需保留工作流失败通知并定期检查 Actions。上线验证使用手动任务，不向生产工坊添加测试角色。

本地校验：

```sh
npx vitest run scripts/workshop-publication.test.mjs scripts/workshop-publication-view.test.mjs
node scripts/build-workshop-static.mjs --check
node scripts/build-workshop-static.mjs --build
node scripts/build-workshop-static.mjs --verify
```

学生已安装版本读取原静态地址即可获得新目录；已打开的工坊需要离开后重新进入或重新打开应用。已购买角色和本地存档不因目录更新而删除。
