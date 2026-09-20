# 题库可靠性报告 (Question Reliability Report)

生成时间: 2026-09-20T06:21:22.107Z

## 总览

- 审计源文件: 4 个
- 源题库总题数: 2490
- 源题库问题题数 (sourceIssuesTotal): 71 (P0=0, P1=16, P2=55)
- 已隔离题目数 (excludedIssuesTotal): 7
- 学生可见问题 (visible): P0=0, P1=15, P2=49

## 分文件摘要

| 文件 | 总题数 | 问题数 | P0 | P1 | P2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| public/course-data/unified-quiz-bank.json | 1023 | 41 | 0 | 16 | 25 |
| public/course-data/quiz-bank.json | 432 | 0 | 0 | 0 | 0 |
| public/course-data/csp-exam-bank.json | 240 | 10 | 0 | 0 | 10 |
| src-dungeon/data/csp-exam-bank.json | 795 | 20 | 0 | 0 | 20 |

## 学生可见风险

学生可见 = 源题库问题中尚未被 `excluded-question-ids.json` 隔离的题（会进入 /quiz 与 /dungeon 题池）。

- visibleP0: **0**
- visibleP1: **15**
- visibleP2: **49**

## 源题库剩余问题

源题库仍有 7 道缺代码题，已隔离，不会进入学生题池。其余 64 道为内容缺失类（P2，缺解析）。

### 源题库 P1（含已隔离）

- **super-2024-reading-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2024-reading-2** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2024-reading-3** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2024-completion-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2024-completion-2** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2023-reading-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2023-reading-2** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2023-reading-3** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2022-reading-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2022-reading-2** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2022-reading-3** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2021-reading-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2021-reading-2** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2021-reading-3** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- **super-2021-completion-1** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (missing_children)
- 🚫已隔离 **noip-2018-p-721** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (insufficient_options)

### 源题库 P2（55 道，缺解析等）

均为 CSP reading 题缺 explanation，属历史内容缺失，非显示问题，不影响作答。详见 JSON 报告 findings。

## V2 验证状态（question-bank-v2）

V2 管道验证结果中，学生可见 disputed/broken：**31** disputed + **15** broken（未在排除名单内，按 ID 去重）；已隔离 7。
disputed 表示模型/官方答案存在分歧或题面歧义，需人工复核；broken 表示结构不适配。以下为可见项：

| id | V2 状态与原因 |
| --- | --- |
| gesp-2023-09-2-14 | disputed (model_canonical_conflict) |
| gesp-2023-12-1-12 | disputed (model_conflict) |
| gesp-2024-03-1-13 | disputed (model_conflict) |
| gesp-2024-06-1-07 | disputed (model_conflict) |
| gesp-2024-09-2-11 | disputed (model_conflict) |
| gesp-2025-06-2-13 | disputed (model_conflict) |
| super-2024-reading-1 | broken (missing_children) |
| super-2024-reading-2 | broken (missing_children) |
| super-2024-reading-3 | broken (missing_children) |
| super-2024-completion-1 | broken (missing_children) |
| super-2024-completion-2 | broken (missing_children) |
| super-2023-reading-1 | broken (missing_children) |
| super-2023-reading-2 | broken (missing_children) |
| super-2023-reading-3 | broken (missing_children) |
| super-2022-reading-1 | broken (missing_children) |
| super-2022-reading-2 | broken (missing_children) |
| super-2022-reading-3 | broken (missing_children) |
| super-2021-reading-1 | broken (missing_children) |
| super-2021-reading-2 | broken (missing_children) |
| super-2021-reading-3 | broken (missing_children) |
| super-2021-completion-1 | broken (missing_children) |
| gesp-2024-03-3-09 | disputed (model_conflict) |
| gesp-2024-09-3-02 | disputed (model_conflict) |
| gesp-2024-12-3-05 | disputed (model_conflict) |
| gesp-2025-06-4-07 | disputed (model_conflict) |
| noip-2016-p-398 | disputed (model_conflict) |
| noip-2016-p-429 | disputed (model_conflict) |
| noip-2017-p-464 | disputed (model_conflict) |
| noip-2017-p-468 | disputed (model_conflict) |
| gesp-2025-09-3-17 | disputed (model_conflict) |
| gesp-2025-09-3-20 | disputed (model_conflict) |
| gesp-2025-09-4-18 | disputed (model_conflict) |
| gesp-2025-09-4-20 | disputed (model_conflict) |
| gesp-2025-12-2-21 | disputed (model_conflict) |
| gesp-2025-12-2-22 | disputed (model_conflict) |
| gesp-2026-03-1-05 | disputed (model_conflict) |
| gesp-2026-03-3-03 | disputed (model_conflict) |
| gesp-2026-03-4-22 | disputed (model_conflict) |
| csp-s-2019-f02 | disputed (model_reports_ambiguity) |
| csp-s-2022-f02 | disputed (model_reports_ambiguity) |
| csp-s-2023-r03 | disputed (model_reports_ambiguity) |
| csp-s-2024-f01 | disputed (model_reports_ambiguity) |
| csp-s-2024-f02 | disputed (model_reports_ambiguity) |
| csp-j-2023-r01 | disputed (model_reports_ambiguity) |
| csp-j-2024-f01 | disputed (model_reports_ambiguity) |
| csp-j-2024-f02 | disputed (model_reports_ambiguity) |

