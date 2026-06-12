# CSP 真题训练 — 设计方案

> 日期：2026-06-11  
> 状态：设计完成，待评审  
> 修订：v1.1 — 审查后调整

## 一、目标

在"OJ 训练"上方新增"🏅 CSP 真题"入口，学生可选择 CSP-J（入门）或 CSP-S（提高），按题型（选择题 / 程序阅读 / 程序填空）混抽历年真题进行练习。程序阅读和程序填空题的 UI 复用现有"超级挑战"的展示模式，选择题复用现有选择题的 ABCD 选项 UI。

## 二、页面结构

### 2.1 导航入口

侧边栏在 `💻 OJ 训练` 上面新增一行：

```
🏅 CSP 真题      ← 新增
💻 OJ 训练      ← 现有
```

### 2.2 页面流程（3 层）

```
第1层：选组别
  ┌──────────┐  ┌──────────┐
  │ CSP-J 入门│  │ CSP-S 提高│
  └──────────┘  └──────────┘

第2层：每日任务进度条 + 选题型
  ┌─────────────────────────────────────────┐
  │ 📝 今日任务：3 选择 + 1 阅读/填空       │
  │ 选择 [✅✅⬜] 2/3  阅读 [⬜] 0/1  填空 [⬜] 0/1 │
  │ +20 EXP +12 金币                        │
  └─────────────────────────────────────────┘
  ┌────────┐ ┌──────────┐ ┌──────────┐
  │📝 选择题│ │📖 程序阅读│ │✏️ 程序填空│
  │ 25 道  │ │  12 道   │ │   8 道   │
  └────────┘ └──────────┘ └──────────┘
     ↑ 题目数不足时显示"题目准备中"并置灰

第3层：做题界面
  选择题   → 复用现有 ABCD 选项 UI
  程序阅读 → 复用超级挑战的代码块 + 小问作答 UI（但全部用 ABCD，不用 T/F）
  程序填空 → 复用超级挑战的代码块 + 空位作答 UI
```

### 2.3 做题 UI 详情

**选择题：** 题目在上、4 个 ABCD 选项在下，和现有 QuizPractice 的选择题一模一样。`code` 字段有值则在题目上方渲染 `<pre className="code-block">`，`image` 字段有值则显示图片。

**程序阅读题：** 题型标签（📖 程序阅读 · CSP-J 2019 · 3小问）→ 代码块 → 题目描述 → 逐小问 ABCD 选项 → 提交按钮。所有小问一起提交。提交后逐小问显示对错（绿色/红色高亮）+ 正确答案。

**程序填空题：** 题型标签（✏️ 程序填空 · CSP-J 2019 · 2空）→ 代码块（空位 `__1__` `__2__` 高亮显示）→ 逐空 ABCD 选项 → 提交按钮。所有空一起提交。提交后逐空显示对错（绿色/红色高亮）+ 正确答案。

**代码和图片渲染：** 题目文本（`question` 字段）统一通过 `renderCodeText()` (src/utils/markdown.ts) 渲染，支持 markdown 代码块和图片。单独的 `code` 字段用 `<pre className="code-block">` 渲染（纯 C++ 代码，不需要 markdown 解析）。

## 三、题库数据格式

### 3.1 文件

新文件：`public/course-data/csp-exam-bank.json`

### 3.2 题目结构

