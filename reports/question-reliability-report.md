# 题库可靠性报告 (Question Reliability Report)

生成时间: 2026-07-10T10:55:32.216Z

## 总览

- 审计源文件: 4 个
- 源题库总题数: 2490
- 源题库问题题数 (sourceIssuesTotal): 38 (P0=0, P1=4, P2=34)
- 已隔离题目数 (excludedIssuesTotal): 4
- 学生可见问题 (visible): P0=0, P1=0, P2=34

## 分文件摘要

| 文件 | 总题数 | 问题数 | P0 | P1 | P2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| public/course-data/unified-quiz-bank.json | 1023 | 1 | 0 | 1 | 0 |
| public/course-data/quiz-bank.json | 432 | 0 | 0 | 0 | 0 |
| public/course-data/csp-exam-bank.json | 240 | 0 | 0 | 0 | 0 |
| src-dungeon/data/csp-exam-bank.json | 795 | 37 | 0 | 3 | 34 |

## 学生可见风险

学生可见 = 源题库问题中尚未被 `excluded-question-ids.json` 隔离的题（会进入 /quiz 与 /dungeon 题池）。

- visibleP0: **0**
- visibleP1: **0**
- visibleP2: **34**

> ✅ 学生可见 P0/P1 均为 0：无崩溃、无无法作答、无显示异常题目。仅剩 34 道 P2（缺解析，不影响作答与显示）。

## 源题库剩余问题

源题库仍有 4 道缺代码题，已隔离，不会进入学生题池。其余 34 道为内容缺失类（P2，缺解析）。

### 源题库 P1（含已隔离）

- 🚫已隔离 **gesp-2024-12-4-13** [unified-quiz-bank.json] choice: [code] code 含相邻/悬空运算符（疑似 OCR 损坏） | [code] code 大括号严重不匹配/以 } 起始（疑似残片）
- 🚫已隔离 **gesp-2024-03-4-10** [csp-exam-bank.json] choice: [code] 题干引用代码/程序/输出但无 code 字段
- 🚫已隔离 **gesp-2024-06-4-15** [csp-exam-bank.json] choice: [code] 题干引用代码/程序/输出但无 code 字段
- 🚫已隔离 **gesp-2024-12-4-13** [csp-exam-bank.json] choice: [code] 题干引用代码/程序/输出但无 code 字段

### 源题库 P2（34 道，缺解析等）

均为 CSP reading 题缺 explanation，属历史内容缺失，非显示问题，不影响作答。详见 JSON 报告 findings。

## 已隔离题目

配置文件: `public/course-data/excluded-question-ids.json`（单一数据源，客户端与审计共用）

- reason: `missing_or_corrupted_code`
- note: 这 3 道题原题代码为图片，导入后 code 缺失或仅 OCR 残片（含伪迹，如 j >= &&），无法可靠重建。已从学生题池隔离；补全 code 后从此列表移除即可恢复。客户端加载时读取本文件，读取失败降级为空集，不影响题库加载。

| id | 隔离原因 |
| --- | --- |
| gesp-2024-03-4-10 | missing_or_corrupted_code |
| gesp-2024-06-4-15 | missing_or_corrupted_code |
| gesp-2024-12-4-13 | missing_or_corrupted_code |

客户端通过 `src/utils/excludedQuestions.ts`（/quiz 与 /dungeon 共用 helper）在题库加载时读取本配置并过滤；读取失败降级为空集，不影响题库加载。

## 发版建议

- 学生可见 P0=0, P1=0 → **可发版（无阻塞风险）**
- visibleP2=34（缺解析）为内容完善项，不阻塞发版。
- 4 道已隔离题不影响学生体验；发版前可选择补全代码后移除隔离。
- 本报告基于源题库审计；dist/dist-dungeon 由构建再生成，发版流程跑 `npm run build` 即可同步。

## 后续补题清单

### 1. 补全已隔离题代码（补全后从 excluded-question-ids.json 移除对应 id）

- gesp-2024-03-4-10
- gesp-2024-06-4-15
- gesp-2024-12-4-13

来源建议：CCF/GESP 原题图片人工录入或重新 OCR，补全 `code` 字段后从排除列表删除。

### 2. 补全 34 道 reading 题解析（内容完善，非阻塞）

`src-dungeon/data/csp-exam-bank.json` 中 34 道 CSP reading 题缺 explanation，可按年份从真题解析补全。

