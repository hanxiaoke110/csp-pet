# Codex 复查清单 — 2026-07-09

> 本次两件事：① 学习资料飞书链接预置机制 ② 洛谷题库核对+导入。均未发版、未部署。当前本地版本号为 1.7.4。

---

## A. 学习资料飞书链接预置机制

### 修改文件

| 文件 | 改动 |
|---|---|
| `public/course-data/learning-resources.json` | schema v1→v2，新增 `lessonNo`/`status`/`thumbnailUrl`/`updatedAt`/`description`。预置 24 条资源（19 lecture + 2 fable + 1 practice + 2 review），全部 `coming_soon`，URL 均为 `example.com` 占位。含 `_schema` 字段说明。 |
| `src/components/resources/types.ts` | 新增 `ResourceStatus` 类型（ready/coming_soon/hidden）。扩展 `LearningResource` 接口。保留 `enabled` 兼容。 |
| `src/components/resources/ResourceCard.tsx` | status 按钮文案（ready→"打开"、coming_soon→"制作中"但仍可点击）、P{lessonNo} 徽标、缩略图 onError 降级、STAGE_COLOR 扩展 C1-C4。 |
| `src/components/resources/LearningResourcesPage.tsx` | 新增 `REMOTE_RESOURCE_INDEX_URL=''` 常量（空=不启用远程）；远程优先（tauriFetch 走 @tauri-apps/plugin-http）+本地兜底 + `isValidResourcesData` 格式校验；status hidden 过滤；lessonNo 升序排序。 |
| `docs/content-image-generation-plan.md` | 追加第 14 节「飞书链接预置策略」。 |
| `docs/release/manual-test-checklist-1.7.x.md` | 第 8 节补充 coming_soon/hidden/lessonNo/缩略图/远程回退 等测试项。 |

### Codex 检查点

1. **`REMOTE_RESOURCE_INDEX_URL` 为空时行为是否正确？** 空 → 直接 fetch 本地 `/course-data/learning-resources.json`。
2. **远程索引启用后 tauriFetch 依赖？** 走 `@tauri-apps/plugin-http`（与 App.tsx 一致），纯 vite 浏览器 dev 不可用但 Tauri runtime 可用。
3. **`isValidResourcesData` 校验够不够？** 只校验 `resources` 是数组。脏字段不会崩溃但有白屏风险——有 try/catch 兜底。
4. **`coming_soon` 按钮"制作中"但可点击——用户体验是否合理？** 按需求设计：飞书占位页后续直接更新，孩子无需更新客户端。
5. **`hidden` 资源是否真的不展示？** 页面层 `r.status !== 'hidden'` 过滤。
6. **缩略图空/加载失败是否不破图？** 空→emoji 占位，加载失败→onError 降级为占位。
7. **`example.com` 是否标记为发版阻塞项？** JSON `_note` + 计划文档第 12/14 节均有标记。
8. **是否影响班级码门禁？** `requiresClassCode=true` 仍走 `useClassAccess().ensure()`，未破坏。
9. **移动端布局？** 卡片网格 `repeat(auto-fill, minmax(260px, 1fr))`，实机待验收。

---

## B. 洛谷题库核对+导入

### 新增文件

| 文件 | 用途 |
|---|---|
| `scripts/import-luogu.mjs` | 从洛谷 ti.luogu.com.cn 提取试卷题目，转统一题库格式。支持 NOIP / GESP，过滤 Pascal/过时题。 |
| `scripts/verify-with-luogu.mjs` | 用洛谷数据交叉比对现有 GESP 题库：代码缺失、选项差异、答案不一致。支持 `--fix`。Codex 复查时已补齐 2025-09/2025-12/2026-03 映射，并去掉重复日志。 |
| `reports/luogu-import/` | 提取中间产物（`*-extracted.json`、`*-to-merge.json`、`*-verify-report.json`） |

### 修改文件

| 文件 | 改动 |
|---|---|
| `public/course-data/unified-quiz-bank.json` | 650→**1023** 题。新增 GESP 2025-09/2025-12/2026-03（298 题）、NOIP 2015-2018 普及组（75 题）。修复 1 道答案错误（gesp-2026-06-2-04）、196 个代码块提取到 code 字段、7 个图片 URL 提取到 image 字段。全量补 `examDate`/`examGroup` 标签。 |
| `public/course-data/excluded-question-ids.json` | Codex 复查后确认 `gesp-2026-03-4-14` 代码完整、答案可确认，未加入隔离。现有 3 个隔离 ID。 |

### 题库变化

