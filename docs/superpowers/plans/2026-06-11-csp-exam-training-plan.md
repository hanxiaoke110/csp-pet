# CSP 真题训练 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Tauri 桌面应用中新增"🏅 CSP 真题"页面，支持 CSP-J/S 组别选择，按题型（选择/阅读/填空）混抽历年真题，每日任务制奖励。

**Architecture:** 3 层页面（选组别 → 选题型 → 做题），程序阅读和填空合并为 ExamMultiPart 组件（复用超级挑战 UI），选择题用 ExamChoice 组件（复用现有 ABCD UI），quizStore 新增字段和方法（只加不修）。

**Tech Stack:** React + TypeScript + Zustand (quizStore) + 现有 quiz CSS

**Spec:** `docs/superpowers/specs/2026-06-11-csp-exam-training-design.md`

---

## File Map

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `src/stores/quizStore.ts` | 新增 exam 字段 + 3 方法，扩展 save/load |
| Create | `public/course-data/csp-exam-bank.json` | CSP-J/S 历年真题题库 |
| Create | `src/components/exam/ExamMultiPart.tsx` | 程序阅读+填空共用组件（代码块+N子项ABCD） |
| Create | `src/components/exam/ExamChoice.tsx` | 选择题组件（复用 ABCD UI） |
| Create | `src/components/exam/ExamTraining.tsx` | 主页面（组别选择+题型选择+每日任务进度） |
| Modify | `src/App.tsx` | 加 import + Route |
| Modify | `src/components/layout/AppShell.tsx` | 加侧边栏 NavLink |

---

### Task 1: 扩展 quizStore — 新增字段和初始值

**Files:**
- Modify: `src/stores/quizStore.ts:23-44` (QuizState interface)
- Modify: `src/stores/quizStore.ts:92-110` (initial state)

- [ ] **Step 1: 在 QuizState interface 中新增字段**

在 `totalCorrect: number;` (line 44) 之后、`addError:` (line 46) 之前，添加：

```typescript
// CSP 真题训练
examDailyDate: string;
examDailyCompleted: { id: string; type: 'choice' | 'reading' | 'fillBlank' }[];
examDailyClaimed: boolean;
examGroup: 'J' | 'S' | null;
```

在方法签名区域 (line 63, `save: () => void;` 之后) 添加：

```typescript
// CSP 真题训练方法
completeExamQuestion: (questionId: string, type: 'choice' | 'reading' | 'fillBlank', isCorrect: boolean) => void;
canClaimExamDaily: () => boolean;
claimExamDailyReward: () => { exp: number; coins: number } | null;
```

- [ ] **Step 2: 在初始状态中添加默认值**

在 `totalCorrect: 0,` (line 110) 之后、`addError:` (line 112) 之前，添加：

```typescript
// CSP 真题训练
examDailyDate: '',
examDailyCompleted: [],
examDailyClaimed: false,
examGroup: null,
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/quizStore.ts
git commit -m "feat(quizStore): add CSP exam fields and method signatures"
```

---

### Task 2: 扩展 quizStore — 新增方法实现

**Files:**
- Modify: `src/stores/quizStore.ts:273` (after errorCount)

- [ ] **Step 1: 实现 completeExamQuestion 方法**

在 `errorCount: () => get().errors.length,` (line 273) 之后、`load:` (line 275) 之前，添加：

```typescript
completeExamQuestion: (questionId, type, isCorrect) => {
  const s = get();
  if (!isCorrect) {
    // 答错：只记错题池和统计，不推进进度
    s.recordAnswer(false);
    return; // addError 由调用方传具体参数
  }
  // 答对：去重后加入 examDailyCompleted
  if (s.examDailyCompleted.some(r => r.id === questionId)) return;
  set(state => ({
    examDailyCompleted: [...state.examDailyCompleted, { id: questionId, type }],
  }));
  s.recordAnswer(true);
  // 每 2 题 tick hunger
  const newLen = get().examDailyCompleted.length;
  if (newLen % 2 === 1) {
    try { usePetStore.getState().tickHunger(); } catch {}
  }
  get().save();
},
```

- [ ] **Step 2: 实现 canClaimExamDaily 方法**

在 `completeExamQuestion` 之后、`load:` 之前，添加：

```typescript
canClaimExamDaily: () => {
  const s = get();
  if (s.examDailyClaimed) return false;
  let choiceCount = 0, hasReadingOrFill = false;
  for (const r of s.examDailyCompleted) {
    if (r.type === 'choice') choiceCount++;
    else hasReadingOrFill = true;
  }
  return choiceCount >= 3 && hasReadingOrFill;
},
```

