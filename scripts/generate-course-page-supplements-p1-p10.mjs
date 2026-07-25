import fs from 'node:fs';
import path from 'node:path';

const outDir = 'reports/learning-materials/course-page-supplements-p1-p10';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function p(text) {
  return `<p>${text}</p>`;
}

function list(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => ordered ? `<li seq="auto">${item}</li>` : `<li>${item}</li>`).join('')}</${tag}>`;
}

function code(caption, body) {
  return `<pre lang="cpp" caption="${esc(caption)}"><code>${esc(body.trim())}</code></pre>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th background-color="light-gray">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const lessons = [
  {
    no: 1,
    title: '基础框架',
    doc: 'PDtpdjcijoyjbDxPVDscY93onMh',
    source: 'P1教案.md',
    focus: ['认识 C++ 程序的基础框架：头文件、命名空间、主函数。', '掌握 <code>cout</code> 输出和 <code>endl</code> 换行。', '能独立写出第一个有输出效果的 C++ 程序。'],
    keyTask: ['输出文字或图案。先写基础框架，再把要显示的内容放进 <code>cout</code>。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello World!" << endl;
    cout << "*" << endl;
    cout << "**" << endl;
    return 0;
}`,
    mistakes: ['<code>cout</code> 必须写在 <code>main</code> 函数的大括号里面。', '字符串要用英文双引号包起来。', '每条语句末尾不要忘记分号。'],
    review: ['默写一遍 C++ 基础框架。', '把卡片里的图案输出题重新写一遍。', '故意删掉一个分号，观察报错，再改回来。']
  },
  {
    no: 2,
    title: 'cin 输入',
    doc: 'NCCRdOReJoKXm5xDOYHcFQBGnxd',
    source: 'P2教案.md',
    focus: ['复习 <code>cout</code> 输出、算式输出和多个内容连接输出。', '理解变量是用来保存会变化的数据。', '掌握 <code>cin</code> 输入，并能写出输入、处理、输出的完整流程。'],
    keyTask: ['输入一个数并输出一句完整的话。关键是先定义变量，再用 <code>cin &gt;&gt;</code> 读入。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int age;
    cin >> age;
    cout << "小明今年" << age << "岁。";
    return 0;
}`,
    mistakes: ['输入方向是 <code>cin &gt;&gt; a</code>，输出方向是 <code>cout &lt;&lt; a</code>。', '使用变量前要先定义变量。', '<code>cout</code> 可以用多个 <code>&lt;&lt;</code> 把文字和变量接起来。'],
    review: ['用自己的话解释“变量像盒子”是什么意思。', '写一个输入身高并输出“身高：xxx”的程序。', '检查自己是否能分清 <code>&gt;&gt;</code> 和 <code>&lt;&lt;</code>。']
  },
  {
    no: 3,
    title: '数据类型（整型）',
    doc: 'YbB2dG1jboYZmOxU0NPci7ofnEh',
    source: 'P3教案.md',
    focus: ['理解变量重新赋值：新的值会覆盖旧的值。', '掌握多个整型变量的定义和赋值。', '区分 <code>int</code> 和 <code>long long</code> 的范围，认识整数溢出。'],
    keyTask: ['处理整数数据。遇到金额、数量、编号这类整数，先判断范围，再选择 <code>int</code> 或 <code>long long</code>。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b;
    return 0;
}`,
    mistakes: ['编程里的 <code>=</code> 是赋值，不是数学里的“相等判断”。', '变量重新赋值后，旧值就被覆盖。', '两个很大的整数相加时，<code>int</code> 可能装不下，要用 <code>long long</code>。'],
    review: ['写出三个变量同时定义的代码。', '试着解释为什么大整数相加要用 <code>long long</code>。', '把一个变量连续赋值两次，观察最后输出哪个值。']
  },
  {
    no: 4,
    title: '数据类型（浮点型）',
    doc: 'XoAjde0cPoPj0AxIUL2cbbzin3d',
    source: 'P4教案.md',
    focus: ['理解整数除法只保留整数部分。', '认识模运算 <code>%</code>，会求商和余数。', '掌握 <code>double</code> 浮点型变量和多变量输入。'],
    keyTask: ['分小卡、求平均、求面积这类题。先找变量，再决定用整数运算还是小数运算。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int cards, people;
    cin >> cards >> people;
    cout << "每人分到" << cards / people << "张" << endl;
    cout << "剩余" << cards % people << "张";
    return 0;
}`,
    mistakes: ['<code>7 / 2</code> 的结果是 3，不是 3.5。', '<code>%</code> 只能用于整数求余。', '需要小数结果时，变量或参与运算的数要用 <code>double</code>。'],
    review: ['手算 <code>17 / 5</code> 和 <code>17 % 5</code>。', '写一个输入三门成绩并计算加权总分的程序。', '解释什么时候应该用 <code>double</code>。']
  },
  {
    no: 5,
    title: '数据类型（字符型）',
    doc: 'PdwNdiOQPok6BzxAj9AcsNG1nYc',
    source: 'P5教案.md',
    focus: ['认识 <code>char</code> 字符型，字符常量使用英文单引号。', '理解 ASCII 码：每个字符都有对应编号。', '掌握字符转 ASCII、大小写字母转换。'],
    keyTask: ['字符转换题。输入一个字符，利用 ASCII 差值计算另一个字符。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    char c;
    cin >> c;
    cout << int(c) << endl;      // 输出 ASCII 码
    cout << char(c - 32) << endl; // 小写字母转大写字母
    return 0;
}`,
    mistakes: ['字符用单引号，例如 <code>\'A\'</code>；字符串用双引号，例如 <code>"A"</code>。', '直接输出 <code>char</code> 显示字符；字符参与运算时常按 ASCII 编号计算。', '记住 <code>\'0\'=48</code>、<code>\'A\'=65</code>、<code>\'a\'=97</code>。'],
    review: ['计算 <code>\'a\' - \'A\'</code> 的值。', '写一个输入小写字母输出大写字母的程序。', '区分字符 <code>\'6\'</code> 和整数 <code>6</code>。']
  },
  {
    no: 6,
    title: '类型转换',
    doc: 'TeqkdyaGvo37RUxqUoxci5wBnxh',
    source: 'P6教案.md',
    focus: ['了解赋值时、算术运算时、强制类型转换时的数据类型变化。', '知道 <code>char</code> 参与算术运算时通常会转成整数。', '掌握 <code>fixed</code> 和 <code>setprecision(n)</code> 控制小数位。'],
    keyTask: ['进度、比例、保留小数题。关键是避免整数除法，并按题目要求保留小数。'],
    sample: `#include <iostream>
#include <iomanip>
using namespace std;

int main() {
    int exp = 25, target = 100;
    cout << fixed << setprecision(2);
    cout << (double)exp / target;
    return 0;
}`,
    mistakes: ['<code>int / int</code> 先做整数除法，再赋给 <code>double</code> 也救不回来。', '<code>%</code> 两边必须是整数。', '使用 <code>setprecision</code> 前要包含 <code>&lt;iomanip&gt;</code>。'],
    review: ['比较 <code>(double)b / 3</code> 和 <code>double(b / 3)</code> 的区别。', '写一个保留 3 位小数的输出。', '判断 <code>\'a\' + 3</code> 的结果类型和含义。']
  },
  {
    no: 7,
    title: '综合运用',
    doc: 'KLSbdriQHob9FXxXgsvcrc6fnbc',
    source: 'P7教案.md',
    focus: ['复习前六课：基础框架、输入输出、变量、整型、浮点型、字符型和类型转换。', '通过 OJ 题训练输入、处理、输出的解题流程。', '能根据数据范围和题目要求选择合适类型。'],
    keyTask: ['两数之和、大小写转换、求十位数、温度转换。每题都按“输入-处理-输出”拆解。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << (long long)a + b;
    return 0;
}`,
    mistakes: ['OJ 题不要只看样例，要考虑隐藏测试点和数据范围。', '大整数相加要主动想到 <code>long long</code>。', '字符转换题要确认输入一定是小写还是需要分类讨论。'],
    review: ['每做一道题前先写出输入、处理、输出。', '把两数之和改成三个数之和。', '复写大小写转换代码并解释为什么减 32。']
  },
  {
    no: 8,
    title: '关系运算符与分支结构',
    doc: 'Ymzndk2b6oYPKWxHMr4chPOJneb',
    source: 'P8教案.md',
    focus: ['认识六个关系运算符：<code>&lt;</code>、<code>&gt;</code>、<code>&lt;=</code>、<code>&gt;=</code>、<code>==</code>、<code>!=</code>。', '理解条件表达式结果是真或假，在 C++ 中也对应 1 或 0。', '掌握单分支和双分支 <code>if/else</code>。'],
    keyTask: ['比较两个数、判断是否为某个数的倍数。关键是把题目条件翻译成表达式。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    if (a > b) {
        cout << a;
    } else {
        cout << b;
    }
    return 0;
}`,
    mistakes: ['判断相等用 <code>==</code>，不是 <code>=</code>。', '判断倍数常用 <code>n % k == 0</code>。', '<code>else</code> 对应的是“前面条件不成立”的情况。'],
    review: ['写一个判断偶数的程序。', '输出两个数中的较大值。', '解释 <code>true</code> 和 <code>false</code> 在输出时为什么可能显示 1 和 0。']
  },
  {
    no: 9,
    title: '逻辑运算符',
    doc: 'OSoHdH9rfolLsixvHMxcNtXZnkO',
    source: 'P9教案.md',
    focus: ['掌握 if 嵌套的应用场景。', '识记逻辑与 <code>&amp;&amp;</code>、逻辑或 <code>||</code>、逻辑非 <code>!</code>。', '理解优先级和短路规则。'],
    keyTask: ['判断一个数是否落在某个范围内。两个条件同时满足用 <code>&amp;&amp;</code>，满足其一用 <code>||</code>。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    if (n >= 50 && n <= 99) {
        cout << "你是荣耀王者";
    }
    return 0;
}`,
    mistakes: ['数学里的 <code>50 &lt;= n &lt;= 99</code> 不能直接照搬到 C++，要写成 <code>n &gt;= 50 &amp;&amp; n &lt;= 99</code>。', '逻辑运算优先级：<code>!</code> 高于 <code>&amp;&amp;</code>，<code>&amp;&amp;</code> 高于 <code>||</code>。', '短路规则会导致右边表达式可能不执行。'],
    review: ['写一个判断分数是否在 0 到 100 之间的程序。', '列出 <code>&amp;&amp;</code> 和 <code>||</code> 的区别。', '手算 <code>(12 &gt; 2) &amp;&amp; (2 &lt; 1)</code>。']
  },
  {
    no: 10,
    title: '多分支结构',
    doc: 'KV9Ad2HkooVZuYx1rhIcZszlnhc',
    source: 'P10教案.md',
    focus: ['理解多分支 <code>if / else if / else</code> 的执行逻辑。', '能用多分支处理多种互斥情况。', '了解注释的作用，能给关键代码添加说明。'],
    keyTask: ['字符分类、成绩分档、余数分类。条件按顺序判断，命中一个分支后后面不再执行。'],
    sample: `#include <iostream>
using namespace std;

int main() {
    char c;
    cin >> c;
    if (c >= 'A' && c <= 'Z') {
        cout << "upper";
    } else if (c >= 'a' && c <= 'z') {
        cout << "lower";
    } else {
        cout << "number";
    }
    return 0;
}`,
    mistakes: ['多分支是从上到下依次判断，不是所有条件都会执行。', '条件顺序会影响结果，尤其是分数段、范围判断题。', '大括号中只有一条语句时虽然可以省略，但初学阶段建议保留。'],
    review: ['写一个成绩评级程序。', '解释 <code>else</code> 的隐藏条件是什么。', '给自己的代码加 2 行注释，说明输入和分支含义。']
  }
];

