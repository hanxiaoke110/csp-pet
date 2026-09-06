import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'scripts/question-bank/data/original-topic-practice.json');

const questions = [];

function add(topic, index, question, options, correctIndex, explanation, difficulty = 2) {
  // Rotate otherwise-correct options so students cannot exploit a position bias.
  const rotation = (index + topic.length) % options.length;
  const balancedOptions = options.slice(rotation).concat(options.slice(0, rotation));
  const balancedCorrectIndex = (correctIndex - rotation + options.length) % options.length;
  questions.push({
    id: `original-topic-${topic}-${String(index).padStart(3, '0')}`,
    source: 'practice_original',
    sourceTitle: 'CSP 学习助手原创专项练习',
    year: 2026,
    originalNumber: index,
    questionType: 'choice',
    knowledgePoint: ({
      combinatorics: '组合数学',
      greedy: '贪心算法',
      dp: '动态规划',
      binary: '排序与查找',
      search: '洪水填充与搜索',
    })[topic],
    difficulty,
    question,
    options: balancedOptions,
    correctIndex: balancedCorrectIndex,
    explanation,
  });
}

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function combination(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = result * (n - i + 1) / i;
  return result;
}

function numericOptions(answer, index, distractors) {
  const candidates = [...new Set(distractors.filter(value => value !== answer))];
  while (candidates.length < 3) candidates.push(answer + candidates.length + 1);
  const slot = index % 4;
  const options = candidates.slice(0, 3).map(String);
  options.splice(slot, 0, String(answer));
  return { options, correctIndex: slot };
}

// 组合数学与概率：乘法原理、排列、组合、概率和抽屉原理，共 20 题。
[[3, 4], [5, 3], [4, 6], [2, 5]].forEach(([tops, bottoms], offset) => {
  const answer = tops * bottoms;
  const { options, correctIndex } = numericOptions(answer, offset, [tops + bottoms, answer - 1, tops * bottoms + tops]);
  add('combinatorics', offset + 1,
    `有 ${tops} 件不同的上衣和 ${bottoms} 条不同的裤子，每次各选一件搭配，共有多少种不同搭配？`,
    options, correctIndex, `根据乘法原理，共有 ${tops}×${bottoms}=${answer} 种搭配。`, 1);
});

[4, 5, 6, 7].forEach((n, offset) => {
  const answer = factorial(n);
  const { options, correctIndex } = numericOptions(answer, offset + 1, [n * (n - 1), factorial(n - 1), answer + n]);
  add('combinatorics', offset + 5,
    `${n} 名同学站成一排，所有人互不相同，共有多少种站法？`,
    options, correctIndex, `全排列数量为 ${n}!=${answer}。`, 2);
});

[[5, 2], [6, 2], [6, 3], [8, 2]].forEach(([n, k], offset) => {
  const answer = combination(n, k);
  const { options, correctIndex } = numericOptions(answer, offset + 2, [n * k, factorial(k), answer + n]);
  add('combinatorics', offset + 9,
    `从 ${n} 名同学中选出 ${k} 名参加活动，不区分顺序，共有多少种选法？`,
    options, correctIndex, `不区分顺序，选法数为 C(${n},${k})=${answer}。`, 2);
});

[
  ['掷一枚均匀六面骰子一次，点数为偶数的概率是多少？', ['1/2', '1/3', '2/3', '1/6'], 0, '偶数点为2、4、6，共3种，占6种等可能结果的一半。'],
  ['连续抛两次均匀硬币，恰好出现一次正面的概率是多少？', ['1/4', '1/2', '3/4', '1'], 1, '四种等可能结果中，正反和反正符合要求，因此概率为2/4=1/2。'],
  ['袋中有3个红球和2个蓝球，随机取1个球，取到蓝球的概率是多少？', ['2/3', '2/5', '3/5', '1/5'], 1, '共有5个球，其中2个蓝球，概率为2/5。'],
  ['从数字1、2、3中等可能地选一个数，选到大于1的数的概率是多少？', ['1/3', '1/2', '2/3', '1'], 2, '大于1的数是2和3，共2种，因此概率为2/3。'],
].forEach(([question, options, correctIndex, explanation], offset) => {
  add('combinatorics', offset + 13, question, options, correctIndex, explanation, 2);
});

