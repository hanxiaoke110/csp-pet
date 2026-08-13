import type { DungeonQuestionPlan } from '../types/dungeon';

type PlanInput = Omit<DungeonQuestionPlan, 'dungeonId' | 'stageId' | 'groups'> & {
  groups?: DungeonQuestionPlan['groups'];
};

const plan = (dungeon: number, stage: number, input: PlanInput): DungeonQuestionPlan => ({
  dungeonId: `dungeon-${String(dungeon).padStart(2, '0')}`,
  stageId: `dungeon-${String(dungeon).padStart(2, '0')}-stage-${String(stage).padStart(2, '0')}`,
  groups: input.groups || ['J', 'GESP'],
  ...input,
});

// Knowledge-point aliases intentionally include both reviewed-bank labels and common stem wording.
// This keeps the plan stable when teachers refine a label without moving the question to a wrong dungeon.
export const DUNGEON_QUESTION_PLANS: DungeonQuestionPlan[] = [
  plan(1, 1, { includeKeywords: ['计算机基础', '计算机发展', '硬件', 'CPU', '冯·诺依曼'], difficulty: [1, 2] }),
  plan(1, 2, { includeKeywords: ['数据表示', '存储单位', '字节', '位', '容量'], difficulty: [1, 2] }),
  plan(1, 3, { includeKeywords: ['网络', 'IP', '域名', '协议', '互联网', '局域网', '浏览器', 'WWW', 'URL'], difficulty: [1, 3] }),
  plan(1, 4, { includeKeywords: ['操作系统', '文件', '进程', '内存', '信息安全'], difficulty: [1, 2] }),
  plan(1, 5, { includeKeywords: ['计算机基础', '硬件', '存储', '网络', '操作系统', '信息安全'], difficulty: [1, 2], reviewRatio: 0.2 }),

  plan(2, 1, { includeKeywords: ['二进制', '进制转换', '位运算'], difficulty: [1, 2] }),
  plan(2, 2, { includeKeywords: ['八进制', '十六进制', '8进制', '16进制', '进制转换', '十进制'], difficulty: [1, 3] }),
  plan(2, 3, { includeKeywords: ['原码', '反码', '补码', 'ASCII', '编码'], difficulty: [1, 3] }),
  plan(2, 4, { includeKeywords: ['哈夫曼', '编码', '压缩', '信息熵'], difficulty: [2, 3] }),
  plan(2, 5, { includeKeywords: ['二进制', '进制', '补码', 'ASCII', '编码', '位运算'], difficulty: [1, 3], reviewRatio: 0.2 }),

  plan(3, 1, { includeKeywords: ['数据类型', '变量', '常量', '输入输出'], difficulty: [1, 2] }),
  plan(3, 2, { includeKeywords: ['运算符', '表达式', '优先级'], difficulty: [1, 3] }),
  plan(3, 3, { includeKeywords: ['分支', '循环', '控制结构', 'if', 'for', 'while'], difficulty: [1, 3] }),
  plan(3, 4, { includeKeywords: ['函数', '递归', '指针', '引用', '作用域'], difficulty: [2, 4] }),
  plan(3, 5, { includeKeywords: ['语法', '数据类型', '运算符', '分支', '循环', '函数', '指针'], difficulty: [1, 4], reviewRatio: 0.2 }),

  plan(4, 1, { includeKeywords: ['数组', '字符串', '链表', '栈', '队列', '线性表'], difficulty: [1, 3] }),
  plan(4, 2, { includeKeywords: ['二叉树', '树', '遍历'], difficulty: [2, 4] }),
  plan(4, 3, { includeKeywords: ['图', '深度优先', '广度优先', 'DFS', 'BFS'], difficulty: [2, 4] }),
  plan(4, 4, { includeKeywords: ['哈希', '堆', '并查集', '数据结构'], difficulty: [2, 4] }),
  plan(4, 5, { includeKeywords: ['数组', '字符串', '栈', '队列', '树', '图', '哈希', '堆'], difficulty: [2, 4], reviewRatio: 0.2 }),

  plan(5, 1, { includeKeywords: ['排序', '冒泡', '选择排序', '插入排序', '快速排序'], difficulty: [1, 4] }),
  plan(5, 2, { includeKeywords: ['查找', '二分', '哈希查找'], difficulty: [2, 4] }),
  plan(5, 3, { includeKeywords: ['递推', '递归', '分治'], difficulty: [2, 4] }),
  plan(5, 4, { includeKeywords: ['贪心', '动态规划', '搜索', '算法', '背包', '最短路', '枚举'], difficulty: [2, 4] }),
  plan(5, 5, { includeKeywords: ['复杂度', '排序', '查找', '递归', '贪心', '动态规划', '搜索'], difficulty: [2, 4], reviewRatio: 0.2 }),

  plan(6, 1, { includeKeywords: ['排列', '组合', '计数'], difficulty: [2, 4] }),
  plan(6, 2, { includeKeywords: ['容斥', '计数', '集合', '组合数学', '排列', '组合'], difficulty: [2, 4] }),
  plan(6, 3, { includeKeywords: ['数论', '素数', '质数', '约数', '因数', '倍数', '最大公约数', '最小公倍数', 'GCD', '欧几里得', '同余', '取模', '快速幂'], difficulty: [1, 4] }),
  plan(6, 4, { includeKeywords: ['概率', '期望', '逻辑', '命题', '布尔', '真假', '事件'], difficulty: [1, 4] }),
  plan(6, 5, { includeKeywords: ['排列', '组合', '容斥', '数论', '素数', '约数', '概率', '逻辑'], difficulty: [2, 4], reviewRatio: 0.2 }),

  plan(7, 1, { includeKeywords: [], difficulty: [1, 4], groups: ['J'], years: [2020] }),
  plan(7, 2, { includeKeywords: [], difficulty: [1, 4], groups: ['J'], years: [2021] }),
  plan(7, 3, { includeKeywords: [], difficulty: [1, 4], groups: ['J'], years: [2022] }),
  plan(7, 4, { includeKeywords: [], difficulty: [1, 4], groups: ['J'], years: [2023] }),
  plan(7, 5, { includeKeywords: [], difficulty: [1, 4], groups: ['J'], years: [2020, 2021, 2022, 2023, 2024], reviewRatio: 0.2 }),

  plan(8, 1, { includeKeywords: ['计算机基础', '进制', '编码', '语法'], difficulty: [2, 4], groups: ['J'] }),
  plan(8, 2, { includeKeywords: ['分支', '循环', '函数', '数组', '字符串'], difficulty: [2, 4], groups: ['J'] }),
  plan(8, 3, { includeKeywords: ['数据结构', '树', '图', '栈', '队列'], difficulty: [2, 4], groups: ['J'] }),
  plan(8, 4, { includeKeywords: ['算法', '复杂度', '排序', '查找', '递归', '贪心', '搜索'], difficulty: [2, 4], groups: ['J'] }),
  plan(8, 5, { includeKeywords: [], difficulty: [2, 4], groups: ['J'], years: [2020, 2021, 2022, 2023, 2024], reviewRatio: 0.3 }),
];

export function getDungeonQuestionPlan(dungeonId: string, stageId: string): DungeonQuestionPlan | undefined {
  return DUNGEON_QUESTION_PLANS.find(item => item.dungeonId === dungeonId && item.stageId === stageId);
}
