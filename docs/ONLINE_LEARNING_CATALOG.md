# 在线课堂资料维护

桌面端从 `https://cards.cspstudy.top/course-data/` 读取课堂资料目录，并保留本地缓存与安装包内置副本。网络不可用时仍会显示最近一次成功目录；只有目录版本增大时才下载更新。

## 新增或修改一课

1. 编辑 `public/course-data/learning-catalog.json`：填写课次、C1–C4 阶段、标题、说明、标签和飞书 `docx` 链接。
2. 已完成内容使用 `ready`；尚未完成使用 `coming_soon`，链接可暂时留空；不展示使用 `hidden`。
3. 如需先绑定班级码才能打开，把 `requiresClassCode` 设为 `true`。
4. 每次上线都把 `catalogVersion` 加 1，并同步修改 `learning-catalog.version.json` 中的 `version`。
5. 执行：

   ```bash
   npm run learning-catalog:validate
   npm run cloud-assets:deploy
   ```

6. 部署后分别打开以下地址，确认版本号和新课内容正确：

   - `https://cards.cspstudy.top/course-data/learning-catalog.version.json`
   - `https://cards.cspstudy.top/course-data/learning-catalog.json`

## 安全规则

- 课号和资料 ID 不能重复。
- `ready` 条目必须具有允许的飞书/飞书国际版 HTTPS `docx` 链接。
- 不要删除已经上线的课次；需要下架时使用 `hidden`，以免旧缓存和书签出现错位。
- 发布失败不会破坏学生端已有缓存，也不需要重新发布桌面安装包。
