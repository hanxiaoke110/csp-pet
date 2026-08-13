# 题库可靠性报告 (Question Reliability Report)

生成时间: 2026-08-13T17:56:36.941Z

## 总览

- 审计源文件: 4 个
- 源题库总题数: 2490
- 源题库问题题数 (sourceIssuesTotal): 23 (P0=0, P1=1, P2=22)
- 已隔离题目数 (excludedIssuesTotal): 7
- 学生可见问题 (visible): P0=0, P1=0, P2=16

## 分文件摘要

| 文件 | 总题数 | 问题数 | P0 | P1 | P2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| public/course-data/unified-quiz-bank.json | 1023 | 3 | 0 | 1 | 2 |
| public/course-data/quiz-bank.json | 432 | 0 | 0 | 0 | 0 |
| public/course-data/csp-exam-bank.json | 240 | 10 | 0 | 0 | 10 |
| src-dungeon/data/csp-exam-bank.json | 795 | 10 | 0 | 0 | 10 |

## 学生可见风险

学生可见 = 源题库问题中尚未被 `excluded-question-ids.json` 隔离的题（会进入 /quiz 与 /dungeon 题池）。

- visibleP0: **0**
- visibleP1: **0**
- visibleP2: **16**

> ✅ 学生可见 P0/P1 均为 0：无崩溃、无无法作答、无显示异常题目。仅剩 16 道 P2（缺解析，不影响作答与显示）。

## 源题库剩余问题

源题库仍有 7 道缺代码题，已隔离，不会进入学生题池。其余 16 道为内容缺失类（P2，缺解析）。

### 源题库 P1（含已隔离）

- 🚫已隔离 **noip-2018-p-721** [unified-quiz-bank.json] v2: [v2] V2 验证状态: broken (insufficient_options)

### 源题库 P2（22 道，缺解析等）

均为 CSP reading 题缺 explanation，属历史内容缺失，非显示问题，不影响作答。详见 JSON 报告 findings。

## V2 验证状态（question-bank-v2）

V2 管道验证结果中，学生可见 disputed/broken：**8** disputed + **0** broken（未在排除名单内，按 ID 去重）；已隔离 7。
disputed 表示模型/官方答案存在分歧或题面歧义，需人工复核；broken 表示结构不适配。以下为可见项：

| id | V2 状态与原因 |
| --- | --- |
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

- 学生可见 P0=0, P1=0 → **可发版（无阻塞风险）**
- visibleP2=16（缺解析）为内容完善项，不阻塞发版。
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

### 2. 补全 22 道 reading 题解析（内容完善，非阻塞）

`src-dungeon/data/csp-exam-bank.json` 中 34 道 CSP reading 题缺 explanation，可按年份从真题解析补全。