```json
{
  "questions": [
    {
      "id": "csp-j-2019-01",
      "year": 2019,
      "group": "J",
      "type": "choice",
      "knowledgePoint": "进制转换",
      "difficulty": 1,
      "question": "二进制数 1011 对应的十进制数是（ ）",
      "code": null,
      "image": null,
      "options": ["10", "11", "12", "13"],
      "correctIndex": 1,
      "explanation": "1011₂ = 1×8 + 0×4 + 1×2 + 1×1 = 11"
    },
    {
      "id": "csp-j-2019-02",
      "year": 2019,
      "group": "J",
      "type": "reading",
      "knowledgePoint": "循环结构",
      "difficulty": 2,
      "question": "阅读程序，写出运行结果",
      "code": "#include <iostream>\n...",
      "image": null,
      "subQuestions": [
        { "label": "程序输出是", "options": ["10","15","5","20"], "correctIndex": 1, "explanation": "1+2+3+4+5=15" },
        { "label": "循环执行次数", "options": ["3","4","5","6"], "correctIndex": 2, "explanation": "i从1到5共5次" }
      ]
    },
    {
      "id": "csp-j-2019-03",
      "year": 2019,
      "group": "J",
      "type": "fillBlank",
      "knowledgePoint": "数组操作",
      "difficulty": 2,
      "question": "完善程序：将数组元素逆序",
      "code": "void reverse(int a[], int n) {\n  for(int i=0; i<__1__; i++) { ... }\n}",
      "image": null,
      "blanks": [
        { "position": 1, "options": ["n","n/2","n-1","n-i"], "correctIndex": 1, "explanation": "只交换前一半" },
        { "position": 2, "options": ["n-i","n-i-1","i+1","n-1"], "correctIndex": 1, "explanation": "对称位置是 n-i-1" }
      ],
      "explanation": "逆序只需交换前 n/2 个元素"
    }
  ]
}
```

### 3.3 字段说明

| 字段 | 类型 | 选择题 | 程序阅读 | 程序填空 | 说明 |
|------|------|--------|---------|---------|------|
| `id` | string | ✅ | ✅ | ✅ | 唯一标识 |
| `year` | number | ✅ | ✅ | ✅ | 真题年份 |
| `group` | `"J"`/`"S"` | ✅ | ✅ | ✅ | 组别 |
| `type` | `"choice"`/`"reading"`/`"fillBlank"` | ✅ | ✅ | ✅ | 题型 |
| `knowledgePoint` | string | ✅ | ✅ | ✅ | 知识点标签 |
| `difficulty` | 1-5 | ✅ | ✅ | ✅ | 难度（MVP 阶段预留字段，暂不启用排序/筛选，后续可加"从易到难"模式） |
| `question` | string | ✅ | ✅ | ✅ | 题目文本（支持 HTML） |
| `code` | string? | 可选 | 可选 | 可选 | C++ 代码，三种题型都可有 |
| `image` | string? | 可选 | 可选 | 可选 | 图片 URL/path，三种题型都可有 |
| `options` | string[4] | ✅ | ❌ | ❌ | 选择题 4 个选项 |
| `correctIndex` | number | ✅ | ❌ | ❌ | 正确选项索引 |
| `subQuestions` | array | ❌ | ✅ | ❌ | 程序阅读的子问题，每项含 `label/options/correctIndex/explanation` |
| `blanks` | array | ❌ | ❌ | ✅ | 程序填空的空位，每项含 `position/options/correctIndex/explanation` |
| `explanation` | string | ✅ | ❌ | ✅ | 解析 |

## 四、奖励机制

### 4.1 每日任务

- **任务内容：** 完成 3 道不同的选择题 + (1 道不同的程序阅读题 或 1 道不同的程序填空题)
- **奖励：** +20 EXP +12 金币（≈ 日签水平）
- **判定条件：**
  1. **答对才算**：做错不计数，只有答对才推进每日任务进度
  2. 同一道题只计一次（记录已做题目的 ID 集合，防止反复做同一题刷奖励）
  3. 选择题：每题答对（`correctIndex === selected`）才 +1 进度
  4. 程序阅读/填空：提交后答对半数以上子问题/空位才算完成（5小问≥3对，4小问≥2对，3小问≥2对）
- **重置：** 每天 0 点重置（使用 `new Date().toISOString().slice(0, 10)`）
- **超出部分：** 无额外奖励（MVP 阶段，后续可加微量奖励）

### 4.2 和现有奖励对比

| | 每日任务 | 每周任务 | 自由练习 | 签到 |
|---|---|---|---|---|
| 频率 | 每天一次 | 每周一次 | 不限 | 每周一次 |
| 题量 | 3选择+1阅读/填空 | 5选择 | 自选15 | 0 |
| 要求 | 答对才算 | 需要答对 | 不限 | 无需答题 |
| 经验 | +20 | +75 (5×15) | +45 (15×3) | +50 |
| 金币 | +12 | +40 (5×8) | +45 (15×3) | +50 |

梯度合理：日签 ≈ 真题每日 ≈ 每天一点点 < 每周任务 < 自由练习（量大）。

### 4.3 奖励发放