- [ ] **Step 3: 实现 claimExamDailyReward 方法**

在 `canClaimExamDaily` 之后、`load:` 之前，添加：

```typescript
claimExamDailyReward: () => {
  const s = get();
  if (s.examDailyClaimed) return null;
  if (!s.canClaimExamDaily()) return null;
  // 先设 guard flag，防止重复领取
  set({ examDailyClaimed: true });
  // 再发奖励
  const reward = { exp: 20, coins: 12 };
  const petStore = usePetStore.getState();
  const activePetId = petStore.activePetId;
  if (activePetId) petStore.addExp(activePetId, reward.exp);
  const mult = petStore.getRewardMultiplier();
  petStore.addCoins(Math.floor(reward.coins * mult));
  get().save();
  return reward;
},
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/quizStore.ts
git commit -m "feat(quizStore): implement CSP exam completeQuestion/canClaim/claimReward methods"
```

---

### Task 3: 扩展 quizStore — save/load 加入新字段

**Files:**
- Modify: `src/stores/quizStore.ts:275-306` (load hydrate)
- Modify: `src/stores/quizStore.ts:308-332` (save serialize)

- [ ] **Step 1: 在 load() 的 hydrate 中添加新字段**

在 `load()` 方法内的 `hydrate` 函数中，`set({` 块内的 `extraChallengeDone:` 行 (line 300) 之后、`});` 之前：

```typescript
// CSP 真题训练 — 每日重置
examDailyCompleted: data.examDailyDate === today ? (data.examDailyCompleted || []) : [],
examDailyClaimed: data.examDailyDate === today ? (data.examDailyClaimed || false) : false,
examDailyDate: data.examDailyDate || today,
examGroup: data.examGroup || null,
```

- [ ] **Step 2: 在 save() 的 JSON.stringify 中添加新字段**

在 `save()` 方法内的 `json = JSON.stringify({` 块中，`extraChallengeDone: s.extraChallengeDone,` (line 328) 之后、`});` 之前：

```typescript
examDailyDate: s.examDailyDate,
examDailyCompleted: s.examDailyCompleted,
examDailyClaimed: s.examDailyClaimed,
examGroup: s.examGroup,
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/quizStore.ts
git commit -m "feat(quizStore): add CSP exam fields to save/load persistence"
```

---

### Task 4: 创建 CSP 真题题库

**Files:**
- Create: `public/course-data/csp-exam-bank.json`

- [ ] **Step 1: 创建题库文件，包含 2019 CSP-J 真题作为种子数据**

