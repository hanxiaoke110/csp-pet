export interface TopicQuestionLike {
  topicId?: string;
}

export interface PracticeTopic {
  id: string;
  name: string;
  description: string;
  knowledgePointIds: string[];
}

export interface PracticeTopicGroup {
  id: string;
  name: string;
  topics: PracticeTopic[];
}

export const PRACTICE_TOPIC_GROUPS: PracticeTopicGroup[] = [
  {
    id: 'foundation',
    name: '基础语法',
    topics: [
      { id: 'computer-basics', name: '计算机常识', description: '网络、计算机发展与编程语言', knowledgePointIds: ['computer-networks', 'computer-history', 'programming-languages'] },
      { id: 'number-encoding', name: '进制与编码', description: '二进制、位运算与信息编码', knowledgePointIds: ['binary-and-bitwise', 'encoding-and-decoding'] },
      { id: 'types-expression', name: '数据类型与表达式', description: '类型、存储、运算符与表达式求值', knowledgePointIds: ['data-types-and-units', 'expression-evaluation'] },
      { id: 'control', name: '分支与循环', description: '条件判断、循环结构与流程跟踪', knowledgePointIds: ['control-structures'] },
      { id: 'function-recursion', name: '函数与递归', description: '函数调用、递归与递推', knowledgePointIds: ['recursion'] },
      { id: 'array-string', name: '数组与字符串', description: '数组、字符与字符串处理', knowledgePointIds: ['array-and-string'] },
    ],
  },
  {
    id: 'algorithm',
    name: '数据结构与算法',
    topics: [
      { id: 'data-structure', name: '数据结构', description: '栈、队列、树与图', knowledgePointIds: ['stack-and-queue', 'tree', 'graph'] },
      { id: 'algorithm-basics', name: '复杂度与二分', description: '复杂度分析、二分查找与二分答案', knowledgePointIds: ['complexity', 'binary-search'] },
      { id: 'greedy', name: '贪心算法', description: '局部最优、区间调度与经典策略', knowledgePointIds: ['greedy'] },
      { id: 'dynamic-programming', name: '动态规划', description: '状态、转移、背包与序列问题', knowledgePointIds: ['dynamic-programming'] },
      { id: 'search', name: '搜索与洪水填充', description: 'DFS、BFS、回溯与连通块', knowledgePointIds: ['flood-fill'] },
    ],
  },
  {
    id: 'math',
    name: '数学思维',
    topics: [
      { id: 'number-theory', name: '初等数论', description: '质数、因数、最大公约数与取模', knowledgePointIds: ['number-theory'] },
      { id: 'combinatorics', name: '排列组合与概率', description: '计数原理、排列、组合与简单概率', knowledgePointIds: ['combinatorics'] },
    ],
  },
];

export const PRACTICE_TOPICS = PRACTICE_TOPIC_GROUPS.flatMap(group => group.topics);

export function findPracticeTopic(topicId: string): PracticeTopic | undefined {
  return PRACTICE_TOPICS.find(topic => topic.id === topicId);
}

export function questionsForTopic<T extends TopicQuestionLike>(questions: T[], topic: PracticeTopic): T[] {
  const ids = new Set(topic.knowledgePointIds);
  return questions.filter(question => question.topicId && ids.has(question.topicId));
}

export function availableSessionSizes(questionCount: number): number[] {
  return [5, 10, 20].filter(size => questionCount >= size);
}