[
  ['至少有多少人时，必能保证其中两人的出生月份相同？', ['12', '13', '24', '25'], 1, '月份只有12种。根据抽屉原理，13人中必有两人的出生月份相同。'],
  ['把9个球放入4个盒子，至少有一个盒子中不少于多少个球？', ['2', '3', '4', '5'], 1, '若每盒最多2个，只能放8个，因此至少有一盒不少于3个。'],
  ['从1到10中任选6个不同整数，必能保证至少有两个数的奇偶性相同吗？', ['能', '不能', '只在选到10时能', '无法判断'], 0, '奇偶性只有两类，任选3个数就必有两个同奇偶，选6个当然能保证。'],
  ['班级中有31名学生，至少有多少名学生的出生日期在同一个月份？', ['2', '3', '4', '5'], 1, '31÷12=2余7，根据抽屉原理，至少有一个月份有3人。'],
].forEach(([question, options, correctIndex, explanation], offset) => {
  add('combinatorics', offset + 17, question, options, correctIndex, explanation, 3);
});

// 贪心：概念与区间调度，共 18 题。
const greedyConcepts = [
  ['设计贪心算法时，每一步通常选择什么？', ['当前看来最优的选择', '随机选择', '枚举全部剩余方案', '撤销上一步选择'], 0, '贪心算法每一步作出当前看来最优的局部选择。'],
  ['下列哪项是证明贪心算法正确性时常用的方法？', ['交换论证', '只测试一个样例', '扩大数组', '删除边界条件'], 0, '交换论证常用于说明某个最优解可以转换为包含贪心选择的最优解。'],
  ['用最少数量的1元、5元、10元纸币凑出18元，按面额从大到小选择会使用几张？', ['4', '5', '6', '8'], 1, '选择10元1张、5元1张、1元3张，共5张。'],
  ['硬币面额为1、3、4时，按最大面额优先凑6元会得到几枚硬币？', ['2', '3', '4', '6'], 1, '贪心会选4、1、1，共3枚；但3、3只需2枚，说明该贪心策略并非总正确。'],
  ['安排尽可能多的互不重叠活动时，经典贪心策略优先选择什么活动？', ['结束时间最早', '开始时间最早', '持续时间最长', '编号最小'], 0, '优先选择结束时间最早的活动，可以为后续活动留下最多时间。'],
  ['将若干任务按截止时间安排以尽量避免迟到，选择规则必须经过什么？', ['正确性证明', '随机打乱', '增加循环层数', '改用递归'], 0, '局部规则并不天然保证全局最优，必须证明贪心选择性质。'],
  ['在部分背包问题中，物品可以任意切分，应优先选择什么？', ['单位重量价值最高', '重量最大', '价值最低', '编号最小'], 0, '可切分时按单位重量价值从高到低取，可以得到最优收益。'],
  ['在0/1背包问题中，每件物品只能取或不取，按单位价值贪心是否总能最优？', ['总能', '不一定', '只有容量为偶数时能', '只有一件物品时不能'], 1, '0/1背包不能随意切分，局部单位价值最高不一定组成全局最优解。'],
  ['最小生成树的Kruskal算法每次优先考虑什么边？', ['当前最短且不形成环的边', '当前最长边', '与起点相邻的任意边', '编号最大的边'], 0, 'Kruskal按边权递增选择不会形成环的边。'],
  ['哈夫曼编码构造过程中，每次合并哪两个结点？', ['权值最小的两个', '权值最大的两个', '深度最大的两个', '编号最小的两个'], 0, '每次合并权值最小的两个结点可得到最小带权路径长度。'],
  ['下面哪种现象说明一个贪心策略可能错误？', ['某个合法样例上不是最优', '代码没有使用递归', '数组从0开始编号', '时间复杂度为O(n log n)'], 0, '只要存在一个反例使结果不是最优，该贪心策略就不具备普遍正确性。'],
  ['贪心算法与动态规划的主要区别之一是什么？', ['贪心通常不回头修改已作选择', '贪心必须使用二维数组', '动态规划不能求最优值', '二者完全相同'], 0, '贪心一旦作出局部选择通常不再回退，而动态规划会综合多个子问题状态。'],
];
greedyConcepts.forEach((item, offset) => add('greedy', offset + 1, ...item, offset < 4 ? 1 : 2));