| 来源 | 之前 | 之后 | 变化 |
|---|---|---|---|
| GESP | 555 | 853 | +298（2025-09/2025-12/2026-03 L1-L4） |
| CSP | 80 | 80 | 不变 |
| 超级挑战 | 15 | 15 | 不变 |
| NOIP（新增） | 0 | 75 | 2015-2018 普及组 C++ 题 |

### 修复

| 类型 | 数量 | 示例 |
|---|---|---|
| 答案修正 | 1 | `gesp-2026-06-2-04`：`not(x>5 or y<=10)` 德摩根律，B→C |
| 代码提取 | 196 | `` ```cpp `` 从题干 → `code` 字段 |
| ID 正规化 | 298 | Luogu 内部 ID（3337）→ 序号（01-25） |
| 图片提取 | 7 | `![](url)` → `image` 字段，题干清理 |
| 隔离截断代码 | 0 | `gesp-2026-03-4-14` 已复查：代码完整，答案 B 可确认，不需要隔离 |

### 审计结果

| 命令 | 结果 |
|---|---|
| `npm run validate:assets` | ✅ unified-quiz-bank 0 issues |
| `npm run audit:reliability` | ✅ VISIBLE P0=0 P1=0 |
| `npm test` | ✅ 5/5 |
| `npm run build` | ✅ |
| `npm run build:dungeon` | ✅ |
| dist 同步 | ✅ public=dist=dist-dungeon=1023 |
| 重复 ID | ✅ 无 |
| 选项缺失/答案越界 | ✅ 0 |

### Codex 检查点

1. **NOIP 过滤规则是否合理？** `import-luogu.mjs` 中 `PASCAL_MARKERS`/`OBSOLETE_MARKERS`/`CPP_MARKERS` 三个正则集。Codex 可评估是否有漏网或过杀。
2. **NOIP 2015-2018 75 道题的知识点标注质量？** 自动推断（`KP_RULES`），大部分标为"其他"，需人工审核。
3. **7 道图片题（4 NOIP + 3 GESP）的图片 URL 是否可访问？** Luogu OSS/CDN 外链，需验证是否在国内可访问、是否会过期。
4. **`gesp-2026-03-4-14` 是否需要隔离？** Codex 复查确认本地题库代码完整，`throw 0` 命中 `catch(int)`，答案 B 可确认，不需要隔离。
5. **新题答案是否全部正确？** 仅抽查了计算题（全部正确），Codex 可补充更多维度的验证（语法题、代码阅读题）。
6. **GESP 新题的 `explanation` 全部为"官方答案：X。"——建议后续 AI 批量生成解析。**
7. **`import-luogu.mjs` 中 `PASCAL_MARKERS` 是否有误杀 C++ 题？** 抽查的 75 题已排除 Pascal，需 Codex 再确认无 C++ 被误杀。

### Codex 复查补充

- 已执行 `node scripts/verify-with-luogu.mjs --source gesp --dry-run`。
- 新增 GESP 2025-09 / 2025-12 / 2026-03 均能与洛谷匹配，且没有新增选项/答案差异。
- dry-run 报告中的 28 条差异都来自旧 GESP 题，主要是空格、LaTeX、全角/半角字符等格式差异；未发现新增 GESP 题阻塞问题。
- `gesp-2026-03-4-14` 代码实际完整，答案 B 可确认，因此未继续加入隔离列表；当前隔离 ID 仍为 3 个。

### 待做

| 项目 | 预估题量 | 脚本状态 |
|---|---|---|
| NOIP 2011-2014 普及组 | ~80 | 脚本就绪，改参数即跑 |
| NOIP 2007-2010 精选 | ~60 | 需更多人工筛选（Pascal/过时较多） |
| GESP 早期缺失 L3-L4（2023-06/2023-09） | ~120 | 脚本就绪，改参数即跑 |
| CSP 2025 入门级真题（problemset 1119） | ~45 | 脚本就绪 |
| 热更新推送（version bump 20→21 + push gitee） | — | 按上次流程操作 |
| AI 批量生成新题解析 | — | 可复用已配置的 AI API |

---

## 未做事项（必须声明）

- 未发版
- 未在本轮复查中改版本号（package.json 与 tauri.conf.json 当前为 1.7.4）
- 未部署
- 未动 Cloudflare Worker（cf-workers/api.js 本次未编辑）
- 未生图
- 未把图片塞进客户端包体（缩略图 URL 全为空，图片外链走 Luogu CDN）
- 未删现有功能
- `REMOTE_RESOURCE_INDEX_URL` 仍为空，远程索引未启用
- `example.com` 仍是发版阻塞项