## 已隔离题目

配置文件: `public/course-data/excluded-question-ids.json`（单一数据源，客户端与审计共用）

- reason: `missing_corrupted_or_answer_disputed`
- note: 共 9 道题暂时隔离。2026-08-14 新增 gesp-2024-09-2-06：题干依赖缺失的源代码，无法独立作答；其余为缺原卷、OCR 歧义、答案分歧或结构不适配。

| id | 隔离原因 |
| --- | --- |
| csp-s-2020-r01 | missing_corrupted_or_answer_disputed |
| csp-s-2023-r01 | missing_corrupted_or_answer_disputed |
| gesp-2023-09-2-07 | missing_corrupted_or_answer_disputed |
| gesp-2024-09-2-06 | missing_corrupted_or_answer_disputed |
| gesp-2025-09-1-04 | missing_corrupted_or_answer_disputed |
| gesp-2025-09-2-13 | missing_corrupted_or_answer_disputed |
| gesp-2025-12-3-22 | missing_corrupted_or_answer_disputed |
| gesp-2026-06-3-05 | missing_corrupted_or_answer_disputed |
| noip-2018-p-721 | missing_corrupted_or_answer_disputed |

客户端通过 `src/utils/excludedQuestions.ts`（/quiz 与 /dungeon 共用 helper）在题库加载时读取本配置并过滤；读取失败降级为空集，不影响题库加载。

## 发版建议

- 学生可见 P0=0, P1=15 → **不建议发版，需先修复或隔离 visible P0/P1**
- visibleP2=49（缺解析）为内容完善项，不阻塞发版。
- 7 道已隔离题不影响学生体验；发版前可选择补全代码后移除隔离。
- 本报告基于源题库审计；dist/dist-dungeon 由构建再生成，发版流程跑 `npm run build` 即可同步。

## 后续补题清单

### 1. 补全已隔离题代码（补全后从 excluded-question-ids.json 移除对应 id）

- csp-s-2020-r01
- csp-s-2023-r01
- gesp-2023-09-2-07
- gesp-2024-09-2-06
- gesp-2025-09-1-04
- gesp-2025-09-2-13
- gesp-2025-12-3-22
- gesp-2026-06-3-05
- noip-2018-p-721

来源建议：CCF/GESP 原题图片人工录入或重新 OCR，补全 `code` 字段后从排除列表删除。

### 2. 补全 55 道 reading 题解析（内容完善，非阻塞）

`src-dungeon/data/csp-exam-bank.json` 中 34 道 CSP reading 题缺 explanation，可按年份从真题解析补全。