const intervalSets = [
  [[1, 2], [2, 4], [3, 5], [4, 6]],
  [[1, 3], [2, 5], [4, 6], [6, 8], [7, 9]],
  [[0, 4], [1, 2], [2, 3], [3, 5], [5, 7]],
  [[1, 5], [2, 3], [3, 4], [4, 6], [6, 7]],
  [[0, 2], [1, 4], [2, 5], [5, 6], [6, 8]],
  [[1, 2], [2, 3], [3, 4], [1, 4], [4, 6]],
];
function maxIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[1] - b[1]);
  let end = -Infinity;
  let count = 0;
  for (const [start, finish] of sorted) {
    if (start >= end) { count += 1; end = finish; }
  }
  return count;
}
intervalSets.forEach((intervals, offset) => {
  const answer = maxIntervals(intervals);
  const { options, correctIndex } = numericOptions(answer, offset, [answer - 1, answer + 1, intervals.length]);
  add('greedy', offset + 13,
    `活动时间段为 ${intervals.map(([a, b]) => `[${a},${b})`).join('、')}，同一时刻只能参加一个活动，最多能参加几个？`,
    options, correctIndex, `按结束时间从早到晚选择，每次选择开始时间不早于上个结束时间的活动，最多可选 ${answer} 个。`, 3);
});

// 动态规划：状态、转移、背包、路径和序列，共 13 题。
[
  ['动态规划通常要求问题具有哪两个重要性质？', ['最优子结构和重叠子问题', '随机性和不可重复性', '只能递归且不能循环', '输入必须有序'], 0, '最优子结构使子问题最优解可组合成原问题最优解，重叠子问题使结果复用有价值。'],
  ['使用动态规划数组dp时，首先应明确什么？', ['状态含义', '变量名长度', '输出颜色', '操作系统版本'], 0, '状态定义决定转移方程、初始化和最终答案的位置。'],
  ['若dp[i]表示爬到第i级台阶的方法数，每次走1级或2级，则正确转移是？', ['dp[i]=dp[i-1]+dp[i-2]', 'dp[i]=dp[i-1]*2', 'dp[i]=i', 'dp[i]=dp[i-2]-dp[i-1]'], 0, '最后一步来自i-1或i-2，两类方案互不重叠，因此相加。'],
  ['爬楼梯问题中规定dp[0]=1、dp[1]=1，则dp[5]等于多少？', ['5', '8', '10', '13'], 1, '依次得到dp[2]=2、dp[3]=3、dp[4]=5、dp[5]=8。'],
  ['0/1背包使用一维dp并逐件处理物品时，容量通常应按什么方向枚举？', ['从大到小', '从小到大', '随机顺序', '只枚举偶数'], 0, '倒序枚举可避免同一件物品在一轮中被重复使用。'],
  ['完全背包允许每件物品使用多次，一维优化时容量通常如何枚举？', ['从小到大', '从大到小', '不枚举容量', '只枚举一次'], 0, '正序枚举允许当前物品的状态在同一轮继续被使用。'],
  ['物品重量和价值分别为(2,3)、(3,4)，背包容量为3，0/1背包最大价值是多少？', ['3', '4', '7', '0'], 1, '容量3不能同时装两件，选择重量3、价值4的物品最优。'],
  ['物品重量和价值分别为(2,3)、(3,4)，背包容量为5，0/1背包最大价值是多少？', ['4', '5', '6', '7'], 3, '两件物品总重量5、总价值7，恰好都能装入。'],
  ['求网格从左上到右下的最短代价，每步只能向右或向下，dp[i][j]通常来自哪里？', ['上方和左方', '下方和右方', '任意随机格', '只来自左上角'], 0, '到达(i,j)的最后一步只能来自(i-1,j)或(i,j-1)。'],
  ['最长递增子序列的经典O(n^2)状态dp[i]常表示什么？', ['以第i个元素结尾的最长递增子序列长度', '前i项之和', '第i项出现次数', '从i开始的最小值'], 0, '状态固定以i结尾，转移时枚举此前较小的元素。'],
  ['字符串"abc"和"ac"的最长公共子序列长度是多少？', ['1', '2', '3', '0'], 1, '字符a、c按原顺序同时出现在两个字符串中，长度为2。'],
  ['记忆化搜索与普通递归相比，主要增加了什么？', ['缓存已经求过的状态', '删除所有返回值', '随机选择分支', '只能从main调用'], 0, '记忆化会保存子问题答案，避免重复计算同一状态。'],
  ['动态规划完成后，最终答案一定存放在dp数组最后一个元素吗？', ['一定', '不一定，取决于状态定义', '只在数组长度为偶数时一定', '只在递归实现时一定'], 1, '答案位置由状态定义决定，可能是某个元素、整行最大值或多个状态的组合。'],
].forEach((item, offset) => add('dp', offset + 1, ...item, offset < 4 ? 1 : offset < 9 ? 2 : 3));

