import fs from 'node:fs';
import path from 'node:path';

const outDir = 'reports/learning-materials/course-page-supplements-p11-p69';
const lessonIndexPath = 'public/course-data/course-card-index.json';
const lessonData = JSON.parse(fs.readFileSync(lessonIndexPath, 'utf8'));
const lessons = (lessonData.lessons || lessonData.items || lessonData).filter((lesson) => lesson.lessonNo >= 11 && lesson.lessonNo <= 69);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function list(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => ordered ? `<li seq="auto">${item}</li>` : `<li>${item}</li>`).join('')}</${tag}>`;
}

function code(caption, body) {
  return `<pre lang="cpp" caption="${esc(caption)}"><code>${esc(body.trim())}</code></pre>`;
}

function mdPath(no) {
  const base = '/Users/hanliuliu/Desktop/学生成长计划/教学资料/教案/教案md合集';
  const direct = path.join(base, `P${no}教案.md`);
  if (fs.existsSync(direct)) return direct;
  const spaced = path.join(base, `P${no} 教案.md`);
  if (fs.existsSync(spaced)) return spaced;
  return direct;
}

function extractGoals(no) {
  const file = mdPath(no);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const goalBlock = (text.match(/#### 知识与技能目标([\s\S]*?)(?=####|## 二、|##二、|### 教学|$)/) || [])[1] || '';
  return [...goalBlock.matchAll(/\*\s+(.+?)(?:\n|$)/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function contains(title, words) {
  return words.some((word) => title.includes(word));
}

function profile(title) {
  if (contains(title, ['switch'])) {
    return {
      keyTask: ['多选一分类判断。适合菜单、星期、等级这类离散值判断。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int day;
    cin >> day;
    switch (day) {
        case 1: cout << "Monday"; break;
        case 2: cout << "Tuesday"; break;
        default: cout << "Other";
    }
    return 0;
}`,
      mistakes: ['<code>case</code> 后面要写常量值。', '每个分支通常要写 <code>break</code>，否则会继续执行后面的分支。', '<code>default</code> 用来处理没有匹配到的情况。'],
      review: ['写一个输入月份输出季节的程序。', '解释 <code>break</code> 的作用。', '比较 <code>switch</code> 和多分支 <code>if</code> 的适用场景。']
    };
  }
  if (contains(title, ['for 循环', 'while 循环', '单层循环', '循环嵌套', '循环综合'])) {
    const nested = contains(title, ['嵌套']);
    return {
      keyTask: [nested ? '双层循环图形、枚举行列。外层通常控制行，内层通常控制列。' : '重复执行一段代码。先确定循环变量、起点、终点和每次变化。'],
      sample: nested ? `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++) {
            cout << "*";
        }
        cout << endl;
    }
    return 0;
}` : `#include <iostream>
using namespace std;

int main() {
    int n, sum = 0;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        sum += i;
    }
    cout << sum;
    return 0;
}`,
      mistakes: ['循环边界最容易错，要检查是否包含最后一个数。', '循环变量要能逐步接近结束条件。', nested ? '内层循环每轮结束后，通常需要换行。' : '累加变量要在循环前初始化。'],
      review: ['手算循环会执行几次。', nested ? '画出 i 和 j 的变化表。' : '把 1 到 n 求和改成求偶数和。', '检查代码是否可能死循环。']
    };
  }
  if (contains(title, ['数学函数'])) {
    return {
      keyTask: ['使用常见数学函数解决取整、绝对值、平方根等问题。'],
      sample: `#include <iostream>
#include <cmath>
using namespace std;

int main() {
    double x;
    cin >> x;
    cout << abs(x) << endl;
    cout << sqrt(x) << endl;
    return 0;
}`,
      mistakes: ['使用数学函数通常需要包含 <code>&lt;cmath&gt;</code>。', '函数名、括号和参数都不能漏。', '注意返回值可能是小数。'],
      review: ['查清 <code>abs</code>、<code>sqrt</code>、<code>pow</code> 的作用。', '写一个计算圆面积的程序。', '观察整数和小数参与函数计算时的输出。']
    };
  }
  if (contains(title, ['一维数组', '标记数组', '桶数组'])) {
    return {
      keyTask: ['批量保存同类数据。常见题型是遍历、统计、标记是否出现、计数。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, a[105], sum = 0;
    cin >> n;
    for (int i = 0; i < n; i++) {
        cin >> a[i];
        sum += a[i];
    }
    cout << sum;
    return 0;
}`,
      mistakes: ['数组下标通常从 0 开始，到 n-1 结束。', '不要访问数组范围外的位置。', '计数数组使用前要初始化为 0。'],
      review: ['写一个输入 n 个数并求最大值的程序。', '手画数组下标和值的对应关系。', '检查循环边界是不是 <code>i &lt; n</code>。']
    };
  }
  if (contains(title, ['字符数组', '字符串'])) {
    return {
      keyTask: ['处理一串字符。常见任务是遍历字符串、统计字符、查找或修改字符。'],
      sample: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string s;
    cin >> s;
    int cnt = 0;
    for (int i = 0; i < (int)s.size(); i++) {
        if (s[i] >= '0' && s[i] <= '9') cnt++;
    }
    cout << cnt;
    return 0;
}`,
      mistakes: ['<code>char</code> 是一个字符，<code>string</code> 是一串字符。', '字符串下标也从 0 开始。', '读入带空格的一整行时不能只用 <code>cin &gt;&gt; s</code>。'],
      review: ['遍历一个字符串并输出每个字符。', '统计字符串中字母 a 出现几次。', '解释 <code>s.size()</code> 的含义。']
    };
  }
  if (contains(title, ['二维数组'])) {
    return {
      keyTask: ['处理表格、地图、棋盘这类行列结构。外层循环控制行，内层循环控制列。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, m, a[55][55];
    cin >> n >> m;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) {
            cin >> a[i][j];
        }
    }
    cout << a[0][0];
    return 0;
}`,
      mistakes: ['行和列不要写反。', '二维数组有两个下标：行下标和列下标。', '遍历时要分别检查行边界和列边界。'],
      review: ['画出 3 行 4 列数组的下标。', '写一个求每一行和的程序。', '说明 <code>a[i][j]</code> 中 i 和 j 分别表示什么。']
    };
  }
  if (contains(title, ['函数'])) {
    return {
      keyTask: ['把重复或独立的小任务封装成函数。重点看参数、返回值和调用方式。'],
      sample: `#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