```json
{
  "questions": [
    {
      "id": "csp-j-2019-01",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "计算机基础",
      "difficulty": 1,
      "question": "中国的国家顶级域名是（ ）",
      "options": [".cn", ".ch", ".chn", ".china"],
      "correctIndex": 0,
      "explanation": "中国的国家顶级域名是 .cn"
    },
    {
      "id": "csp-j-2019-02",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "进制转换",
      "difficulty": 1,
      "question": "二进制数 00101100 和 00010101 的和是（ ）",
      "options": ["00101000", "01000001", "01000100", "00111000"],
      "correctIndex": 1,
      "explanation": "00101100₂ = 44, 00010101₂ = 21, 44+21=65=01000001₂"
    },
    {
      "id": "csp-j-2019-03",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "计算机基础",
      "difficulty": 1,
      "question": "一个 32 位整型变量占用（ ）个字节",
      "options": ["32", "128", "4", "8"],
      "correctIndex": 2,
      "explanation": "32位 = 4字节（1字节=8位）"
    },
    {
      "id": "csp-j-2019-04",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "算法基础",
      "difficulty": 1,
      "question": "设有 100 个数据元素，采用折半查找时，最大比较次数为（ ）",
      "options": ["6", "7", "8", "10"],
      "correctIndex": 1,
      "explanation": "⌈log₂(100+1)⌉ = ⌈log₂101⌉ ≈ 7"
    },
    {
      "id": "csp-j-2019-05",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "数据结构",
      "difficulty": 2,
      "question": "链表不具有的特点是（ ）",
      "options": ["不必事先估计存储空间", "可随机访问任一元素", "插入删除不需要移动元素", "所需空间与线性表长度成正比"],
      "correctIndex": 1,
      "explanation": "链表不能随机访问，需要从头遍历"
    },
    {
      "id": "csp-j-2019-06",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "数据结构",
      "difficulty": 2,
      "question": "线性表若采用链表存储结构，要求内存中可用存储单元地址（ ）",
      "options": ["必须连续", "部分地址必须连续", "一定不连续", "连续不连续均可"],
      "correctIndex": 3,
      "explanation": "链表节点通过指针链接，内存可以不连续"
    },
    {
      "id": "csp-j-2019-07",
      "year": 2019, "group": "J", "type": "choice",
      "knowledgePoint": "数据结构",
      "difficulty": 2,
      "question": "设栈 S 和队列 Q 的初始状态均为空，元素 a,b,c,d,e,f,g 依次进入栈 S。若每个元素出栈后立即进入队列 Q，且7个元素出队的顺序是 b,d,c,f,e,a,g，则栈 S 的容量至少是（ ）",
      "options": ["1", "2", "3", "4"],
      "correctIndex": 2,
      "explanation": "分析出队顺序 b→d→c→f→e→a→g，对应入栈过程：a入→b入→b出→c入→d入→d出→c出→e入→f入→f出→e出→a出→g入→g出。栈中最多同时存 a,c,d 或 a,e,f，即 3 个元素。"
    },
    {
      "id": "csp-j-2019-reading-01",
      "year": 2019, "group": "J", "type": "reading",
      "knowledgePoint": "循环与数组",
      "difficulty": 2,
      "question": "阅读程序，判断输出结果",
      "code": "#include <cstdio>\n#include <cstring>\nusing namespace std;\nchar st[100];\nint main() {\n  scanf(\"%s\", st);\n  int n = strlen(st);\n  for (int i = 1; i <= n; ++i) {\n    if (n % i == 0) {\n      char c = st[i - 1];\n      if (c >= 'a')\n        st[i - 1] = c - 'a' + 'A';\n    }\n  }\n  printf(\"%s\", st);\n  return 0;\n}",
      "subQuestions": [
        { "label": "输入 \"abcdef\"，输出是（ ）", "options": ["ABCDEF", "AbCdEf", "Abcdef", "aBcDeF"], "correctIndex": 1, "explanation": "n=6，i=1,2,3,6 整除6。i=1:c='a'→'A'；i=2:c='b'→'B'；i=3:c='c'→'C'；i=6:c='f'→'F'。结果 AbCdEf" },
        { "label": "输入 \"abcde\"，输出是（ ）", "options": ["ABCDE", "AbCdE", "abcde", "Abcde"], "correctIndex": 1, "explanation": "n=5，i=1,5 整除5。i=1:c='a'→'A'；i=5:c='e'→'E'。结果 AbCdE（第2、3位未变）" },
        { "label": "该程序的功能是（ ）", "options": ["将所有字母转大写", "将约数位置的字母转大写", "将质数位置的字母转大写", "反转字符串"], "correctIndex": 1, "explanation": "对每个位置i，如果i是n的约数则将对应字符转大写" }
      ]
    },
    {
      "id": "csp-j-2019-fillblank-01",
      "year": 2019, "group": "J", "type": "fillBlank",
      "knowledgePoint": "枚举算法",
      "difficulty": 2,
      "question": "（枚举因数）从小到大输出正整数 n 的所有因数。",
      "code": "#include <iostream>\nusing namespace std;\nint main() {\n  int n;\n  cin >> n;\n  for (int i = 1; i <= __1__; i++) {\n    if (__2__) {\n      cout << i << \" \";\n      if (i != n / i)\n        cout << n / i << \" \";\n    }\n  }\n  return 0;\n}",
      "blanks": [
        { "position": 1, "options": ["n", "sqrt(n)", "n/2", "n/i"], "correctIndex": 1, "explanation": "枚举到 sqrt(n)，用配对的 n/i 输出另一半" },
        { "position": 2, "options": ["n % i == 0", "n == i * i", "i <= n", "n / i > 0"], "correctIndex": 0, "explanation": "n%i==0 判断 i 是否是 n 的因数" }
      ],
      "explanation": "优化枚举因数：只需枚举到 √n，每找到一个因数 i，同时输出配对的 n/i"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/course-data/csp-exam-bank.json
git commit -m "feat: add CSP-J 2019 seed exam questions (8 choice + 1 reading + 1 fillBlank)"
```

---

### Task 5: 构建 ExamMultiPart 组件（程序阅读+填空）

**Files:**
- Create: `src/components/exam/ExamMultiPart.tsx`

