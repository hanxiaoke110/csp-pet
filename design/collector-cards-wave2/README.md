# 第二期典藏卡：013–021

状态：2026-10-14 已发布在线目录 v6。Cloudflare 版本 `39b27df0-45b8-4ca0-b1f2-c8558847207b`。
回读验证 21 张卡、72 个素材文件全部通过，前 12 张卡完整保留。详见 `publication.json`。

9 张：乐魂、月薪猫、线条小狗、张起灵（Q）、夺舍红狼、威虫、皮皮、电能豌豆射手、银狼。

## 预览

在仓库运行 `npx vite --host 127.0.0.1 --port 4186`，打开
`http://127.0.0.1:4186/design/collector-cards-wave2/preview.html`。
页面直接复用桌宠 `HoloCardViewer`，包含鼠标跟随、独立主体视差、属性幻光、点击光爆、翻面、自动赏卡。不会访问学生购买流程或修改本地存档。

`contact-sheet.webp` 是九张静态正面的总览，不能表现动态效果。

## 素材与构建

- `cards.json`：名称、属性、文案、拟定价格和美术方向。
- `raw/`：内置 imagegen 生成的独立背景、透明主体原稿，留在工作区，不进入 Git 或安装包。
- `sources.json`：原始生成文件溯源；原文件保留不删除。
- `assets/`：9 张压缩后的背景、透明主体、透明文字、缩略图。
- `preview-catalog.json`：本地预览九张新卡。
- `candidate-catalog.json`：待上线的 21 张目录；前 12 张内容完整保留。
- `validation.json`：构建验证报告。

构建：`node scripts/build-collector-wave2.mjs`。
验证：`npx vitest run scripts/collector-wave2.test.ts`。

原稿使用 imagegen 绘制，遵循 holo-card-studio 的 holographic 分层方向。主体不使用低清工坊贴图；文字是单独的矢量渲染层。每张 1024×1536，缩略图 320×480，九张资源合计约 7.56 MiB，不预制进安装包。

## 上线边界

`cloud-assets-source/collector-cards/catalog.json` 仅追加新卡并提升目录版本；没有改写 `public/collector-cards` 或旧卡资产，尤其芙宁娜原始分层保持不变。
本次已将九个新目录复制到在线静态资产源，与上线前 12 张目录合并后发布，未改动旧卡素材。后续上传前仍必须重新对照线上目录，避免覆盖此后新增卡片。现有桌宠引擎支持这些分层字段，上传素材和目录即可，不需要桌面发版。