// 二分查找与二分答案，共 11 题。
[
  ['在升序数组中使用二分查找的前提是什么？', ['数组具有可利用的单调性', '数组长度必须是偶数', '所有元素必须不同', '元素必须为正数'], 0, '二分查找依赖有序或其他单调性质来排除一半范围。'],
  ['升序数组[1,3,5,7,9]中查找7，若第一次检查中间元素5，下一步应搜索哪里？', ['右半部分', '左半部分', '整个数组', '立即判定不存在'], 0, '7大于5，因此只可能位于右半部分。'],
  ['长度为16的有序数组，成功查找某元素最多大约需要比较多少次？', ['4到5次', '8次', '16次', '32次'], 0, '二分每次将范围减半，比较次数为O(log2 n)，16个元素约4到5次。'],
  ['计算整数中点时，哪种写法更能避免left+right溢出？', ['left+(right-left)/2', '(left+right)/2', 'left+right/2', '(right-left)/2'], 0, 'left+(right-left)/2避免直接计算可能溢出的left+right。'],
  ['查找第一个大于等于x的位置时，遇到a[mid]>=x应如何缩小范围？', ['保留mid并向左寻找', '丢弃mid并向右寻找', '立即返回数组末尾', '随机选择一侧'], 0, 'mid可能就是第一个满足条件的位置，必须保留并继续向左检查。'],
  ['数组[2,4,4,4,7]中，第一个大于等于4的下标是多少？下标从0开始。', ['0', '1', '2', '4'], 1, '下标1对应第一个4，是第一个不小于4的元素。'],
  ['数组[2,4,4,4,7]中，第一个大于4的下标是多少？下标从0开始。', ['1', '2', '3', '4'], 3, '前三个4都不大于4，下标4的7是第一个大于4的元素。'],
  ['二分答案适合解决哪类问题？', ['答案具有单调可判定性', '答案完全随机', '只能输出字符串', '没有任何判断函数'], 0, '若某个答案可行后更大或更小的答案也保持可行，就能二分边界。'],
  ['整数区间使用while(left<=right)二分，若mid处元素小于目标值，通常更新为什么？', ['left=mid+1', 'right=mid-1', 'left=mid', 'right=mid'], 0, 'mid已确定过小，可以连同左侧一起排除，令left=mid+1。'],
  ['对区间[1,100]进行二分查找，每次把候选范围大致减半，最多约需多少次即可缩小到一个数？', ['7次', '10次', '50次', '100次'], 0, '2^7=128，大于100，因此约7次可以定位。'],
  ['实数二分通常使用什么作为停止条件？', ['区间长度小于精度要求或达到固定迭代次数', '左右端点必须都是整数', 'mid必须等于0', '数组必须为空'], 0, '实数难以依赖精确相等，通常按误差或固定迭代次数停止。'],
].forEach((item, offset) => add('binary', offset + 1, ...item, offset < 5 ? 1 : offset < 9 ? 2 : 3));