- [ ] **Step 1: 创建 ExamMultiPart.tsx**

```typescript
import { useState } from 'react';
import { renderCodeText } from '../../utils/markdown';

export interface SubItem {
  label: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface Props {
  title: string;           // e.g. "📖 程序阅读 · CSP-J 2019 · 3小问"
  code?: string | null;
  question: string;
  subItems: SubItem[];
  onSubmit: (correctCount: number, total: number) => void;
  onBack: () => void;
}

export default function ExamMultiPart({ title, code, question, subItems, onSubmit, onBack }: Props) {
  const [answers, setAnswers] = useState<number[]>(Array(subItems.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = answers.every(a => a >= 0);

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    let correct = 0;
    for (let i = 0; i < subItems.length; i++) {
      if (answers[i] === subItems[i].correctIndex) correct++;
    }
    onSubmit(correct, subItems.length);
  };

  const passThreshold = subItems.length >= 5 ? 3 : 2; // 5问≥3, 3-4问≥2

  return (
    <div className="quiz-practice">
      <div className="quiz-question-header">
        <span className="quiz-mode-label">⚡ CSP 真题</span>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
          ← 返回
        </button>
      </div>

      <div className="quiz-question-card">
        <div className="quiz-q-body">
          <span style={{ color: '#64748b', fontSize: 13 }}>{title}</span>
        </div>
      </div>

      {code && (
        <div className="quiz-question-card" style={{ marginTop: 0 }}>
          <pre className="code-block"><code>{code}</code></pre>
        </div>
      )}

      <div className="quiz-question-card" style={{ marginTop: 0 }}>
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderCodeText(question)} />
        <h4 style={{ marginTop: 16, marginBottom: 12 }}>请作答（共 {subItems.length} 小问，答对 ≥{passThreshold} 问算完成）</h4>

        <div className="super-answers" style={{ maxHeight: 'none', overflowY: 'visible' }}>
          {subItems.map((item, i) => (
            <div key={i} className="super-answer-row" style={{
              background: submitted
                ? (answers[i] === item.correctIndex ? '#f0fdf4' : '#fef2f2')
                : 'transparent',
              borderRadius: 8, padding: 8, marginBottom: 4,
            }}>
              <span className="super-q-num">{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 500 }}>{item.label}</div>
                <div className="super-options">
                  {['A', 'B', 'C', 'D'].map((opt, oi) => {
                    let className = 'super-opt';
                    if (submitted) {
                      if (oi === item.correctIndex) className += ' selected';
                      else if (answers[i] === oi && oi !== item.correctIndex) className += ' wrong';
                    } else if (answers[i] === oi) {
                      className += ' selected';
                    }
                    return (
                      <label
                        key={opt}
                        className={className}
                        onClick={() => {
                          if (submitted) return;
                          const a = [...answers]; a[i] = oi; setAnswers(a);
                        }}
                      >
                        {opt}
                      </label>
                    );
                  })}
                </div>
                {submitted && answers[i] !== item.correctIndex && item.explanation && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{item.explanation}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quiz-actions">
        {!submitted ? (
          <button className="quiz-submit-btn" disabled={!allAnswered} onClick={handleSubmit}>
            提交答案
          </button>
        ) : (
          <button className="quiz-submit-btn" onClick={onBack}>
            返回选题
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/exam/ExamMultiPart.tsx
git commit -m "feat: add ExamMultiPart component for CSP reading + fillBlank questions"
```

---

### Task 6: 构建 ExamChoice 组件

**Files:**
- Create: `src/components/exam/ExamChoice.tsx`

- [ ] **Step 1: 创建 ExamChoice.tsx**

