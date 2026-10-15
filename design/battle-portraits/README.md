# 试炼高清立绘（尚未发布）

四只初始伙伴由内置 imagegen 按原图重新绘制，不是放大 200px 预览：卡皮、啵啵、小布布、米伽。原始生成图与提示见 `sources.json`；`raw/` 保留工作区但不进入 Git 和安装包。其余九张复用已生成典藏卡的独立透明角色层，不使用整张卡片背景，不改变典藏卡素材。

`node scripts/build-battle-portraits.mjs` 输出 `cloud-assets-source/battle-portraits/`，13 张高清立绘、22 个兼容物种 ID，总下载约 2.21 MiB。每张 1024×1024 真透明 WebP；目录记录大小、尺寸、采样风格和 SHA-256。

`contact-sheet.webp` 为透明主体在深色底上的总览。美术仍需在实际战斗大小下检查；原有桌面精灵动画未替换。

生产 URL 保留为 `https://cards.cspstudy.top/battle-portraits/catalog.json`。当前仅本地 DEV 预览读取工作区目录；没有部署线上服务。这批美术不进入 `public/`，也不进入桌面 dist。未来授权发布时现有静态素材构建器会复制该目录。
