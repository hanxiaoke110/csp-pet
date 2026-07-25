import fs from 'node:fs';
import path from 'node:path';

const outDir = 'reports/learning-materials/polished-one-round';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function p(text) {
  return `<p>${text}</p>`;
}

function code(lang, caption, body) {
  return `<pre lang="${esc(lang)}" caption="${esc(caption)}"><code>${esc(body)}</code></pre>`;
}

function list(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => ordered ? `<li seq="auto">${item}</li>` : `<li>${item}</li>`).join('')}</${tag}>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th background-color="light-gray">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const lectures = [
  {
    no: '03',
    doc: 'JkwpdaeceovKQ7xgN7bcAhpSnvh',
    title: '排列组合',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/FL4rdY9cvoErchxhw0dcV7vanfc',
    cardTitle: '知识卡｜组合数学与概率',
    intro: '这一节帮助孩子区分“排列”和“组合”，理解加法原理、乘法原理、阶乘和简单概率。CSP-J 初赛里，这类题通常不会让孩子写复杂程序，而是考能不能把题意拆成几个选择步骤。',
    exam: [
      ['计数原理', '“完成一件事有几种方法”', '先判断是分情况相加，还是分步骤相乘'],
      ['排列组合', '从 n 个元素中选或排', '看顺序是否重要'],
      ['概率计算', '某事件发生的概率是多少', '有利情况数 ÷ 总情况数'],
      ['鸽巢原理', '至少有几个相同/重复', '物品数超过盒子数时必有重复']
    ],
    concepts: [
      ['加法原理', '如果完成一件事可以分成互不重叠的几类情况，总方法数等于各类方法数相加。'],
      ['乘法原理', '如果完成一件事需要连续做几步，总方法数等于每一步选择数相乘。'],
      ['排列', '从 n 个不同元素中取出 m 个并排成一列，顺序重要。'],
      ['组合', '从 n 个不同元素中取出 m 个组成一组，顺序不重要。']
    ],
    codes: [
      ['cpp', '计算阶乘和组合数', `#include <bits/stdc++.h>
using namespace std;

long long fact(int n) {
    long long ans = 1;
    for (int i = 1; i <= n; i++) ans *= i;
    return ans;
}

long long C(int n, int m) {
    if (m < 0 || m > n) return 0;
    return fact(n) / fact(m) / fact(n - m);
}

int main() {
    cout << C(5, 2) << endl; // 从 5 个里选 2 个，共 10 种
    return 0;
}`]
    ],
    examples: [
      ['例 1：有 3 件上衣和 2 条裤子，一套衣服有几种搭配？', '上衣和裤子是两个连续步骤，用乘法原理：3 × 2 = 6。'],
      ['例 2：从 5 名同学中选 2 名参加活动，有多少种选法？', '只关心选了谁，不关心顺序，是组合：C(5,2)=10。']
    ],
    mistakes: ['看到“先后、排队、名次”通常顺序重要；看到“选出、组成一组”通常顺序不重要。', '加法原理用于分情况，乘法原理用于分步骤，不要混用。', '概率题要先数清总情况数，再数有利情况数。'],
    exercises: ['从 6 人中选 3 人，有多少种选法？', '3 名同学排队，有多少种不同顺序？', '抛两枚硬币，至少出现一个正面的概率是多少？']
  },
  {
    no: '04',
    doc: 'DqL5dBD8xoyqphxQ0BkcLTQ8nrh',
    title: '数据类型、存储单位、指针',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/ICwGdxbAzoYSmlxZOaAcFxN0nAc',
    cardTitle: '知识卡｜数据类型与存储单位',
    intro: '这一节把 C++ 基础里最容易混的三件事放在一起：变量的数据类型、计算机存储单位、指针的基本含义。初赛常考取值范围、字节换算、ASCII 编码和指针概念。',
    exam: [
      ['数据类型', 'int、long long、double、char 的区别', '看范围、精度和存储字节'],
      ['存储单位', 'bit、Byte、KB、MB、GB 换算', '1 Byte = 8 bit，1 KB = 1024 Byte'],
      ['字符编码', '字符和 ASCII 码互转', '字符本质上也能用整数编码表示'],
      ['指针概念', '地址、取地址、解引用', '指针保存的是变量地址']
    ],
    concepts: [
      ['整数类型', '<code>int</code> 常用于普通整数，范围不够时用 <code>long long</code>。'],
      ['浮点类型', '<code>double</code> 用于小数，但浮点数可能有精度误差。'],
      ['字符类型', '<code>char</code> 保存一个字符，也可以参与 ASCII 码运算。'],
      ['指针', '指针变量保存另一个变量的地址，<code>&amp;x</code> 表示 x 的地址，<code>*p</code> 表示访问 p 指向的值。']
    ],
    codes: [
      ['cpp', '字符与 ASCII 码', `#include <bits/stdc++.h>
using namespace std;

int main() {
    char c = 'A';
    cout << int(c) << endl;      // 输出 65
    cout << char(c + 1) << endl; // 输出 B
    return 0;
}`],
      ['cpp', '指针的最小示例', `#include <bits/stdc++.h>
using namespace std;

int main() {
    int x = 10;
    int *p = &x;       // p 保存 x 的地址
    *p = 20;           // 修改 p 指向的位置，也就是修改 x
    cout << x << endl; // 输出 20
    return 0;
}`]
    ],
    examples: [
      ['例 1：1 MB 等于多少 Byte？', '1 MB = 1024 KB，1 KB = 1024 Byte，所以 1 MB = 1024 × 1024 Byte。'],
      ['例 2：字符 <code>\'A\'</code> 的 ASCII 码是 65，那么 <code>\'C\'</code> 是多少？', 'C 比 A 大 2，所以是 67。']
    ],
    mistakes: ['bit 是位，Byte 是字节，二者相差 8 倍。', '浮点数不要直接用等号比较是否完全相等。', '指针保存的是地址，不是普通整数值。'],
    exercises: ['计算 2 KB 等于多少 bit。', '写出 <code>\'a\' + 2</code> 对应的字符。', '解释 <code>int *p = &amp;x;</code> 中 <code>&amp;</code> 的作用。']
  },
  {
    no: '06',
    doc: 'WeIUdwO0AoyNhbxwS8PcI6UznBg',
    title: '栈和队列',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/Fx4Ldpsg5oiV1IxKawJcetNRnxg',
    cardTitle: '知识卡｜栈与队列',
    intro: '栈和队列都是线性数据结构。栈像一摞盘子，后放的先拿；队列像排队买票，先来的先走。初赛常考进出顺序、表达式、函数调用和 BFS 的队列思想。',
    exam: [
      ['栈', '给定入栈顺序，判断出栈序列是否可能', '后进先出 LIFO'],
      ['队列', '模拟入队、出队后的元素顺序', '先进先出 FIFO'],
      ['应用', '括号匹配、表达式求值、BFS', '看场景选择结构'],
      ['复杂度', 'push/pop/front/top 的复杂度', '常用操作一般是 O(1)']
    ],
    concepts: [
      ['栈', '只允许在一端插入和删除，常用操作是 <code>push</code>、<code>pop</code>、<code>top</code>。'],
      ['队列', '从队尾加入，从队头取出，常用操作是 <code>push</code>、<code>pop</code>、<code>front</code>。'],
      ['单调栈/单调队列', '是进阶用法，核心仍然是维护一种有序状态。初学先掌握普通栈队列。']
    ],
    codes: [
      ['cpp', '括号匹配', `#include <bits/stdc++.h>
using namespace std;

bool ok(string s) {
    stack<char> st;
    for (char c : s) {
        if (c == '(') st.push(c);
        else if (c == ')') {
            if (st.empty()) return false;
            st.pop();
        }
    }
    return st.empty();
}`],
      ['cpp', '队列模拟排队', `queue<int> q;
q.push(1);
q.push(2);
cout << q.front() << endl; // 1
q.pop();
cout << q.front() << endl; // 2`]
    ],
    examples: [
      ['例 1：入栈顺序 1,2,3，能否出栈 3,2,1？', '可以。1、2、3 依次入栈后，再依次弹出。'],
      ['例 2：队列依次进入 1,2,3，第一次出队是谁？', '队列先进先出，所以第一次出队是 1。']
    ],
    mistakes: ['<code>pop()</code> 只删除元素，不返回元素；需要先用 <code>top()</code> 或 <code>front()</code> 读取。', '空栈空队列不能直接取 <code>top()</code> 或 <code>front()</code>。', '栈和队列最重要的区别是出元素顺序。'],
    exercises: ['判断括号串 <code>(()())</code> 是否匹配。', '写出队列依次 push 5、7、9，再 pop 一次后的队头。', '说明为什么 DFS 常用栈思想，BFS 常用队列思想。']
  },
  {
    no: '07',
    doc: 'Pjs4dLRfSorncHxhnBqc4e3Mnme',
    title: '表达式求值',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/UIE4dEp65oWNeVxYGtZc2ki4nBN',
    cardTitle: '知识卡｜表达式求值',
    intro: '表达式求值的核心是“运算顺序”。孩子需要掌握运算符优先级、结合性、短路求值，以及前缀、中缀、后缀表达式的基本区别。',
    exam: [
      ['优先级', '判断表达式先算哪一步', '括号最高，其次乘除模，再加减，再比较和逻辑'],
      ['短路求值', '<code>&amp;&amp;</code> 和 <code>||</code> 是否继续计算右边', '结果已确定时右边不再执行'],
      ['后缀表达式', '给出后缀式求结果', '遇数入栈，遇运算符弹出计算'],
      ['代码阅读', '表达式里自增、自减、赋值', '初赛可能考但要谨慎逐步跟踪']
    ],
    concepts: [
      ['中缀表达式', '平时写的 <code>a + b * c</code> 就是中缀表达式。'],
      ['后缀表达式', '运算符写在操作数后面，例如 <code>2 3 4 * +</code>。'],
      ['短路求值', '<code>A &amp;&amp; B</code> 中 A 为假时不算 B；<code>A || B</code> 中 A 为真时不算 B。']
    ],
    codes: [
      ['cpp', '后缀表达式求值', `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<string> exp = {"2", "3", "4", "*", "+"};
    stack<int> st;
    for (string x : exp) {
        if (isdigit(x[0])) st.push(stoi(x));
        else {
            int b = st.top(); st.pop();
            int a = st.top(); st.pop();
            if (x == "+") st.push(a + b);
            if (x == "*") st.push(a * b);
        }
    }
    cout << st.top() << endl; // 14
}`]
    ],
    examples: [
      ['例 1：<code>2 + 3 * 4</code> 的值是多少？', '乘法优先，所以先算 3×4=12，再算 2+12=14。'],
      ['例 2：<code>0 &amp;&amp; f()</code> 会调用 f 吗？', '不会。左边为假，整个与表达式已经确定为假。']
    ],
    mistakes: ['不要从左到右机械计算，要先看优先级。', '后缀表达式中，弹出的第二个数才是左操作数。', '短路求值会影响函数调用和变量自增是否发生。'],
    exercises: ['计算 <code>5 + 2 * 3 - 4</code>。', '判断 <code>1 || f()</code> 是否会调用 f。', '求后缀表达式 <code>6 2 / 3 +</code> 的值。']
  },
  {
    no: '08',
    doc: 'XnsMd3XAao4459x3ZKXcbArrnCd',
    title: '二叉树的形态与遍历',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/HhzsdN5hvoD5jLxuul3ckDN8nvf',
    cardTitle: '知识卡｜树',
    intro: '树是一种层级结构，二叉树是每个结点最多有两个孩子的树。初赛最常考树的基本概念、结点关系、树高、叶子结点，以及先序、中序、后序遍历。',
    exam: [
      ['概念', '根、父亲、孩子、叶子、深度、高度', '先画出层级关系'],
      ['二叉树形态', '满二叉树、完全二叉树', '看每层是否填满、最后一层是否靠左'],
      ['遍历', '给出树求先/中/后序', '根的位置决定遍历类型'],
      ['还原', '根据遍历序列还原树', '先序找根，中序分左右']
    ],
    concepts: [
      ['先序遍历', '根 → 左 → 右。'],
      ['中序遍历', '左 → 根 → 右。'],
      ['后序遍历', '左 → 右 → 根。'],
      ['层序遍历', '从上到下、从左到右，通常用队列。']
    ],
    codes: [
      ['cpp', '二叉树递归遍历', `struct Node {
    char val;
    Node *left, *right;
};

void preorder(Node *root) {
    if (root == nullptr) return;
    cout << root->val;      // 先访问根
    preorder(root->left);
    preorder(root->right);
}

void inorder(Node *root) {
    if (root == nullptr) return;
    inorder(root->left);
    cout << root->val;      // 中间访问根
    inorder(root->right);
}`]
    ],
    examples: [
      ['例 1：一棵树的根是 A，左孩子 B，右孩子 C，先序是什么？', '先根再左再右，所以是 A B C。'],
      ['例 2：同一棵树的中序是什么？', '左根右，所以是 B A C。']
    ],
    mistakes: ['先序、中序、后序名字里的“先/中/后”指的是根结点访问时机。', '空子树也会影响还原树时左右边界，不能随便忽略。', '完全二叉树不是每层都满，最后一层可以不满但必须靠左。'],
    exercises: ['画一棵根为 A、左子树 B、右子树 C 的二叉树，并写出三种遍历。', '解释满二叉树和完全二叉树的区别。', '层序遍历为什么适合用队列？']
  },
  {
    no: '09',
    doc: 'NRsyd2S2koAO1fxVTuRcejcQnNd',
    title: '图的基础概念和深搜广搜',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/P9RBdFsAEomKGHxrkS2cusnYnJe',
    cardTitle: '知识卡｜图',
    intro: '图用来表示对象之间的连接关系。城市和道路、同学和好友关系、迷宫格子的相邻关系都可以抽象成图。孩子需要掌握顶点、边、度、连通、邻接矩阵/邻接表，以及 DFS、BFS 的基本区别。',
    exam: [
      ['图概念', '顶点数、边数、度数', '无向图中所有度数之和等于 2 倍边数'],
      ['存储方式', '邻接矩阵和邻接表区别', '稠密图可用矩阵，稀疏图常用表'],
      ['DFS', '按深度优先顺序访问', '一路走到底，再回溯'],
      ['BFS', '求最短步数或层次', '一层一层扩展，常用队列']
    ],
    concepts: [
      ['无向图', '边没有方向，A 连到 B 也表示 B 连到 A。'],
      ['有向图', '边有方向，A 指向 B 不代表 B 指向 A。'],
      ['连通', '两个点之间存在路径。'],
      ['搜索', 'DFS 像走迷宫一条路走到底；BFS 像水波一样一圈圈扩散。']
    ],
    codes: [
      ['cpp', '邻接表 DFS', `vector<int> g[1005];
bool vis[1005];

void dfs(int u) {
    vis[u] = true;
    cout << u << " ";
    for (int v : g[u]) {
        if (!vis[v]) dfs(v);
    }
}`],
      ['cpp', '队列 BFS', `queue<int> q;
q.push(start);
vis[start] = true;

while (!q.empty()) {
    int u = q.front();
    q.pop();
    for (int v : g[u]) {
        if (!vis[v]) {
            vis[v] = true;
            q.push(v);
        }
    }
}`]
    ],
    examples: [
      ['例 1：无向图有 5 条边，所有点度数之和是多少？', '每条边贡献两个端点的度数，所以总度数是 10。'],
      ['例 2：迷宫最少走几步通常用 DFS 还是 BFS？', '如果每一步代价相同，用 BFS 更适合求最短步数。']
    ],
    mistakes: ['无向图建边要加两次：u 到 v，v 到 u。', '搜索时一定要标记 visited，避免反复绕圈。', 'DFS 不天然保证最短路，BFS 在等权图中才适合求最短步数。'],
    exercises: ['说出邻接矩阵和邻接表各自适合什么图。', '无向图 6 条边，所有顶点度数和是多少？', '为什么 BFS 要用队列？']
  },
  {
    no: '10',
    doc: 'X1ISdZNhBoxUasxJ0ZRcr08Bnmd',
    title: '算法复杂度分析',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/Joamd7W7foFWlYxpMJMc0T87nOg',
    cardTitle: '知识卡｜时间复杂度与算法复杂度',
    intro: '复杂度用来估计算法随着数据规模变大时会变慢多少。孩子不用死记每段代码，而要学会看循环层数、数据规模和常见算法模式。',
    exam: [
      ['单层循环', '循环 n 次是多少复杂度', '通常 O(n)'],
      ['嵌套循环', '两层都到 n', '通常 O(n^2)'],
      ['二分', '每次规模减半', '通常 O(log n)'],
      ['排序', '常见排序库函数', '通常 O(n log n)']
    ],
    concepts: [
      ['大 O 表示法', '只保留增长最快的主要部分，忽略常数和低阶项。'],
      ['时间复杂度', '估计运行步骤数量随 n 的增长。'],
      ['空间复杂度', '估计算法额外使用的内存随 n 的增长。'],
      ['复杂度排序', '常见从快到慢：O(1)、O(log n)、O(n)、O(n log n)、O(n^2)。']
    ],
    codes: [
      ['cpp', '几种常见复杂度', `// O(n)
for (int i = 0; i < n; i++) cout << i;

// O(n^2)
for (int i = 0; i < n; i++)
    for (int j = 0; j < n; j++)
        cout << i << j;

// O(log n)
while (n > 1) n /= 2;`]
    ],
    examples: [
      ['例 1：两层循环，外层 n 次，内层 m 次，复杂度是多少？', '总次数约为 n×m，所以是 O(nm)。'],
      ['例 2：循环变量每次乘 2，直到超过 n，复杂度是多少？', '规模指数增长，次数约为 log n，所以是 O(log n)。']
    ],
    mistakes: ['不要把所有循环都看成 O(n)，要看循环变量怎么变化。', '顺序执行的两段代码取较大的复杂度。', '嵌套循环通常相乘，连续循环通常相加后取主项。'],
    exercises: ['判断一段三层 n 循环的复杂度。', '说明为什么二分查找是 O(log n)。', 'O(n^2) 和 O(n log n) 哪个增长更快？']
  },
  {
    no: '11',
    doc: 'FLu4dSVxeoZ5Uvx7ANScj9ObnQf',
    title: '递归复杂度分析',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/Kogod4koSouxgkx1UdicTEL4n9f',
    cardTitle: '知识卡｜递归与递推',
    intro: '递归是函数自己调用自己。分析递归复杂度时，要看每次调用产生几个子问题、子问题规模如何变化，以及递归什么时候停止。',
    exam: [
      ['递归出口', '缺少出口会怎样', '可能无限递归直到栈溢出'],
      ['递归次数', '每次 n-1 或 n/2', '画递归链或递归树'],
      ['斐波那契', '朴素递归为什么慢', '重复计算太多'],
      ['分治', '二分递归复杂度', '看层数和每层工作量']
    ],
    concepts: [
      ['递归出口', '最小问题的答案，负责让递归停下来。'],
      ['递归关系', '把大问题拆成更小的同类问题。'],
      ['递归深度', '从第一次调用到最深处一共有多少层。'],
      ['递归树', '把每次调用画成树，方便统计总调用数。']
    ],
    codes: [
      ['cpp', '阶乘递归', `long long fact(int n) {
    if (n == 0) return 1;       // 递归出口
    return n * fact(n - 1);     // 问题规模减 1
}`],
      ['cpp', '朴素斐波那契递归', `int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2); // 会产生大量重复计算
}`]
    ],
    examples: [
      ['例 1：<code>fact(n)</code> 的时间复杂度是多少？', '每层只调用一次，规模从 n 到 0，共 n 层，所以是 O(n)。'],
      ['例 2：每次把 n 除以 2 的递归深度是多少？', '大约是 log n 层。']
    ],
    mistakes: ['递归必须有出口，并且每次调用要更接近出口。', '不要只看代码短，递归可能调用次数很多。', '朴素斐波那契递归复杂度很高，因为重复计算。'],
    exercises: ['写出 <code>fact(4)</code> 的调用过程。', '分析 <code>solve(n/2)</code> 的递归深度。', '说明为什么 <code>fib(5)</code> 会重复计算 <code>fib(3)</code>。']
  },
  {
    no: '12',
    doc: 'MBHrdUWzDopjxqxII8ncEJbEnqf',
    title: '洪水填充算法',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/OQJhdbTqpoSZvGxmg8qc1US8nwe',
    cardTitle: '知识卡｜洪水填充与搜索',
    intro: '洪水填充是网格搜索的经典模型：从一个起点出发，把所有连通的位置都访问一遍。它常用于迷宫、岛屿数量、区域面积、染色等问题。',
    exam: [
      ['连通块', '数有几个区域', '每遇到未访问位置就启动一次搜索'],
      ['区域面积', '一个连通块有多少格', '搜索时计数'],
      ['四方向/八方向', '上下左右还是含斜方向', '看题目定义'],
      ['边界判断', '防止越界和重复访问', '先判范围，再判障碍和 visited']
    ],
    concepts: [
      ['连通', '从一个格子能通过合法移动到另一个格子。'],
      ['四方向', '上、下、左、右。'],
      ['八方向', '四方向再加四个斜方向。'],
      ['visited', '记录哪些格子已经访问过，避免重复搜索。']
    ],
    codes: [
      ['cpp', 'DFS 洪水填充', `int n, m;
char a[105][105];
bool vis[105][105];
int dx[4] = {1, -1, 0, 0};
int dy[4] = {0, 0, 1, -1};

void dfs(int x, int y) {
    vis[x][y] = true;
    for (int k = 0; k < 4; k++) {
        int nx = x + dx[k], ny = y + dy[k];
        if (nx < 0 || nx >= n || ny < 0 || ny >= m) continue;
        if (vis[nx][ny] || a[nx][ny] == '#') continue;
        dfs(nx, ny);
    }
}`]
    ],
    examples: [
      ['例 1：地图中 <code>#</code> 是墙，<code>.</code> 是空地，从某个空地能到达多少格？', '从起点做 DFS 或 BFS，每访问一个空地就计数。'],
      ['例 2：要数岛屿数量怎么做？', '遍历所有格子，遇到未访问的陆地就答案加 1，并搜索掉整座岛。']
    ],
    mistakes: ['越界判断要放在访问数组之前。', '搜索前或刚进入搜索时要标记 visited，否则可能互相递归。', '四方向和八方向一定按题目来，不要默认。'],
    exercises: ['写出四方向数组。', '说明数连通块时为什么每次搜索后答案只加 1。', '把 DFS 版本改成 BFS 版本。']
  },
  {
    no: '13',
    doc: 'QGkXdQJlRogJzZxMMoqc7u1nnWf',
    title: '常见贪心算法类型',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/DYMOdLnySoLxoQxsUXUcgM27nz2',
    cardTitle: '知识卡｜贪心算法',
    intro: '贪心算法每一步都选择当前看来最优的方案。它写起来常常很短，但难点在于判断“局部最优”是否能推出“全局最优”。初赛主要考思想、排序策略和经典模型。',
    exam: [
      ['排序贪心', '按某个关键字排序后选择', '先想排序规则为什么合理'],
      ['区间贪心', '最多选多少不重叠区间', '常按结束时间排序'],
      ['找零/合并', '每步选最大或最小', '需要满足贪心性质'],
      ['反例判断', '某个贪心策略是否总是正确', '尝试构造小数据反例']
    ],
    concepts: [
      ['局部最优', '当前步骤能做出的最好选择。'],
      ['全局最优', '整个问题最终的最好结果。'],
      ['贪心策略', '把“每一步选什么”写成明确规则。'],
      ['证明或反例', '贪心不是凭感觉，策略要么能证明，要么会被反例推翻。']
    ],
    codes: [
      ['cpp', '按结束时间选择最多活动', `struct Seg { int l, r; };

sort(a.begin(), a.end(), [](Seg x, Seg y) {
    return x.r < y.r; // 谁结束早先选谁
});

int ans = 0, last = -1e9;
for (auto s : a) {
    if (s.l >= last) {
        ans++;
        last = s.r;
    }
}`]
    ],
    examples: [
      ['例 1：最多参加不重叠活动，为什么选结束最早的？', '结束越早，留给后面活动的时间越多。'],
      ['例 2：每次都选最大的硬币一定最优吗？', '不一定，要看币值系统。例如某些自定义币值会出现反例。']
    ],
    mistakes: ['贪心策略必须具体，不能只写“选最优”。', '不是所有问题都能贪心，遇到反例就要换思路。', '排序关键字选错，答案可能完全错。'],
    exercises: ['为“最少会议室”问题思考一个贪心方向。', '构造一个硬币系统，让“每次选最大硬币”不是最优。', '解释为什么活动选择按结束时间排序。']
  },
  {
    no: '14',
    doc: 'HvB7dvF7zojkl1xWoQbcnlW8nxc',
    title: '贪心算法：3个经典区间问题',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/DYMOdLnySoLxoQxsUXUcgM27nz2',
    cardTitle: '知识卡｜贪心算法',
    intro: '区间问题是贪心最常见的应用之一。孩子要把题目先翻译成线段：每个任务、活动、覆盖范围都可以看成一个区间，再根据目标选择排序方式。',
    exam: [
      ['最多不重叠区间', '最多选多少个活动', '按右端点从小到大'],
      ['区间覆盖', '用最少区间覆盖目标段', '每步选能覆盖当前位置且右端最远的'],
      ['区间合并', '合并重叠区间后剩几个', '按左端点排序后维护当前右端'],
      ['边界判断', '端点相等算不算重叠', '按题目定义处理开闭区间']
    ],
    concepts: [
      ['右端点优先', '适合“最多选不重叠区间”。'],
      ['左端点排序', '适合合并区间和扫描覆盖。'],
      ['当前覆盖右边界', '区间覆盖题中，记录已经覆盖到哪里。']
    ],
    codes: [
      ['cpp', '合并重叠区间', `sort(seg.begin(), seg.end());
vector<pair<int,int>> res;

for (auto [l, r] : seg) {
    if (res.empty() || l > res.back().second) {
        res.push_back({l, r});
    } else {
        res.back().second = max(res.back().second, r);
    }
}`]
    ],
    examples: [
      ['例 1：区间 [1,3] 和 [2,5] 合并后是什么？', '它们有重叠，合并为 [1,5]。'],
      ['例 2：最多不重叠活动为什么不按开始时间排序？', '开始早不代表结束早，可能占用太长时间，影响后面选择。']
    ],
    mistakes: ['区间题先画数轴，别直接写代码。', '端点相等是否冲突要看题目，比如 [1,2] 和 [2,3] 是否能同时选。', '覆盖问题每一步要选能让右边界走最远的区间。'],
    exercises: ['合并 [1,4]、[2,3]、[6,8]。', '说明最多活动问题为什么按右端点排序。', '给出一个按开始时间排序会失败的例子。']
  },
  {
    no: '15',
    doc: 'IMSPdsW2aoyMV2xRVkqc2mStnAf',
    title: '二分查找的边界分析',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/OiVedCjFeoETprxQd6ZcZMLfnJe',
    cardTitle: '知识卡｜二分查找与二分答案',
    intro: '二分查找用于在有序数据中快速定位目标。孩子最容易错的是左右边界、循环条件和 mid 更新方式，所以这一节重点训练“区间含义”。',
    exam: [
      ['普通查找', '有序数组中找 x', '每次排除一半'],
      ['lower_bound', '找第一个大于等于 x 的位置', '答案在左边界收缩出来'],
      ['upper_bound', '找第一个大于 x 的位置', '注意等于时往右走'],
      ['边界错误', '死循环或漏答案', '明确 l、r 是闭区间还是半开区间']
    ],
    concepts: [
      ['闭区间写法', '<code>[l, r]</code> 中 l 和 r 都可能是答案。'],
      ['半开区间写法', '<code>[l, r)</code> 中 r 不属于搜索范围。'],
      ['mid', '通常写 <code>l + (r - l) / 2</code> 避免溢出。']
    ],
    codes: [
      ['cpp', '闭区间二分查找', `int binarySearch(vector<int>& a, int x) {
    int l = 0, r = (int)a.size() - 1;
    while (l <= r) {
        int mid = l + (r - l) / 2;
        if (a[mid] == x) return mid;
        if (a[mid] < x) l = mid + 1;
        else r = mid - 1;
    }
    return -1;
}`],
      ['cpp', '找第一个大于等于 x 的位置', `int lowerBound(vector<int>& a, int x) {
    int l = 0, r = a.size();
    while (l < r) {
        int mid = l + (r - l) / 2;
        if (a[mid] >= x) r = mid;
        else l = mid + 1;
    }
    return l;
}`]
    ],
    examples: [
      ['例 1：数组 1,3,5,7 中找 5，第一次 mid 指向哪里？', 'l=0,r=3，mid=1，a[mid]=3，然后去右半边。'],
      ['例 2：lower_bound 找 4 返回哪里？', '第一个大于等于 4 的是 5，返回下标 2。']
    ],
    mistakes: ['不要混用闭区间和半开区间写法。', '更新边界时必须让区间变小，否则会死循环。', '二分前提是有序或具有单调性。'],
    exercises: ['手算在 1,4,6,9,10 中查找 9 的过程。', 'lower_bound 找 6 和找 7 分别返回哪里？', '解释为什么 <code>l = mid</code> 有时会死循环。']
  },
  {
    no: '16',
    doc: 'OZh2d0njzo6ybJx7x7PcuGeVnDf',
    title: '二分答案',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/OiVedCjFeoETprxQd6ZcZMLfnJe',
    cardTitle: '知识卡｜二分查找与二分答案',
    intro: '二分答案不是在数组里找数，而是在可能的答案范围里找最优值。关键是写出 check 函数：给定一个答案 x，判断它是否可行。',
    exam: [
      ['最大最小值', '让最小值尽量大，或最大值尽量小', '答案范围有单调性'],
      ['check 函数', '判断某个答案是否可行', '把题目变成 true/false'],
      ['边界', '最终返回 l 还是 r', '取决于寻找最大可行还是最小可行'],
      ['单调性', '可行与不可行分成两段', '没有单调性不能二分答案']
    ],
    concepts: [
      ['答案范围', '先确定答案最小可能值和最大可能值。'],
      ['可行性判断', '用 <code>check(mid)</code> 判断 mid 是否满足条件。'],
      ['最大可行值', '如果 mid 可行，就尝试更大。'],
      ['最小可行值', '如果 mid 可行，就尝试更小。']
    ],
    codes: [
      ['cpp', '寻找最大可行答案模板', `bool check(int x) {
    // 判断答案 x 是否可行
    return true;
}

int l = 0, r = 1000000, ans = 0;
while (l <= r) {
    int mid = l + (r - l) / 2;
    if (check(mid)) {
        ans = mid;      // mid 可行，记录答案
        l = mid + 1;    // 尝试更大
    } else {
        r = mid - 1;
    }
}`]
    ],
    examples: [
      ['例 1：找“最大可行距离”，如果距离 10 可行，下一步往哪边找？', '尝试更大，所以往右半边找。'],
      ['例 2：找“最小可行时间”，如果时间 10 可行，下一步往哪边找？', '尝试更小，所以往左半边找。']
    ],
    mistakes: ['二分答案的核心不是 mid，而是 check。', '先判断单调性，不能把所有最优化题都二分。', '最大可行和最小可行的边界更新方向不同。'],
    exercises: ['举一个可以二分答案的问题。', '说明 check 函数应该返回什么。', '最大可行值问题中，check(mid)=true 时为什么要 l=mid+1？']
  },
  {
    no: '17',
    doc: 'FpWnd8hNmoExYZxx6KkcLRphnpg',
    title: '编码解码',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/FE4Sdc39boOA4ZxNVLRcqcxInnc',
    cardTitle: '知识卡｜编码与解码',
    intro: '编码是把信息按规则变成另一种形式，解码是按规则还原。初赛常考 ASCII、二进制编码、凯撒加密、哈夫曼编码的基本思想。',
    exam: [
      ['ASCII', '字符与数字互转', 'A=65，a=97，0=48'],
      ['凯撒加密', '字母整体平移', '注意超过 z 或 Z 后循环'],
      ['二进制编码', '固定长度编码能表示多少状态', 'k 位二进制能表示 2^k 种状态'],
      ['哈夫曼编码', '为什么常用字符编码短', '频率高的字符用短编码']
    ],
    concepts: [
      ['编码规则', '发送者和接收者都知道的转换规则。'],
      ['固定长度编码', '每个字符用相同位数表示，简单但可能浪费。'],
      ['可变长度编码', '不同字符编码长度不同，需要保证能唯一解码。'],
      ['加密与解密', '加密是隐藏原文，解密是还原原文。']
    ],
    codes: [
      ['cpp', '凯撒加密小写字母', `string caesar(string s, int k) {
    for (char &c : s) {
        if ('a' <= c && c <= 'z') {
            c = char('a' + (c - 'a' + k) % 26);
        }
    }
    return s;
}`]
    ],
    examples: [
      ['例 1：<code>\'A\'</code> 的 ASCII 是 65，<code>\'D\'</code> 是多少？', 'D 比 A 大 3，所以是 68。'],
      ['例 2：小写字母 z 右移 2 位是什么？', 'z 后面循环回 a，所以是 b。']
    ],
    mistakes: ['字符 <code>\'0\'</code> 的 ASCII 不是整数 0，而是 48。', '凯撒加密要处理字母循环。', '可变长度编码必须能唯一解码，否则会产生歧义。'],
    exercises: ['写出字符 <code>\'b\'</code> 的 ASCII 码。', '把 <code>abc</code> 凯撒右移 2 位。', '3 位二进制最多能编码多少种状态？']
  },
  {
    no: '18',
    doc: 'HwGfd31cKoA38yxGuCtcbudnnHf',
    title: '动态规划的基本概念',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/Gaefd6ZVvo4JBzxts6dc0xLGn7c',
    cardTitle: '知识卡｜动态规划',
    intro: '动态规划适合有重复子问题和最优子结构的问题。对初学者来说，先不要追求复杂模型，重点掌握状态、转移、初值、答案四件事。',
    exam: [
      ['状态定义', '<code>dp[i]</code> 表示什么', '先用一句话说清楚'],
      ['转移方程', '当前状态从哪些小状态来', '找最后一步'],
      ['初始值', '边界状态是多少', '没有初值无法递推'],
      ['经典模型', '爬楼梯、最长上升子序列、背包入门', '先识别模型再写转移']
    ],
    concepts: [
      ['状态', '用数组保存子问题答案。'],
      ['转移', '从已知的小问题推出大问题。'],
      ['初值', '最小规模问题的答案。'],
      ['答案', '最终要输出哪个状态。']
    ],
    codes: [
      ['cpp', '爬楼梯 DP', `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<long long> dp(n + 1);
    dp[0] = 1; // 站在第 0 阶有 1 种方式
    for (int i = 1; i <= n; i++) {
        dp[i] += dp[i - 1];
        if (i >= 2) dp[i] += dp[i - 2];
    }
    cout << dp[n] << endl;
}`]
    ],
    examples: [
      ['例 1：一次能走 1 或 2 阶，走到第 i 阶的最后一步可能来自哪里？', '来自 i-1 阶走 1 步，或 i-2 阶走 2 步。'],
      ['例 2：为什么 DP 比朴素递归快？', 'DP 把子问题答案存起来，避免重复计算。']
    ],
    mistakes: ['<code>dp[i]</code> 的含义不清楚，后面转移一定乱。', '转移方程要从更小的已知状态来。', '数组范围要覆盖初值和答案位置。'],
    exercises: ['定义“走到第 i 阶的方法数”的 dp 状态。', '写出爬楼梯的转移方程。', '解释记忆化搜索和 DP 的关系。']
  },
  {
    no: '19',
    doc: 'X4DadWzB2oBM6uxsDXncTZfQnid',
    title: '计算机网络的诞生和发展',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/UjdbdZ6VKoLjNCxFCGxc9aqEnbh',
    cardTitle: '知识卡｜计算机网络基础',
    intro: '计算机网络让不同计算机之间可以交换信息。初赛常考网络发展、互联网基础概念、IP、域名、协议、局域网和广域网等常识。',
    exam: [
      ['网络分类', 'LAN、WAN、互联网', '按覆盖范围区分'],
      ['地址', 'IP 地址和域名', '域名便于人记忆，IP 便于机器定位'],
      ['协议', 'HTTP、TCP/IP、DNS', '协议是通信规则'],
      ['网络设备', '路由器、交换机', '理解基本作用即可']
    ],
    concepts: [
      ['局域网 LAN', '范围较小，如学校机房、家庭网络。'],
      ['广域网 WAN', '范围较大，可以跨城市甚至跨国家。'],
      ['互联网', '把大量网络连接起来形成的全球网络。'],
      ['DNS', '把域名解析成 IP 地址的系统。']
    ],
    codes: [],
    examples: [
      ['例 1：为什么要有域名？', 'IP 地址不方便记忆，域名更适合人使用。'],
      ['例 2：访问网页通常用到什么协议？', '常见是 HTTP 或 HTTPS。']
    ],
    mistakes: ['互联网不等于万维网，网页只是互联网的一种应用。', '域名不是 IP，但可以通过 DNS 找到对应 IP。', '局域网和广域网主要按覆盖范围区分。'],
    exercises: ['举一个局域网的例子。', '说明 DNS 的作用。', 'HTTP 和 HTTPS 哪个更安全？为什么？']
  },
  {
    no: '20',
    doc: 'EhNPdP3fFoegbrxdxhhc9Umnnpb',
    title: '计算机诞生和发展',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/B2UNdVgHgoh7uPx9I69cxK5snhd',
    cardTitle: '知识卡｜计算机发展史',
    intro: '这一节属于计算机基础常识。孩子需要知道计算机发展的几个阶段、硬件核心变化，以及冯·诺依曼结构的基本思想。',
    exam: [
      ['发展阶段', '电子管、晶体管、集成电路、大规模集成电路', '按硬件器件变化记忆'],
      ['冯·诺依曼', '存储程序思想', '程序和数据都存储在内存中'],
      ['五大部件', '运算器、控制器、存储器、输入、输出', 'CPU 包含运算器和控制器'],
      ['计算机特点', '速度快、精度高、自动化', '理解即可']
    ],
    concepts: [
      ['第一代', '电子管计算机，体积大、耗电高。'],
      ['第二代', '晶体管计算机，可靠性提高。'],
      ['第三代', '集成电路计算机。'],
      ['第四代', '大规模和超大规模集成电路计算机。'],
      ['存储程序', '把程序像数据一样放进存储器，计算机按指令自动执行。']
    ],
    codes: [],
    examples: [
      ['例 1：CPU 主要由哪两部分组成？', '运算器和控制器。'],
      ['例 2：冯·诺依曼结构的核心思想是什么？', '存储程序，程序和数据都存储在存储器中。']
    ],
    mistakes: ['不要把输入设备、输出设备和存储器混在一起。', 'CPU 不等于整台计算机，它是核心处理部件。', '发展阶段主要按电子器件变化划分。'],
    exercises: ['列出冯·诺依曼计算机五大部件。', '第一代计算机主要使用什么器件？', '解释“存储程序”的含义。']
  },
  {
    no: '21',
    doc: 'E34Td76uooIqZnxVyPgcattyn5c',
    title: '计算机语言',
    card: 'https://scncdgmg7m6w.feishu.cn/docx/KsN7df8SooVd7qxiUgtc4NDMnbb',
    cardTitle: '知识卡｜编程语言与编译原理',
    intro: '计算机语言是人与计算机沟通的规则。从机器语言到汇编语言，再到高级语言，抽象程度越来越高，编写程序也越来越方便。',
    exam: [
      ['语言层次', '机器语言、汇编语言、高级语言', '越接近机器越难写，越高级越接近人类表达'],
      ['编译解释', '编译型和解释型语言区别', '编译先整体翻译，解释边翻译边执行'],
      ['源程序目标程序', '源代码如何变成可执行程序', '编译、链接等过程'],
      ['C++ 常识', 'C++ 属于高级语言', '竞赛常用编译型语言']
    ],
    concepts: [
      ['机器语言', '由 0 和 1 组成，计算机可以直接执行，但人很难读写。'],
      ['汇编语言', '用助记符表示机器指令，比机器语言稍易读。'],
      ['高级语言', '接近人类表达，需要编译或解释后才能执行。'],
      ['编译', '把源程序整体翻译成目标程序。']
    ],
    codes: [
      ['cpp', 'C++ 源程序示例', `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, CSP!" << endl;
    return 0;
}`]
    ],
    examples: [
      ['例 1：C++ 是机器语言吗？', '不是。C++ 是高级语言，需要编译后运行。'],
      ['例 2：为什么高级语言更适合人写程序？', '它更接近日常逻辑和数学表达，屏蔽了大量机器细节。']
    ],
    mistakes: ['源程序不是可执行程序，通常需要翻译。', '编译和解释都是翻译程序的方法，但执行方式不同。', '机器语言可以被计算机直接执行，但不适合人直接编写。'],
    exercises: ['按从低级到高级排列：高级语言、机器语言、汇编语言。', '解释编译器的作用。', 'C++ 程序的入口函数通常叫什么？']
  }
];