```typescript
import { useState } from 'react';
import { renderCodeText } from '../../utils/markdown';

interface ChoiceQuestion {
  id: string;
  year: number;
  group: string;
  type: 'choice';
  knowledgePoint: string;
  difficulty: number;
  question: string;
  code?: string | null;
  image?: string | null;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  question: ChoiceQuestion;
  questionNum: number;       // e.g. "第 2/3 题"
  onAnswer: (id: string, correct: boolean) => void;
  onNext: () => void;
}

export default function ExamChoice({ question: q, questionNum, onAnswer, onNext }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (selected === null || submitted) return;
    setSubmitted(true);
    onAnswer(q.id, selected === q.correctIndex);
  };

  return (
    <div className="quiz-practice">
      <div className="quiz-question-header">
        <span className="quiz-mode-label">📝 CSP 选择题</span>
        <span className="quiz-progress">{questionNum}</span>
        <span className="quiz-kp">{q.knowledgePoint} · {q.year}</span>
      </div>

      <div className="quiz-question-card">
        {q.code && (
          <pre className="code-block"><code>{q.code}</code></pre>
        )}
        <div className="quiz-q-body" dangerouslySetInnerHTML={renderCodeText(q.question)} />

        <div className="quiz-options">
          {q.options.map((opt, i) => {
            let cls = 'quiz-opt';
            if (submitted) {
              if (i === q.correctIndex) cls += ' correct';
              else if (i === selected && i !== q.correctIndex) cls += ' wrong';
            } else if (selected === i) {
              cls += ' selected';
            }
            return (
              <label key={i} className={cls} onClick={() => !submitted && setSelected(i)}>
                <span className="quiz-radio">{String.fromCharCode(65 + i)}</span>
                <span className="quiz-opt-text" dangerouslySetInnerHTML={renderCodeText(opt)} />
              </label>
            );
          })}
        </div>

        {submitted && (
          <div className={`quiz-feedback ${selected === q.correctIndex ? 'correct' : 'wrong'}`}>
            <strong>{selected === q.correctIndex ? '✅ 回答正确！' : '❌ 回答错误'}</strong>
            {q.explanation && <p dangerouslySetInnerHTML={renderCodeText(q.explanation)} />}
            {selected !== q.correctIndex && (
              <p className="correct-answer">正确答案是 {String.fromCharCode(65 + q.correctIndex)}</p>
            )}
          </div>
        )}
      </div>

      <div className="quiz-actions">
        {!submitted ? (
          <button className="quiz-submit-btn" disabled={selected === null} onClick={handleSubmit}>
            提交答案
          </button>
        ) : (
          <button className="quiz-submit-btn" onClick={onNext}>
            下一题 →
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/exam/ExamChoice.tsx
git commit -m "feat: add ExamChoice component for CSP multiple-choice questions"
```

---

### Task 7: 构建 ExamTraining 主页面

**Files:**
- Create: `src/components/exam/ExamTraining.tsx`

- [ ] **Step 1: 创建 ExamTraining.tsx**