int main() {
    int x, y;
    cin >> x >> y;
    cout << add(x, y);
    return 0;
}`,
      mistakes: ['函数要先定义或声明，再调用。', '形参是函数接收的数据，实参是调用时传进去的数据。', '有返回值的函数不要忘记 <code>return</code>。'],
      review: ['写一个求最大值的函数。', '解释形参和实参的区别。', '把一段重复代码改成函数。']
    };
  }
  if (contains(title, ['结构体'])) {
    return {
      keyTask: ['把同一个对象的多个信息放在一起，例如姓名、分数、年龄。常和排序结合。'],
      sample: `#include <iostream>
#include <algorithm>
using namespace std;

struct Student {
    string name;
    int score;
};

bool cmp(Student a, Student b) {
    return a.score > b.score;
}`,
      mistakes: ['结构体定义末尾要有分号。', '访问成员用点号，例如 <code>s.score</code>。', '排序时比较函数要写清楚谁排前面。'],
      review: ['定义一个保存学生姓名和成绩的结构体。', '写一个按成绩从高到低排序的比较函数。', '说明结构体和普通变量的区别。']
    };
  }
  if (contains(title, ['递推'])) {
    return {
      keyTask: ['用前面的结果推出后面的结果。重点是初始值和递推公式。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    long long f[105];
    f[1] = 1;
    f[2] = 1;
    for (int i = 3; i <= n; i++) {
        f[i] = f[i - 1] + f[i - 2];
    }
    cout << f[n];
    return 0;
}`,
      mistakes: ['递推数组要先设置初始值。', '循环要从能被公式推出的位置开始。', '注意答案对应的是第几个状态。'],
      review: ['写出斐波那契数列前 6 项。', '解释 <code>f[i]</code> 的含义。', '检查递推公式是否只用了已知状态。']
    };
  }
  if (contains(title, ['枚举'])) {
    return {
      keyTask: ['把可能答案逐个尝试。关键是枚举范围、判断条件和避免漏解。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int x = 1; x <= n; x++) {
        if (n % x == 0) {
            cout << x << " ";
        }
    }
    return 0;
}`,
      mistakes: ['枚举范围太小会漏答案，太大可能超时。', '判断条件要和题目要求完全一致。', '可以利用数学性质缩小枚举范围。'],
      review: ['列出一个数的所有因数。', '说明什么情况下适合枚举。', '思考如何优化枚举范围。']
    };
  }
  if (contains(title, ['模拟'])) {
    return {
      keyTask: ['按题目规则一步步执行。重点是读懂规则、维护状态、按顺序更新。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, x = 0;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        x += i;
    }
    cout << x;
    return 0;
}`,
      mistakes: ['模拟题不要跳步骤，状态更新顺序很重要。', '变量含义要清楚，否则容易写乱。', '样例能过不代表所有边界都能过。'],
      review: ['把题目规则写成步骤清单。', '用小数据手动模拟一遍。', '检查每个变量在每一步如何变化。']
    };
  }
  if (contains(title, ['前缀和'])) {
    return {
      keyTask: ['快速求一段连续区间的和。先预处理前缀和，再用差值回答查询。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, a[1005], s[1005] = {};
    cin >> n;
    for (int i = 1; i <= n; i++) {
        cin >> a[i];
        s[i] = s[i - 1] + a[i];
    }
    int l, r;
    cin >> l >> r;
    cout << s[r] - s[l - 1];
    return 0;
}`,
      mistakes: ['前缀和常用 1 开始下标，方便写 <code>s[l-1]</code>。', '区间和公式是 <code>s[r] - s[l-1]</code>。', '要先预处理，再回答查询。'],
      review: ['手算数组 2,3,5 的前缀和。', '解释为什么区间和可以用两个前缀和相减。', '写一个多次查询区间和的程序。']
    };
  }
  if (contains(title, ['差分'])) {
    return {
      keyTask: ['快速做区间加法。差分适合多次修改，最后再还原数组。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, l, r, x, d[1005] = {};
    cin >> n >> l >> r >> x;
    d[l] += x;
    d[r + 1] -= x;
    int cur = 0;
    for (int i = 1; i <= n; i++) {
        cur += d[i];
        cout << cur << " ";
    }
    return 0;
}`,
      mistakes: ['区间 [l,r] 加 x，要在 <code>d[l]</code> 加，在 <code>d[r+1]</code> 减。', '最后需要做一次前缀累加还原。', '注意 <code>r+1</code> 是否越界。'],
      review: ['手算一次区间加法后的差分变化。', '说明差分和前缀和的关系。', '写一个支持多次区间加的程序。']
    };
  }
  if (contains(title, ['贪心'])) {
    return {
      keyTask: ['每一步选择当前最优策略。常见做法是先排序，再按规则选择。'],
      sample: `#include <iostream>
#include <algorithm>
using namespace std;

int main() {
    int n, a[1005];
    cin >> n;
    for (int i = 0; i < n; i++) cin >> a[i];
    sort(a, a + n);
    cout << a[0];
    return 0;
}`,
      mistakes: ['贪心策略要能说明为什么合理，不能只凭感觉。', '排序关键字选错会导致答案错误。', '遇到反例时，这个贪心策略就不能用。'],
      review: ['说出本题每一步贪心选什么。', '尝试构造反例检查策略。', '写出排序规则。']
    };
  }
  if (contains(title, ['排序', 'sort', '计数排序'])) {
    return {
      keyTask: ['把数据按规则排列。重点是排序范围、比较规则和排序后的使用方式。'],
      sample: `#include <iostream>
#include <algorithm>
using namespace std;

int main() {
    int n, a[1005];
    cin >> n;
    for (int i = 0; i < n; i++) cin >> a[i];
    sort(a, a + n);
    for (int i = 0; i < n; i++) cout << a[i] << " ";
    return 0;
}`,
      mistakes: ['<code>sort(a, a+n)</code> 排的是下标 0 到 n-1。', '从大到小需要写比较规则或使用反向处理。', '计数排序适合值域不大的整数。'],
      review: ['写一个从小到大排序程序。', '把排序改成从大到小。', '说明什么时候适合计数排序。']
    };
  }
  if (contains(title, ['最大公因数', '辗转相除'])) {
    return {
      keyTask: ['求两个整数的最大公因数。辗转相除法反复使用余数缩小问题。'],
      sample: `#include <iostream>
using namespace std;

int gcd(int a, int b) {
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}`,
      mistakes: ['辗转相除每一步是 <code>a,b = b,a%b</code>。', '注意输入可能大小顺序不同。', '最小公倍数可用 <code>a / gcd(a,b) * b</code> 避免溢出。'],
      review: ['手算 gcd(24,18)。', '写出 while 版 gcd。', '解释为什么余数会让问题变小。']
    };
  }
  if (contains(title, ['质因数', '埃氏筛'])) {
    return {
      keyTask: ['处理质数、质因数分解或批量筛质数。注意 1 不是质数。'],
      sample: contains(title, ['筛']) ? `#include <iostream>
using namespace std;

bool isPrime[1005];

int main() {
    int n;
    cin >> n;
    for (int i = 2; i <= n; i++) isPrime[i] = true;
    for (int i = 2; i * i <= n; i++) {
        if (isPrime[i]) {
            for (int j = i * i; j <= n; j += i) isPrime[j] = false;
        }
    }
    return 0;
}` : `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 2; i * i <= n; i++) {
        while (n % i == 0) {
            cout << i << " ";
            n /= i;
        }
    }
    if (n > 1) cout << n;
    return 0;
}`,
      mistakes: ['1 不是质数。', '判断质数只需要试到平方根。', '分解质因数时要用 <code>while</code> 连续除。'],
      review: ['分解 120 的质因数。', '说明为什么只试到平方根。', '写出 2 到 30 的质数。']
    };
  }
  if (contains(title, ['二分'])) {
    return {
      keyTask: ['在有序数据或单调答案范围中快速查找。每次排除一半。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int n, x, a[1005];
    cin >> n >> x;
    for (int i = 0; i < n; i++) cin >> a[i];
    int l = 0, r = n - 1;
    while (l <= r) {
        int mid = l + (r - l) / 2;
        if (a[mid] == x) {
            cout << mid;
            return 0;
        } else if (a[mid] < x) l = mid + 1;
        else r = mid - 1;
    }
    cout << -1;
    return 0;
}`,
      mistakes: ['二分前提是有序或有单调性。', '边界更新必须让区间变小。', '要明确查找区间是闭区间还是半开区间。'],
      review: ['手算一次二分查找过程。', '解释 <code>mid</code> 的计算方式。', '找一个二分会失败的无序例子。']
    };
  }
  if (contains(title, ['动态数组', '队列'])) {
    return {
      keyTask: ['使用动态数组或队列管理一批数据。队列遵循先进先出。'],
      sample: `#include <iostream>
#include <queue>
using namespace std;

int main() {
    queue<int> q;
    q.push(1);
    q.push(2);
    cout << q.front() << endl;
    q.pop();
    cout << q.front();
    return 0;
}`,
      mistakes: ['队列是先进先出，不是后进先出。', '<code>pop()</code> 只删除，不返回元素。', '取队首前要确认队列非空。'],
      review: ['模拟队列 push 和 pop 的顺序。', '说明队列和栈的区别。', '写一个简单排队程序。']
    };
  }
  if (contains(title, ['栈'])) {
    return {
      keyTask: ['使用栈处理后进先出的问题，如括号匹配、表达式求值。'],
      sample: `#include <iostream>
#include <stack>
using namespace std;

int main() {
    stack<int> st;
    st.push(1);
    st.push(2);
    cout << st.top() << endl;
    st.pop();
    cout << st.top();
    return 0;
}`,
      mistakes: ['栈是后进先出。', '<code>pop()</code> 不返回值，先 <code>top()</code> 再 <code>pop()</code>。', '空栈不能取栈顶。'],
      review: ['模拟 1、2、3 入栈后的出栈顺序。', '写一个括号匹配思路。', '比较栈和队列。']
    };
  }
  if (contains(title, ['进制', '位权', '补码', '位运算', '编码'])) {
    return {
      keyTask: ['理解二进制表示、进制转换和位运算规则。先转成二进制，再按位分析。'],
      sample: `#include <iostream>
using namespace std;

int main() {
    int x, k;
    cin >> x >> k;
    if (x & (1 << k)) cout << 1;
    else cout << 0;
    return 0;
}`,
      mistakes: ['二进制是逢二进一。', '补码题要先看最高位。', '位运算要加括号，例如 <code>x &amp; (1 &lt;&lt; k)</code>。'],
      review: ['把 13 转成二进制。', '计算一个简单按位与。', '解释左移一位通常相当于乘 2。']
    };
  }
  return {
    keyTask: ['围绕本课主题完成一道小题。先读题，再拆成输入、处理、输出。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n;
    return 0;
}`,
    mistakes: ['先确认变量含义，再写代码。', '注意输入输出格式。', '写完后用样例手动检查。'],
    review: ['复述本课核心知识。', '独立写一遍示例代码。', '做一道同类题巩固。']
  };
}