function render(lesson) {
  const parts = [];
  parts.push(`<hr/>`);
  parts.push(`<h2>本课文字复习</h2>`);
  parts.push(`<callout emoji="📌" background-color="light-blue" border-color="blue" text-color="blue"><p><b>学习提示：</b>下面内容帮助你把卡片知识落到代码和练习里。</p></callout>`);
  parts.push(`<h3>一、本课要掌握什么</h3>`);
  parts.push(list(lesson.focus));
  parts.push(`<h3>二、关键题型</h3>`);
  parts.push(list(lesson.keyTask));
  parts.push(`<h3>三、示例代码</h3>`);
  parts.push(code(`P${lesson.no} ${lesson.title} 核心写法`, lesson.sample));
  parts.push(`<h3>四、易错点</h3>`);
  parts.push(list(lesson.mistakes));
  parts.push(`<h3>五、复习建议</h3>`);
  parts.push(list(lesson.review, true));
  parts.push(`<p><a href="https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg">返回：智子学习资料库｜CSP 学习导航</a></p>`);
  return parts.join('\n\n');
}

fs.mkdirSync(outDir, { recursive: true });
const index = [];
for (const lesson of lessons) {
  const file = path.join(outDir, `P${String(lesson.no).padStart(2, '0')}-${lesson.title}.xml`);
  fs.writeFileSync(file, render(lesson));
  index.push({ no: lesson.no, title: lesson.title, doc: lesson.doc, file });
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify({ count: index.length, outDir }, null, 2));