// 搜索与洪水填充：DFS、BFS、连通块和回溯，共 20 题。
[
  ['深度优先搜索DFS最自然使用哪种结构实现回退？', ['栈或递归调用栈', '只能使用队列', '哈希值', '浮点变量'], 0, 'DFS沿一条路径深入，再回退到上一个状态，符合栈的后进先出特点。'],
  ['广度优先搜索BFS通常使用哪种数据结构？', ['队列', '栈', '集合不能删除', '优先使用递归调用栈'], 0, 'BFS按层扩展结点，需要先进先出的队列。'],
  ['在无权图中求起点到其他结点的最短边数，通常选择什么算法？', ['BFS', '普通DFS首次到达', '冒泡排序', '二分查找'], 0, 'BFS按距离层次扩展，首次到达时即可得到最短边数。'],
  ['网格洪水填充的主要用途是什么？', ['访问与起点连通且满足条件的区域', '给数组排序', '计算阶乘', '查找有序数组'], 0, '洪水填充从起点向相邻且符合条件的格子扩展整个连通区域。'],
  ['搜索网格时设置visited数组的主要目的是什么？', ['避免重复访问和死循环', '让坐标变大', '自动排序答案', '替代边界判断'], 0, '记录访问状态可以防止在环或相邻格之间反复来回。'],
  ['四方向网格搜索通常不包含哪个方向？', ['左上', '上', '下', '右'], 0, '四方向只包含上、下、左、右，不含对角线。'],
  ['八方向网格搜索与四方向相比增加了什么？', ['四个对角方向', '时间维度', '随机跳跃', '只能向右'], 0, '八方向在上下左右之外增加四个对角方向。'],
  ['递归DFS处理网格时，最先应检查什么？', ['越界、障碍和已访问状态', '答案颜色', '窗口大小', '网络速度'], 0, '无效坐标必须在访问数组或网格之前被排除。'],
  ['回溯法撤销选择的目的是什么？', ['恢复现场以尝试其他分支', '永久删除其他答案', '让递归提前结束', '增加重复状态'], 0, '回溯返回后恢复状态，才能正确探索同层的其他候选。'],
  ['枚举长度为n的所有二进制串，搜索树叶子数量是多少？', ['2^n', 'n', 'n^2', '2n'], 0, '每个位置有0和1两种选择，共有2^n个完整串。'],
  ['若图中存在环，DFS不记录visited可能发生什么？', ['无限递归或反复访问', '自动得到最短路', '图自动变成树', '时间复杂度变为O(1)'], 0, '环会使搜索不断回到已经访问过的结点。'],
  ['BFS中一个结点通常应在什么时候标记为已访问？', ['入队时', '出队很久以后', '程序结束时', '从不标记'], 0, '入队时立即标记可避免同一结点被多个前驱重复加入队列。'],
  ['DFS一定能在无权图中第一次到达终点时得到最短路径吗？', ['一定', '不一定', '只有结点数为偶数时一定', '只有使用数组时一定'], 1, 'DFS首先找到的路径取决于分支顺序，不保证边数最少。'],
  ['一个3×3全为空的网格采用四方向连通，从任意格开始洪水填充会访问多少格？', ['3', '6', '8', '9'], 3, '所有9个格子四方向连通，因此都会被访问。'],
  ['网格为“..# / .## / ...”，点表示空地，四方向连通。空地区域有几个连通块？', ['1', '2', '3', '5'], 0, '左上区域可沿第一列到达底行，再到达右下，所有点连成一个区域。'],
  ['网格为“.#. / ### / .#.”，点表示空地，四方向连通。空地区域有几个连通块？', ['1', '2', '3', '4'], 3, '四个角上的点互不四方向相邻，因此形成4个连通块。'],
  ['从起点开始BFS，起点距离设为0，相邻未访问结点v的距离通常如何计算？', ['dist[v]=dist[u]+1', 'dist[v]=dist[u]-1', 'dist[v]=0', 'dist[v]=v'], 0, '无权图每经过一条边距离增加1。'],
  ['搜索过程中发现当前路径已经不可能优于已知答案并停止扩展，这称为什么？', ['剪枝', '编码', '排序稳定性', '内存对齐'], 0, '提前排除不可能产生更优解的分支称为剪枝。'],
  ['下面哪项更适合使用回溯搜索？', ['生成满足限制的所有排列', '读取一个整数', '输出固定字符串', '计算两个数之和'], 0, '排列生成需要逐步选择、冲突检查和撤销选择，是典型回溯问题。'],
  ['搜索状态很多且会重复到达同一状态时，可以使用什么减少重复计算？', ['记忆化或状态判重', '删除答案', '增加随机数', '取消边界检查'], 0, '缓存状态结果或记录已访问状态可以避免重复展开。'],
].forEach((item, offset) => add('search', offset + 1, ...item, offset < 8 ? 1 : offset < 16 ? 2 : 3));

const expectedCounts = { combinatorics: 20, greedy: 18, dp: 13, binary: 11, search: 20 };
for (const [topic, expected] of Object.entries(expectedCounts)) {
  const actual = questions.filter(question => question.id.includes(`-${topic}-`)).length;
  if (actual !== expected) throw new Error(`${topic}: expected ${expected}, got ${actual}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  source: 'practice_original',
  sourceTitle: 'CSP 学习助手原创专项练习',
  license: 'Project-authored educational content',
  sourceUpdatedAt: '2026-09-05',
  questionCount: questions.length,
  questions,
}, null, 2)}\n`);

console.log(`Generated ${questions.length} original topic-practice questions.`);