```typescript
import { useState, useEffect, useMemo } from 'react';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import ExamChoice from './ExamChoice';
import ExamMultiPart from './ExamMultiPart';
import { emit } from '@tauri-apps/api/event';
import { renderCodeText } from '../../utils/markdown';

interface ExamQuestion {
  id: string;
  year: number;
  group: 'J' | 'S';
  type: 'choice' | 'reading' | 'fillBlank';
  knowledgePoint: string;
  difficulty: number;
  question: string;
  code?: string | null;
  image?: string | null;
  options?: string[];
  correctIndex?: number;
  subQuestions?: { label: string; options: string[]; correctIndex: number; explanation?: string }[];
  blanks?: { position: number; options: string[]; correctIndex: number; explanation?: string }[];
  explanation?: string;
}

type View = 'group' | 'type-select' | 'choice-answer' | 'multipart-answer';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STORAGE_KEY = 'csp_exam_group';

export default function ExamTraining() {
  const [bank, setBank] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<'J' | 'S'>(() => {
    return (localStorage.getItem(STORAGE_KEY) as 'J' | 'S') || 'J';
  });
  const [view, setView] = useState<View>('group');
  const [activeType, setActiveType] = useState<'choice' | 'reading' | 'fillBlank' | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  const examStore = useQuizStore();
  const hasPet = usePetStore(s => s.ownedPets.length > 0);

  // Load bank
  useEffect(() => {
    const cached = localStorage.getItem('csp_exam_bank');
    if (cached) {
      try { const d = JSON.parse(cached); if (d.questions?.length) { setBank(d.questions); setLoading(false); return; } } catch {}
    }
    fetch('/course-data/csp-exam-bank.json')
      .then(r => r.json())
      .then(data => {
        setBank(data.questions || []);
        localStorage.setItem('csp_exam_bank', JSON.stringify(data));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Group filtered bank
  const groupBank = useMemo(() => bank.filter(q => q.group === group), [bank, group]);

  const choiceQs = useMemo(() => groupBank.filter(q => q.type === 'choice'), [groupBank]);
  const readingQs = useMemo(() => groupBank.filter(q => q.type === 'reading'), [groupBank]);
  const fillBlankQs = useMemo(() => groupBank.filter(q => q.type === 'fillBlank'), [groupBank]);

  const completed = examStore.examDailyCompleted;
  const choiceDone = completed.filter(r => r.type === 'choice').length;
  const readingOrFillDone = completed.some(r => r.type === 'reading' || r.type === 'fillBlank');

  // Gate: must have pet
  if (!hasPet) {
    return (
      <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🐾</div>
        <h2>请先领养一只灵犀智子！</h2>
        <p style={{ color: '#64748b', marginBottom: 20 }}>CSP 真题训练需要宠物来接收奖励，先去挑选你的学习伙伴吧。</p>
      </div>
    );
  }

  if (loading) return <div className="oj-training"><div className="loading-spinner" /><p>加载题库中...</p></div>;
  if (error) return (
    <div className="oj-training" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: '#ef4444' }}>题库加载失败：{error}</p>
      <button className="mode-btn" onClick={() => { setError(null); setLoading(true); fetch('/course-data/csp-exam-bank.json').then(r => r.json()).then(d => { setBank(d.questions || []); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }}>重试</button>
    </div>
  );

  const startPractice = (type: 'choice' | 'reading' | 'fillBlank') => {
    setActiveType(type);
    if (type === 'choice') {
      const pool = choiceQs.filter(q => !completed.some(r => r.id === q.id));
      setQuestions(shuffle(pool));
      setCurrentIdx(0);
      setView('choice-answer');
    } else {
      const pool = (type === 'reading' ? readingQs : fillBlankQs).filter(q => !completed.some(r => r.id === q.id));
      setQuestions(shuffle(pool));
      setCurrentIdx(0);
      setView('multipart-answer');
    }
  };

  const handleChoiceAnswer = (id: string, correct: boolean) => {
    const q = questions[currentIdx];
    examStore.completeExamQuestion(id, 'choice', correct);
    if (!correct && q) {
      const kp = (q as any).knowledgePoint || '';
      examStore.addError(id, 0 /* wrong option tracked by question */, (q as any).correctIndex || 0, kp);
    }
    if (!correct) {
      emit('pet-bubble', { text: '没关系，再看看解析！💡' }).catch(() => {});
    }
  };

  const handleChoiceNext = () => {
    if (currentIdx + 1 >= questions.length) {
      setView('type-select');
      return;
    }
    setCurrentIdx(i => i + 1);
  };

  const handleMultiPartSubmit = (correctCount: number, total: number) => {
    const q = questions[currentIdx];
    const pass = total >= 5 ? correctCount >= 3 : correctCount >= 2;
    examStore.completeExamQuestion(q.id, activeType as 'reading' | 'fillBlank', pass);
    if (!pass) {
      const kp = (q as any).knowledgePoint || '';
      examStore.addError(q.id, total - correctCount, correctCount, kp);
      emit('pet-bubble', { text: `答对 ${correctCount}/${total}，未过半，换一道试试？💪` }).catch(() => {});
    } else {
      emit('pet-bubble', { text: `答对 ${correctCount}/${total}，漂亮！🎉` }).catch(() => {});
    }
  };

  const handleMultiPartBack = () => {
    setView('type-select');
  };

  const claimReward = () => {
    const result = examStore.claimExamDailyReward();
    if (result) {
      emit('pet-anim', { anim: 'celebrate', duration: 3000 }).catch(() => {});
      emit('pet-bubble', { text: `今日任务完成！+${result.exp} EXP +${result.coins} 金币 🎉` }).catch(() => {});
    }
  };

  // --- Group selection view ---
  if (view === 'group') {
    return (
      <div className="quiz-practice">
        <h2>🏅 CSP 真题训练</h2>
        <p className="quiz-subtitle">选择你的组别，开始历年真题练习</p>

        <div className="quiz-mode-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className={`quiz-mode-card ${group === 'J' ? 'mode-super' : ''}`} onClick={() => { setGroup('J'); localStorage.setItem(STORAGE_KEY, 'J'); setView('type-select'); }} style={{ cursor: 'pointer' }}>
            <div className="mode-header">
              <span className="mode-icon">🌱</span>
              <span className="mode-title">CSP-J 入门级</span>
            </div>
            <p className="mode-desc">适合小学生和初中生，考察基础算法和数据结构</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              选择题 {bank.filter(q => q.group === 'J' && q.type === 'choice').length} 道 · 阅读 {bank.filter(q => q.group === 'J' && q.type === 'reading').length} 道 · 填空 {bank.filter(q => q.group === 'J' && q.type === 'fillBlank').length} 道
            </p>
          </div>
          <div className={`quiz-mode-card ${group === 'S' ? 'mode-super' : ''}`} onClick={() => { setGroup('S'); localStorage.setItem(STORAGE_KEY, 'S'); setView('type-select'); }} style={{ cursor: 'pointer' }}>
            <div className="mode-header">
              <span className="mode-icon">🚀</span>
              <span className="mode-title">CSP-S 提高级</span>
            </div>
            <p className="mode-desc">适合初中生和高中生，考察高级算法和数据结构</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              选择题 {bank.filter(q => q.group === 'S' && q.type === 'choice').length} 道 · 阅读 {bank.filter(q => q.group === 'S' && q.type === 'reading').length} 道 · 填空 {bank.filter(q => q.group === 'S' && q.type === 'fillBlank').length} 道
            </p>
          </div>
        </div>
        <button className="mode-btn mode-btn-back" onClick={() => setGroup(group === 'J' ? 'S' : 'J')}>
          切换到 CSP-{group === 'J' ? 'S' : 'J'}
        </button>
      </div>
    );
  }

  // --- Type selection view ---
  if (view === 'type-select') {
    const canClaim = examStore.canClaimExamDaily();

    return (
      <div className="quiz-practice">
        <h2>🏅 CSP-{group} 真题训练</h2>
        <button onClick={() => setView('group')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          ← 切换组别
        </button>

        {/* Daily task progress */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📝 今日任务：3 选择 + 1 阅读/填空 → +20 EXP +12g</span>
            {canClaim && (
              <button onClick={claimReward} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                🎁 领取奖励
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#78350f' }}>
            <span>选择 [{choiceDone >= 3 ? '✅' : '⬜'.repeat(choiceDone) + '⬜'.repeat(Math.max(0, 3 - choiceDone))}] {choiceDone}/3</span>
            <span>阅读/填空 [{readingOrFillDone ? '✅' : '⬜'}] {readingOrFillDone ? 1 : 0}/1</span>
          </div>
          {canClaim && <p style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12, marginTop: 6 }}>🎉 今日任务完成！点击上方按钮领取奖励</p>}
        </div>

        <div className="quiz-mode-cards">
          <button className="quiz-mode-card" onClick={() => startPractice('choice')} disabled={choiceQs.length < 3} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">📝</span>
              <span className="mode-title">选择题</span>
              <span className="mode-badge mode-weekly">{choiceQs.length} 道可用</span>
            </div>
            <p className="mode-desc">历年 CSP-{group} 单项选择题，每题 4 个选项，答对计进度</p>
            {choiceQs.length < 3 && <p className="mode-nudge">题目准备中，至少需要 3 道题</p>}
          </button>

          <button className="quiz-mode-card" onClick={() => startPractice('reading')} disabled={readingQs.length < 1} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">📖</span>
              <span className="mode-title">程序阅读题</span>
              <span className="mode-badge mode-extra">{readingQs.length} 道可用</span>
            </div>
            <p className="mode-desc">阅读 C++ 程序，判断输出结果。答对半数以上小问算完成</p>
            {readingQs.length < 1 && <p className="mode-nudge">题目准备中</p>}
          </button>

          <button className="quiz-mode-card" onClick={() => startPractice('fillBlank')} disabled={fillBlankQs.length < 1} style={{ border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div className="mode-header">
              <span className="mode-icon">✏️</span>
              <span className="mode-title">程序填空题</span>
              <span className="mode-badge mode-review">{fillBlankQs.length} 道可用</span>
            </div>
            <p className="mode-desc">完善 C++ 程序中的空缺部分。答对半数以上空位算完成</p>
            {fillBlankQs.length < 1 && <p className="mode-nudge">题目准备中</p>}
          </button>
        </div>
      </div>
    );
  }

  // --- Choice answering view ---
  if (view === 'choice-answer' && questions.length > 0) {
    const q = questions[currentIdx];
    return (
      <ExamChoice
        key={q.id}
        question={q as any}
        questionNum={`第 ${currentIdx + 1}/${questions.length} 题`}
        onAnswer={handleChoiceAnswer}
        onNext={handleChoiceNext}
      />
    );
  }

  // --- MultiPart answering view (reading + fillBlank) ---
  if (view === 'multipart-answer' && questions.length > 0) {
    const q = questions[currentIdx];
    const title = `${q.type === 'reading' ? '📖 程序阅读' : '✏️ 程序填空'} · CSP-${q.group} ${q.year} · ${q.type === 'reading' ? (q.subQuestions?.length || 0) + '小问' : (q.blanks?.length || 0) + '空'}`;
    const subItems = q.type === 'reading'
      ? (q.subQuestions || []).map(sq => ({ label: sq.label, options: sq.options, correctIndex: sq.correctIndex, explanation: sq.explanation }))
      : (q.blanks || []).map(b => ({ label: `空位 ${b.position}`, options: b.options, correctIndex: b.correctIndex, explanation: b.explanation }));

    return (
      <ExamMultiPart
        key={q.id}
        title={title}
        code={q.code}
        question={q.question}
        subItems={subItems}
        onSubmit={handleMultiPartSubmit}
        onBack={handleMultiPartBack}
      />
    );
  }

  // Empty state
  return (
    <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ color: '#64748b' }}>暂无可用题目，请等待题库更新。</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/exam/ExamTraining.tsx
git commit -m "feat: add ExamTraining main page with group/type selection and daily tasks"
```