function render(item) {
  const parts = [];
  parts.push(`<title>专题讲解｜${esc(item.title)}</title>`);
  parts.push(`<h1>${esc(item.title)}</h1>`);
  parts.push(p(esc(item.intro)));
  parts.push(`<callout emoji="📌" background-color="light-blue" border-color="blue" text-color="blue"><p><b>先抓主线：</b>${esc(item.concepts[0]?.[1] || '先理解核心概念，再看题目如何考。')}</p></callout>`);
  parts.push('<h2>一、考试怎么考</h2>');
  parts.push(table(['题型', '常见问法', '做题关键'], item.exam.map((r) => r.map(esc))));
  parts.push('<h2>二、核心知识</h2>');
  for (const [name, body] of item.concepts) parts.push(p(`<b>${esc(name)}。</b>${body}`));
  if (item.codes.length) {
    parts.push('<h2>三、带注释代码</h2>');
    for (const [lang, caption, body] of item.codes) parts.push(code(lang, caption, body));
  } else {
    parts.push('<h2>三、理解示意</h2>');
    parts.push(p('本节偏计算机基础常识，重点不是背代码，而是能把概念讲清楚，并能在选择题中识别正确说法。'));
  }
  parts.push('<h2>四、典型例题</h2>');
  for (const [q, a] of item.examples) {
    parts.push(p(`<b>${q}</b>`));
    parts.push(p(`<b>解析：</b>${a}`));
  }
  parts.push('<h2>五、易错点</h2>');
  parts.push(list(item.mistakes));
  parts.push('<h2>六、课后小练习</h2>');
  parts.push(list(item.exercises, true));
  parts.push('<h2>七、配套资料</h2>');
  parts.push(`<p><a type="url-preview" href="${esc(item.card)}">${esc(item.cardTitle)}</a></p>`);
  parts.push('<p><a href="https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg">返回：智子学习资料库｜CSP 学习导航</a></p>');
  return parts.join('\n\n');
}

fs.mkdirSync(outDir, { recursive: true });
const index = [];
for (const lecture of lectures) {
  const file = path.join(outDir, `${lecture.no}.${lecture.title}.xml`);
  fs.writeFileSync(file, render(lecture));
  index.push({ no: lecture.no, title: lecture.title, doc: lecture.doc, file });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify({ count: index.length, outDir }, null, 2));