function focusFromGoals(title, goals) {
  const clean = goals
    .map((goal) => goal.replace(/。?$/, '。'))
    .filter((goal) => !goal.includes('classin') && !goal.includes('tart'))
    .slice(0, 3);
  if (clean.length >= 2) return clean;
  return [`掌握「${esc(title)}」的核心概念和基本写法。`, '能根据题目要求选择合适的数据结构或控制结构。', '能独立完成一题同类练习并检查边界。'];
}

function render(lesson) {
  const goals = extractGoals(lesson.lessonNo);
  const detail = profile(lesson.title);
  const focus = focusFromGoals(lesson.title, goals);
  const parts = [];
  parts.push('<hr/>');
  parts.push('<h2>本课文字复习</h2>');
  parts.push('<callout emoji="📌" background-color="light-blue" border-color="blue" text-color="blue"><p><b>学习提示：</b>下面内容帮助你把卡片知识落到代码和练习里。</p></callout>');
  parts.push('<h3>一、本课要掌握什么</h3>');
  parts.push(list(focus));
  parts.push('<h3>二、关键题型</h3>');
  parts.push(list(detail.keyTask));
  parts.push('<h3>三、示例代码</h3>');
  parts.push(code(`P${lesson.lessonNo} ${lesson.title} 核心写法`, detail.sample));
  parts.push('<h3>四、易错点</h3>');
  parts.push(list(detail.mistakes));
  parts.push('<h3>五、复习建议</h3>');
  parts.push(list(detail.review, true));
  parts.push('<p><a href="https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg">返回：智子学习资料库｜CSP 学习导航</a></p>');
  return parts.join('\n\n');
}

fs.mkdirSync(outDir, { recursive: true });
const index = [];
for (const lesson of lessons) {
  const safeTitle = lesson.title.replace(/[/:]/g, '·');
  const file = path.join(outDir, `P${String(lesson.lessonNo).padStart(2, '0')}-${safeTitle}.xml`);
  fs.writeFileSync(file, render(lesson));
  index.push({ no: lesson.lessonNo, title: lesson.title, doc: lesson.documentId, file, source: mdPath(lesson.lessonNo) });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify({ count: index.length, outDir }, null, 2));