---

### Task 8: 接入路由和侧边栏

**Files:**
- Modify: `src/App.tsx:13` (import)
- Modify: `src/App.tsx:429` (Route)
- Modify: `src/components/layout/AppShell.tsx:122` (NavLink)

- [ ] **Step 1: 在 App.tsx 中添加 import 和 Route**

在 `import OJTraining from './components/oj/OJTraining';` (line 13) 之后：

```typescript
import ExamTraining from './components/exam/ExamTraining';
```

在 `<Route path="/oj-training" element={<OJTraining />} />` (line 429) 之前：

```typescript
<Route path="/exam" element={<ExamTraining />} />
```

- [ ] **Step 2: 在 AppShell.tsx 中添加侧边栏 NavLink**

在 `<NavLink to="/oj-training" ...>` (line 122) 之前添加：

```typescript
<NavLink to="/exam" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
  🏅 CSP 真题
</NavLink>
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat: wire CSP exam route /exam and sidebar nav"
```

---

### Task 9: 收集完整 CSP 真题库（可异步进行）

**Files:**
- Modify: `public/course-data/csp-exam-bank.json`

- [ ] **Step 1: 补充 2019-2024 年 CSP-J/S 选择题**

从公开渠道（洛谷、真题网）收集 CSP-J/S 历年选择题，按 spec 的 JSON 格式录入。每道题包含完整选项、正确答案、解析。目标每类 90 道选择题（J 45 + S 45）。