完成最后一道满足条件的题时弹轻提示：

```
🎉 今日任务完成！
+20 EXP  +12 金币
────────────────
明天继续加油！
      [知道了]
```

### 4.4 奖励发放实现

`claimExamDailyReward()` 方法内部直接调用 petStore。**关键顺序：先设 guard flag，再发奖励，防止重复领取。**

```typescript
claimExamDailyReward(): { exp: number; coins: number } | null {
  const s = get();
  // 重新验证条件（防止 race condition）
  if (s.examDailyClaimed) return null;
  if (!get().canClaimExamDaily()) return null;

  // 1) 先设 guard flag，防止重复领取
  set({ examDailyClaimed: true });

  // 2) 再发奖励
  const reward = { exp: 20, coins: 12 };
  const petStore = usePetStore.getState();
  const activePetId = petStore.activePetId;
  if (activePetId) petStore.addExp(activePetId, reward.exp);
  const mult = petStore.getRewardMultiplier();
  petStore.addCoins(Math.floor(reward.coins * mult));

  get().save();
  return reward;
}
```

## 五、防刷机制

### 5.1 题目去重 + 正确率

每次作答提交后，如果答对（选择题：`correctIndex === selected`；程序阅读/填空：过半数子问题答对），将该题目的完成记录加入 `examDailyCompleted` 数组。**答错不记录，不推进进度。**

```typescript
examDailyCompleted: { id: string; type: 'choice'|'reading'|'fillBlank' }[]
```

存入数组的只有答对的题目。同一题只记录一次（按 `id` 去重）。

### 5.2 正确率要求

- **选择题：** 每题独立判定，答对才计入进度。答错不计入、不重复做同一题。
- **程序阅读/填空：** 提交后整体判定，答对半数以上子问题/空位才算完成：
  - 5 小问 ≥ 3 对 → 计入进度
  - 4 小问 ≥ 2 对 → 计入进度
  - 3 小问 ≥ 2 对 → 计入进度
  - 未过半 → 不计入，可换一道题重新做

这样乱点 ABCD 的选择题正确率只有 25%，基本推不动进度，促使孩子认真思考。

### 5.3 饥饿消耗

CSP 真题做题也消耗饥饿值，和现有选择题一致：每做 2 道题 `tickHunger()` 一次。不需要额外的计数器——直接从 `examDailyCompleted.length` 推导：`completeExamQuestion` 新增记录后，若 `examDailyCompleted.length % 2 === 1`（第 1、3、5...次提交），调用 `usePetStore.getState().tickHunger()`。

## 六、边界处理

### 6.1 题库为空或不足

题型卡片显示当前可用题目数。如果某题型/组别可用题目 < 每日需求数（选择 < 3，阅读 < 1，填空 < 1），卡片置灰并显示"题目准备中"。

### 6.2 JSON 加载失败 & 缓存

ExamTraining 组件维护 loading/error 状态。加载失败时显示错误提示 + 重试按钮，参考 OJTraining 的处理方式。

**缓存策略：** 首次加载后缓存到 localStorage（key: `csp_exam_bank`），后续访问直接从缓存读取。和现有 `csp_quiz_bank` 的缓存模式一致。远程题库更新时由 App.tsx 的 `loadCourseData` 统一刷新缓存。

### 6.3 localStorage 数据损坏

quizStore `load()` 中对所有新字段做安全默认值处理。日期格式统一使用 `new Date().toISOString().slice(0, 10)`（`YYYY-MM-DD`），和现有 stores 保持一致：

```typescript
examDailyDate: data.examDailyDate || '',
examDailyCompleted: data.examDailyCompleted || [],
examDailyClaimed: data.examDailyClaimed || false,
examGroup: data.examGroup || null,
```

如果 `examDailyDate !== 今天的日期字符串`，重置所有计数字段（`examDailyCompleted = []`、`examDailyClaimed = false`）。

**重要：** quizStore 的 `save()` 方法（现约第 308-332 行）显式枚举所有序列化字段。新增的 exam 字段必须同步加入 `save()` 的 JSON.stringify 和 `load()` 的 hydrate 逻辑，否则字段会在应用重启后丢失，导致每日任务进度消失 + 可无限重领奖励。

### 6.4 切换组别

