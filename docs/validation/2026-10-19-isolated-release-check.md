# 发布前隔离验证

本次由开发环境承担验证，不要求教师或学生搭建测试机，不读写正式 AppData，不请求生产接口。

## 本机已验证

执行 `npx vitest run scripts/backup-isolation.test.mjs`：5 项通过。

- jsdom 独立 origin 的真实 Storage 实现，保守限制为 5 MiB UTF-16 数据。
- 每项使用系统临时目录内的独立磁盘 SQLite；原生 IPC 边界适配为同等 settings SQL，运行实际备份、恢复、持久化与智子 store 代码。
- 合成旧版存档：10 只智子、12,360 金币、375 条记录、五类中文历史键、约 2.7 MiB 旧缓存；不使用真实姓名、手机号或教师资料。
- 空存储恢复、带旧缓存覆盖恢复、恢复后关闭重开数据库并重新加载：宠物 ID/物种/昵称/等级、金币、历史、已购伙伴槽位保留；源文件哈希不变。
- SQL trigger 制造真实数据库写失败：明确报告镜像失败，本地恢复数据保留，重载不选中旧 SQL 钱包。
- Storage 配额耗尽：恢复被拒绝，原本地钱包和 SQLite 文件哈希不变。
- 不执行恢复的直接升级路径：老用户能加载原智子、金币、历史，个人本地日记不被更改。
- 禁止测试联网；只清理测试自身创建的临时目录，正式应用数据不受影响。

全套 `npm test`：109 个文件、720 项通过，无未处理错误。

## 远程 Windows / macOS 验证结果

现有 Build & Release 工作流补充：Windows 执行完整 JS 套件（包含以上隔离验收），Windows/macOS Apple Silicon 执行原生数据库故障测试。

仅通过工作分支的 `workflow_dispatch` 构建候选产物，不打版本 tag，因此工作流的正式发布 job 跳过，不上传 Gitee 或修改 `update.json`。候选仍沿用当前版本号，仅供验证，不给学生安装；正式版本号、发布签名及后端部署应在正式发布阶段处理。

- [候选 CI 39262802860](https://github.com/hanxiaoke110/csp-pet/actions/runs/39262802860)：全部通过。
- 验证源码：`3b1325cf2f446761c4af121e419d2b0483e747d4`，分支 `feature/student-feedback`，候选版本号 `1.7.53`。
- Ubuntu 发布门禁通过；Windows 全套 720 项 JS 测试通过；Windows 和 Apple Silicon macOS 各 3 项原生数据库测试通过。
- Windows x64、Apple Silicon macOS、Intel macOS 的 Tauri 安装包均成功构建并上传为 CI artifact。
- `release`、`update-feishu-doc` 两个 job 均为 skipped；没有发布到正式下载渠道。
- 首次候选 CI 的 Windows 题库检查暴露 POSIX `command -v` 不兼容 Windows。已改为直接探测编译器 `--version`、Windows 使用 `.exe` 输出文件；本机 33 项针对性测试、全套 720 项及第二次 Windows CI 均通过。此修复只涉及离线题库验证工具，不改变学生做题逻辑。

CI 发布门禁会只读请求线上赛季接口；本机隔离恢复用例仍禁止联网，没有在生产接口执行写入。

## 候选安装包回读校验（2026-10-20）

从上述成功 CI 下载三份 artifact 到 `.tmp/isolated-candidate-39262802860/`，逐个核对文件名、非零大小、格式标记及严格小于 100,000,000 字节上限，生成本地 `verification.json`。两份 DMG 另经 `hdiutil verify` 验证镜像校验和有效；Windows 文件识别为 NSIS 自解压安装器，未在本机执行。

| 平台 | 实际字节数 | 十进制 MB | SHA-256 |
| --- | ---: | ---: | --- |
| Windows x64 | 93,936,009 | 93.94 | `050a06a47891a32138cfbb1c804a6852163b9743eb0d23c37244c35e3a145302` |
| macOS Apple Silicon | 98,161,982 | 98.16 | `d257c4b16e0a135b7a70c72c3000c1edd75e3eafa2f9283443c0be7b41167dd6` |
| macOS Intel | 99,270,329 | 99.27 | `27f5b51f6f46728826d217528a7418f243ba380fcfeb3d440c2d52ec1e83bdf7` |

三份均低于 100 MB；Intel 包只剩 729,671 字节余量，正式版本重建后必须重新检查，不能沿用此次体积结论。下载与哈希记录不等于安装验收或正式 updater 签名验证。没有安装或运行同 app ID 的候选程序，避免触碰正式 AppData。

## 明确的边界

- 老师原始 JSON 已不在原路径，按精确文件名的本地检索也未找到；本次合成夹具不是该原文件复测。
- IPC 适配测试不等于 WebView2 图形界面实机验收；即使 Windows CI 通过，也不能宣称真实学生电脑全面验收。
- 当前生产 Worker 尚未部署补偿 v2 接口。候选包不可直接对学生发布；正式发布必须先部署向后兼容的 Worker，并验证旧客户端行为。
- 本记录不声称所有潜在风险已经消除；其余风险与回滚顺序见稳定性修复记录。