- [ ] **Step 2: 补充 2019-2024 年 CSP-J/S 程序阅读题**

收集程序阅读题（每年 J/S 各 1 道），拆分为 3-5 小问，录入 subQuestions 格式。

- [ ] **Step 3: 补充 2019-2024 年 CSP-J/S 程序填空题**

收集程序填空题（每年 J/S 各 1 道），拆分为 3-5 空位，录入 blanks 格式。

- [ ] **Step 4: Commit per year batch**

```bash
git add public/course-data/csp-exam-bank.json
git commit -m "data: add CSP 20XX exam questions"
```

---

### Task 10: 集成验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd csp-desktop-pet && npm run tauri dev
```

- [ ] **Step 2: 验证清单**

| 验证项 | 预期 |
|--------|------|
| 侧边栏显示"🏅 CSP 真题" | 在 OJ 训练上方 |
| 点击进入 → 选组别页 | CSP-J/S 两张卡片，显示题目数 |
| 选 J → 选题型页 | 显示每日任务进度条 + 3 题型卡 |
| 选择选择题 → 做题 | 显示历年真题，标准 ABCD 选项 |
| 答对 → 进度 +1 | 进度条更新 |
| 答错 → 进度不变 | 显示解析，不计入进度 |
| 3 选择 + 1 阅读/填空答对 | 显示"领取奖励"按钮 |
| 领取奖励 | +20 EXP +12g，宠物庆祝动画 |
| 程序阅读填空题 | 代码块 + 全部 ABCD 选项，无 T/F |
| 答对过半数 → 计入进度 | 未过半 → 不计入 |
| 切换到 CSP-S | 题目列表更新，进度保留 |
| 题库不足 | 卡片置灰显示"题目准备中" |
| 刷新页面 → 进度保留 | 日期相同时进度不丢 |

- [ ] **Step 3: 修复发现的问题并 Commit**

---

## 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-11 | 初版：10 个任务，覆盖 store + 3 组件 + 题库 + 路由 |