允许随时切换组别（J ↔ S），每日任务进度不重置（两个组别的题目都计入同一个每日任务）。`examGroup` 只记录最后一次选择的组别，作为下次打开的默认值。

## 七、和现有系统的衔接

### 7.1 错题打通

```
CSP 真题做错
  → quizStore.addError(题目ID, 我的答案, 正确答案, 知识点)
  → 错题池 (quizStore.errors)
  → 月度复盘统一重做
```

**程序阅读/填空题的子问题错题：**
- 错误记录以父题目 ID 为准（如 `csp-j-2019-02`），`wrongAnswer` 字段记录答错的子问题数
- 这样父 ID 在月度复盘时作为错题出现，学生重新做该题的全部子问题
- MVP 阶段暂不逐子问题追踪；后续可扩展月度复盘同时加载 `csp-exam-bank.json` 来支持逐子问题复盘

### 7.2 现有系统不变

| 模块 | 是否改动 |
|------|---------|
| 选择题页面 (QuizPractice.tsx) | ❌ 不动 |
| quizStore 现有方法签名 | ❌ 不动（`addError` 签名不变） |
| unified-quiz-bank.json | ❌ 不动 |
| 超级挑战 | ❌ 不动 |

**注：** quizStore `save()` 和 `load()` 需要加入新字段的序列化/反序列化，这是对现有方法的必要扩展，不改变其对外接口。

### 7.3 新增内容

| 内容 | 位置 |
|------|------|
| CSP 真题题库 | `public/course-data/csp-exam-bank.json` |
| 真题训练主页面 | `src/components/exam/ExamTraining.tsx` |
| 选择题组件 | `src/components/exam/ExamChoice.tsx` |
| 复合题组件（阅读+填空共用） | `src/components/exam/ExamMultiPart.tsx` |
| 每日任务状态 | `quizStore` 新增字段和方法 |

## 八、组件树

```
App.tsx
├── Route /exam → ExamTraining
│   ├── 选组别界面 (J / S)
│   ├── 每日任务进度条
│   ├── 选题型卡片 (选择/阅读/填空)
│   └── 做题界面
│       ├── ExamChoice    → 选择题（每道独立 ABCD）
│       └── ExamMultiPart → 程序阅读 & 程序填空（代码块 + N 个子项 ABCD，全部一起提交）
│           ↑ 阅读和填空合并为一个组件，区别仅在于子项数据来源（subQuestions vs blanks）
│
AppShell.tsx
└── sidebar
    └── NavLink to="/exam"   ← 新增
```

## 九、store 扩展 (quizStore)

新增字段和方法（只加不修。确保新增字段同步加入 `save()` 的 JSON.stringify 和 `load()` 的 hydrate）：

```typescript
// 新增字段
examDailyDate: string;              // 每日任务日期 (YYYY-MM-DD，与现有 toISOString().slice(0,10) 一致)
examDailyCompleted: {               // 今日答对的题目记录（只存答对的，用于去重+统计）
  id: string;
  type: 'choice' | 'reading' | 'fillBlank';
}[];
examDailyClaimed: boolean;          // 今日奖励是否已领取
examGroup: 'J' | 'S' | null;       // 当前选择的组别

// 新增方法
completeExamQuestion(questionId: string, type: 'choice'|'reading'|'fillBlank', isCorrect: boolean): void;
canClaimExamDaily(): boolean;
claimExamDailyReward(): { exp: number; coins: number } | null;
```

### 方法逻辑

**`completeExamQuestion(id, type, isCorrect)`：**
1. 如果 `!isCorrect`：只调 `recordAnswer(false)` + `addError`（写入错题池），**不计入 examDailyCompleted**，直接返回
2. 如果 `id` 已在 `examDailyCompleted` 中（按 id 查重），跳过
3. 加入记录：`examDailyCompleted = [...prev, { id, type }]`
4. 调用 `quizStore.recordAnswer(true)` — 统一计入总练习统计
5. 如果 `examDailyCompleted.length % 2 === 1`，调用 `usePetStore.getState().tickHunger()`
6. 调用 `save()`

> **程序阅读/填空的 isCorrect 判定：** 由 ExamMultiPart 组件在提交时计算：答对子问题数 / 总子问题数 ≥ 50% → `isCorrect = true`。

> **日期重置集中化：** 日期检查和重置只在 `load()` 中进行（见 6.3）。`completeExamQuestion` 不再做日期检查——`load()` 在组件挂载时已完成归零，运行时跨午夜是极边缘情况，不做额外处理。

**`canClaimExamDaily()`：** (数组里只有答对的题，直接统计类型)
```typescript
canClaimExamDaily(): boolean {
  const s = get();
  if (s.examDailyClaimed) return false;
  let choiceCount = 0, hasReadingOrFill = false;
  for (const r of s.examDailyCompleted) {
    if (r.type === 'choice') choiceCount++;
    else hasReadingOrFill = true;
  }
  return choiceCount >= 3 && hasReadingOrFill;
}
```

### 性能注意事项

- **`save()` 调频：** `completeExamQuestion` 每道题调用 `save()`。单次会话最多 4-5 道题/天，4-5 次 `dualSave` 调用可接受。如果未来扩展为大量刷题模式，考虑改为组件卸载时统一保存。
- **奖励发放：** `claimExamDailyReward()` 中 `petStore.addExp()` 和 `addCoins()` 各自内部调了 `petStore.save()`。由于每日只领一次，3 次 save 的开销可接受。不在此 spec 中重构 petStore 的 save 策略。

### UI 复用清单

为避免重复造轮子，以下现有工具和样式必须复用：

| 现有资源 | 位置 | 用途 |
|---------|------|------|
| `renderCodeText()` | `src/utils/markdown.ts` | 渲染题目文本中的代码块和图片 |
| `.code-block` | `App.css:742-766` | 代码展示块 |
| `.quiz-opt` / `.quiz-options` / `.quiz-radio` | `App.css:598-611` | 选择题 ABCD 选项 |
| `.quiz-submit-btn` | `App.css:782-788` | 提交按钮 |
| `.quiz-feedback` | `App.css:775-778` | 答题反馈面板 |
| `.super-answers` / `.super-opt` / `.super-q-num` | `App.css:684-697` | 程序阅读/填空的子问题选项 |
| `shuffle()` | `QuizPractice.tsx:42-49` | 题目随机排序 |
| `dualSave` / `dualLoad` | `src/lib/persist.ts` | SQLite+localStorage 双持久化 |

## 十、题库整理计划

收集 CSP-J/S 历年真题（2019-2024），按格式录入 `csp-exam-bank.json`：

| 年份 | CSP-J 选择题 | CSP-J 阅读 | CSP-J 填空 | CSP-S 选择题 | CSP-S 阅读 | CSP-S 填空 |
|------|-------------|-----------|-----------|-------------|-----------|-----------|
| 2019 | 15 | 1 | 1 | 15 | 1 | 1 |
| 2020 | 15 | 1 | 1 | 15 | 1 | 1 |
| 2021 | 15 | 1 | 1 | 15 | 1 | 1 |
| 2022 | 15 | 1 | 1 | 15 | 1 | 1 |
| 2023 | 15 | 1 | 1 | 15 | 1 | 1 |
| 2024 | 15 | 1 | 1 | 15 | 1 | 1 |

每题程序阅读/填空含 3-5 小问/空位，数据整理工作独立于代码开发。

---

## 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-11 | 初版 |
| v1.2 | 2026-06-11 | code-review 审查修复：改 `examDailyCompletedIds` 为含 type 的结构数组（解决 canClaimExamDaily 无法判断题型）、奖励发放先设 guard 再发奖（防重复领取）、子问题错题改用父 ID 存储（月复盘可见）、加 `examHungerTickCounter`、统一日期格式为 toISOString、加 UI 复用清单 |
| v1.3 | 2026-06-11 | simplify 审查修复：移除 examHungerTickCounter（从数组长度推导）、日期重置集中到 load()、合并 ExamReading+ExamFillBlank 为 ExamMultiPart、合并 canClaimDailyInternal 到 canClaimExamDaily（单次遍历）、加题库 localStorage 缓存、加 recordAnswer/addError 调用、renderCodeText 渲染说明、difficulty 标为预留 |
| v1.4 | 2026-06-11 | 正确率策略调整：答错不计入进度、选择题每题答对才+1、程序阅读/填空过半数对才算、examDailyCompleted 只存答对记录 |
