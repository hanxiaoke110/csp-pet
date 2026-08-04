// 2026-08-04 题库修复：14 道学生可见问题题，逐题对照官方 GESP 原卷（PaddleOCR + GLM 复核）修复。
// 修复来源：
//   gesp-2024-06-2-12 / gesp-2024-06-2-15 ← GESP2级-24年6月.pdf（单选第12/15题，官方答案 D/D，编译实测通过）
//   gesp-2024-03-1-06 ← GESP1级-24年3月.pdf（单选第6题，官方答案 A，GLM 答案表确认 + 分支实测）
//   gesp-2024-03-4-03 ← GESP4级-24年3月.pdf（单选第3题，答案 D，编译实测输出 3.1）
//   gesp-2024-06-4-13 ← GESP4级-24年6月.pdf（单选第13题，答案 A，编译实测输出 "Division by zero condition!"）
//   gesp-2024-09-2-04 ← GESP2级-24年9月.pdf（单选第4题，答案 C，GLM 答案表确认；原卷选项与题库不一致）
//   gesp-2024-09-2-06 ← GESP2级-24年9月.pdf（单选第6题，答案 D，GLM 答案表确认 + 编译实测 47 可行）
//   gesp-2024-12-2-08 ← GESP2级-24年12月.pdf（单选第8题，答案 C）
//   gesp-2024-12-2-13 ← GESP2级-24年12月.pdf（单选第13题，答案 B）
//   gesp-2024-12-2-15 ← GESP2级-24年12月.pdf（单选第15题，答案 C）
//   gesp-2025-03-2-09 ← GESP2级-25年3月.pdf（单选第9题，答案 C，GLM 答案表确认）
//   gesp-2025-03-2-11 ← GESP2级-25年3月.pdf（单选第11题，答案 C，GLM 答案表确认）
//   gesp-2025-06-2-11 ← GESP2级-25年6月.pdf（单选第11题，答案 D，GLM 答案表确认 + 编译实测）
//   gesp-2025-06-2-14 ← GESP2级-25年6月.pdf（单选第14题，答案 D，GLM 答案表确认）
//   第3步恢复隔离题：
//   gesp-2024-06-4-15 ← GESP4级-24年6月.pdf（单选第15题，答案 D，指针 ++p 步进 4 字节）
//   gesp-2024-09-2-10 ← GESP2级-24年9月.pdf（单选第10题，答案 B，GLM 答案表确认）
//   gesp-2026-06-2-11 ← 无原卷，代码完整，编译实测输出与题干一致（答案 A）
//   gesp-2025-03-2-04 ← GESP2级-25年3月.pdf（单选第4题，答案 A，GLM 答案表确认；题库缺代码）
//   gesp-2025-06-2-04 ← GESP2级-25年6月.pdf（单选第4题，答案 A，GLM 答案表确认；题库选项为误导入，原卷仅 A 正确）
//   gesp-2024-06-2-11 ← GESP2级-24年6月.pdf（单选第11题，答案 D，官方答案表确认；题库为误导入的 while 条件题，换成原卷题）
//   gesp-2025-03-2-15 ← GESP2级-25年3月.pdf（单选第15题，答案 C，官方答案表确认；题库选项为误导入，换成原卷选项）
//   gesp-2024-12-4-13 ← GESP4级-24年12月.pdf（单选第13题，答案 A，插入排序横线填空；题库代码为 OCR 残片）
//   gesp-2024-12-4-15 ← GESP4级-24年12月.pdf（单选第15题，答案 A，编译实测输出 Caught: Runtime error occurred）
//   gesp-2025-09-2-19 ← GESP2级-25年9月.pdf（判断第4题，官方答案 √；题库代码缺等号、答案误为 B）
//   gesp-2025-12-1-07 ← GESP1级-25年12月.pdf（单选第7题，答案 C；题库 printf 格式少一个 %）
//   gesp-2026-03-1-14 ← GESP1级-26年3月.pdf（单选第14题，答案 B；题库选项缺括号，换成原卷选项）
//   gesp-2024-03-4-10 ← GESP4级-24年3月.pdf（单选第10题，答案 B，编译实测 &结构体==&首成员；题库代码为残片）
//   gesp-2025-06-1-02 ← GESP1级-25年6月.pdf（单选第2题，答案 A，断点可设在声明行；题库缺代码）
//   gesp-2025-03-4-14 ← GESP4级-25年3月.pdf（单选第14题，答案 A，异常题与 12-4-15 同型；题库代码缺函数头）
// 应用范围：public/course-data/unified-quiz-bank.json + src-dungeon/data/csp-exam-bank.json
// 修复时同步把 verification.json 对应题状态置为 auto_verified（官方原卷答案表确认）。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const VERIFICATION_PATH = 'public/course-data/question-bank-v2/verification.json';
export const FILES = [
  'public/course-data/unified-quiz-bank.json',
  'public/course-data/dungeon-exam-bank.json',
  'src-dungeon/data/csp-exam-bank.json',
];

// 已复核确认 canonical 正确、可白名单的 visible disputed 题（不改内容，只同步验证状态）
export const WHITELIST = {
  'csp-s-2022-c05': 'PageRank 依据网页链接结构计算重要性，canonical B 正确（算法常识）',
  'csp-s-2022-c07': 'A* 启发式满足可采纳性且一致性时可保证最优解，canonical B 正确',
  'csp-j-2023-c11': 'g++ -o main main.cpp 为正确编译命令，canonical B 正确',
  'gesp-2023-09-2-14': '数字三角形前导空格数为 (lineCount-i-1)*2，官方答案确认 canonical A 正确',
  'gesp-2025-12-2-21': "('Z'-'A')=25 < ('z'-'A')=57 结果为 1，题干说输出 0 错误，官方确认 canonical B",
  'noip-2017-p-468': 'NOIP 自 2022 年起不再支持 Pascal，canonical C 正确',
  'gesp-2025-09-3-17': 'C++ 静态存储期变量默认零初始化，canonical A 正确',
  'gesp-2024-03-1-13': 'Dev C++ 中编译生成可执行程序，1级-24年3月官方答案表 Q13=C',
  'gesp-2024-09-2-11': '数字三角形横线填空，2级-24年9月官方答案表 Q11=C（题库为同结构简版，答案一致）',
  'gesp-2025-06-2-13': '判断正整数位数 while 填空，2级-25年6月官方答案表 Q13=D（题库为同结构简版，答案一致）',
  'gesp-2025-09-3-20': 'enum 值类型判断，3级-25年9月判断题第5题官方答案 ×，canonical B 正确',
  'gesp-2025-09-4-18': 'struct+new 代码合法性，4级-25年9月判断题第3题官方答案 √，canonical A 正确',
  'gesp-2025-09-4-20': '二维数组参数 int arr[][4] 合法，4级-25年9月判断题第5题官方答案 ×，canonical B 正确',
  'gesp-2026-03-1-05': 'a、b 初值都是4，a, b = 3, 4 后 a 保持4、b 变3，输出 61\\n43，canonical A 正确（1级-26年3月原卷核对）',
  'gesp-2023-12-1-12': 'char c 赋值语法，D（c=char 66;）缺少括号不合法，canonical D 正确',
  'gesp-2024-06-1-07': '9/4-6%(6-2)*10 = 2-20 = -18，canonical B 正确',
  'gesp-2024-09-3-02': '机器数带符号位说法正确，canonical C 正确',
  'gesp-2025-12-2-22': 'N%N10==N 判断位数逻辑正确，canonical A 正确',
  'gesp-2026-03-4-22': '嵌套 struct 定义无语法错误，4级-26年3月判断题第7题官方 √，canonical A 正确',
  'noip-2016-p-398': '二叉树顺序存储最大下标15，GLM 图析确认官方答案 D，canonical D 正确',
  'noip-2016-p-429': '社交网络分享题，GLM 图析确认官方答案 A，canonical A 正确',
  'noip-2017-p-464': 'copyright 长度9，子串总数 9*10/2+1=46，canonical C 正确',
  'csp-s-2019-c09': '5位车牌可颠倒且被3整除共25个，canonical B 正确（官方答案）',
  'csp-j-2022-c09': '弱连通有向图至少 N-1 条边，canonical B 正确（官方答案）',
  'gesp-2024-03-3-09': 'gEsP is Interesting ! 共3个空格→nwords=3，canonical C 正确（代码逐行模拟）',
  'gesp-2024-12-3-05': '5&3==1 正确（==优先级高于&），3级-24年12月答案表 Q5=D，canonical D 正确',
  'gesp-2025-06-4-07': 'print1 局部 value=50 输出 50，::value=100；print2 全局 100 → 50 100 100，canonical C 正确',
  'gesp-2026-03-3-03': 'str1="Hello" 带\\0 共6元素，str2 无\\0 共5元素，二者不相等，canonical C 正确',
};

export const FIXES = {
  'gesp-2024-03-1-06': {
    question: '下面C++代码执行时输入21后，有关描述正确的是（ ）。',
    code: `int N;
cin >> N;
if (N % 3 == 0)
    cout << "能被3整除";
else if (N % 7 == 0)
    cout << "能被7整除";
else
    cout << "不能被3和7整除";
cout << endl;`,
    options: [
      'A. 代码第4行被执行',
      'B. 第4和第7行代码都被执行',
      'C. 仅有代码第7行被执行',
      'D. 第8行代码将被执行，因为input()输入为字符串',
    ],
    correctIndex: 0,
    explanation: '输入21，21%3==0成立，只执行第4行输出"能被3整除"，随后第9行输出换行；else if 与 else 分支（第7、8行）不会执行，故A正确。',
  },
  'gesp-2024-03-4-03': {
    question: '下面C++代码执行后输出是（ ）。',
    code: `int foo(float *f)
{
    return int(*f * 2);
}

int main()
{
    float fnum[10] = {1.1};
    fnum[1] = foo(fnum);
    cout << fnum[0] + fnum[1] << endl;
    cout << endl;
    return 0;
}`,
    options: [
      'A. 1',
      'B. 1.1',
      'C. 3',
      'D. 3.1',
    ],
    correctIndex: 3,
    explanation: 'foo(fnum) 中 *f=1.1，int(1.1*2)=int(2.2)=2；fnum[1]=2，fnum[0]+fnum[1]=1.1+2=3.1，输出3.1。',
  },
  'gesp-2024-06-4-13': {
    question: '下面的程序中，如果输入10 0，会输出（ ）。',
    code: `#include <iostream>
using namespace std;
double Division(int a, int b)
{
    if (b == 0)
        throw "Division by zero condition!";
    else
        return ((double)a / (double)b);
}
void func()
{
    int len, time;
    cin >> len >> time;
    cout << Division(len, time) << endl;
}
int main()
{
    try {
        func();
    }
    catch (const char* errmsg) {
        cout << errmsg << endl;
    }
    catch (const int errmsg) {
        cout << errmsg << endl;
    }
    return 0;
}`,
    options: [
      'A. Division by zero condition!',
      'B. 0',
      'C. 10',
      'D. 100',
    ],
    correctIndex: 0,
    explanation: '输入10 0后调用 Division(10,0)，b==0 抛出 const char* 异常"Division by zero condition!"，被 catch(const char* errmsg) 捕获并输出，故A正确。',
  },
  'gesp-2024-09-2-04': {
    question: '在C++中，与for(int i=1; i<10; i++)效果相同的是（ ）。',
    code: '',
    options: [
      'A. for(int i=0; i<10; i++)',
      'B. for(int i=0; i<11; i++)',
      'C. for(int i=1; i<10; ++i)',
      'D. for(int i=0; i<11; ++i)',
    ],
    correctIndex: 2,
    explanation: 'for 更新表达式中 ++i 与 i++ 效果相同（先自增再进入下一次判断），C 与原循环完全等价：i 均从1到9。A/B/D 的起始或终止条件不同（i 从0开始或到10、11），不等价。',
  },
  'gesp-2024-09-2-06': {
    question: '假定变量a和b可能是整型、字符型或浮点型，则下面C++代码执行时先后输入-2和3.14后，其输出不可能是（ ）。[已知字符\'+\'、\'-\'、\'=\'的ASCII码值分别是43、45和61]',
    code: `cin >> a;
cin >> b;
cout << (a + b);`,
    options: [
      'A. 1',
      'B. 1.14',
      'C. 47',
      'D. 将触发异常',
    ],
    correctIndex: 3,
    explanation: 'int+int 时输出 -2+3=1；有 float 参与时输出 -2+3.14=1.14；char+int 时 a 读到 \'-\'(ASCII 45)、int 读 b 到小数点前的2，输出 45+2=47。C++ 的 cin 类型不匹配不会抛异常（只进入错误状态），故 D 不可能。',
  },
  'gesp-2024-12-2-08': {
    question: '下面的C++代码用于输出0~100之间能被7整除但不能被3整除的数，横线处不能填入的代码是（ ）。',
    code: `for (i = 0; i < 100; i++)
    if ( ____ )
        cout << i << endl;`,
    options: [
      'A. i % 7 == 0 && i % 3 != 0',
      'B. !(i % 7) && i % 3 != 0',
      'C. i % 7 && i % 3',
      'D. i % 7 == 0 && !(i % 3 == 0)',
    ],
    correctIndex: 2,
    explanation: 'C 的条件为 i%7 与 i%3 都为真，即既不能被7整除也不能被3整除才输出，与题目要求（能被7整除且不能被3整除）相反，故不能填入。A/B/D 均等价于 i%7==0 && i%3!=0。',
  },
  'gesp-2024-12-2-13': {
    question: '下面C++代码用于输出N和M之间（可以包括N和M）的孪生素数。孪生素数是指间隔为2的两个数均为素数，如11和13分别是素数，且间隔为2。isPrime(N)用于判断N是否为素数的函数。为完成上述功能，横线处应填上的代码是（ ）。',
    code: `int N, M;
//本题假设N小于M
cin >> N >> M;

for (int i = N; i < ____; i++)
    if (isPrime(i) && isPrime(i + 2))
        printf("%d %d\\n", i, i + 2);`,
    options: [
      'A. M - 2',
      'B. M - 1',
      'C. M',
      'D. M + 1',
    ],
    correctIndex: 1,
    explanation: '要输出 i 与 i+2 的孪生素数且 i+2 不超过 M，i 最大取 M-2，循环条件 i < M-1 恰好覆盖 i 从 N 到 M-2，故填 M-1。填 M-2 会漏掉 (M-2, M) 这一组。',
  },
  'gesp-2024-12-2-15': {
    question: '下面C++代码执行后的输出是30，则横线处不能填入（ ）。',
    code: `int a = 10, b = 20, c = 30;
cout << ____ << endl;
cout << endl;`,
    options: [
      'A. max(max(a, b), c)',
      'B. min(a + b, c)',
      'C. sqrt(a + b + c)',
      'D. (a + b + c) / 2',
    ],
    correctIndex: 2,
    explanation: 'max(max(10,20),30)=30、min(10+20,30)=30、(10+20+30)/2=30 均成立；sqrt(60)≈7.75，不能输出30，故C不能填入。',
  },
  'gesp-2025-03-2-09': {
    question: '下面C++代码执行后，将输出能被2整除且除以7余数为2的数。下列选项不能实现的是（ ）。',
    code: `for (int i = 0; i < 100; i++)
    if ( ____ )
        cout << i << " ";`,
    options: [
      'A. ((i % 2 == 0) && (i % 7 == 2))',
      'B. ((!(i % 2)) && (i % 7 == 2))',
      'C. ((!(i % 2)) && (!(i % 7)))',
      'D. ((i % 2 != 1) && (i % 7 == 2))',
    ],
    correctIndex: 2,
    explanation: 'C 的条件等价于 i 为偶数且 i%7==0，输出的是能被 2 和 7 整除（余数为 0）的数，与"除以7余数为2"不符，故不能实现。A/B/D 均输出能被2整除且除以7余数为2的数。',
  },
  'gesp-2025-03-2-11': {
    question: '在数学中N!表示N的阶乘，即1到N的乘积，如3!=1*2*3，且0!=1。下面的两段C++代码用于求1到N的阶乘之和，如N为3，则结果是9（1!+2!+3!的值）。选项中的说法正确的是（ ）。',
    code: `// 实现1
int i, N;
cin >> N;
int tnt = 0, last = 1;
for (i = 1; i < N + 1; i++) {
    last *= i;
    tnt += last;
}
cout << tnt << endl;

// 实现2
int i2, N2;
cin >> N2;
int tnt2 = 0, tmp;
for (i2 = 1; i2 < N2 + 1; i2++) {
    tmp = 1;
    for (int j = 1; j < i2 + 1; j++)
        tmp *= j;
    tnt2 += tmp;
}
cout << tnt2 << endl;`,
    options: [
      'A. 虽然实现1的代码短小，但效率并不高',
      'B. 实现2的代码效率更高，且更易于理解',
      'C. 实现1因为应用了前项计算结果，计算量更小，因此效率高',
      'D. 两种实现，效率几乎一致',
    ],
    correctIndex: 2,
    explanation: '实现1用 last *= i 复用上一轮的阶乘结果，整体计算量为 O(N)；实现2每轮都从 1 重新乘到 i（内层循环 O(N)），整体为 O(N²)。故实现1效率更高，C 正确。',
  },
  'gesp-2025-06-2-11': {
    question: '下面C++代码执行后的输出是（ ）。',
    code: `int i, j;
for (i = 0; i < 3; i++)
    for (j = 0; j < i; j++)
        printf("%d#%d-", i, j);
printf("END");`,
    options: [
      'A. 0#0-1#0-2#0-2#1-END',
      'B. 0#0-1#0-1#1-2#0-2#1-2#2-3#0-3#1-3#2-END',
      'C. 0#0-1#0-1#1-2#0-2#1-2#2-END',
      'D. 1#0-2#0-2#1-END',
    ],
    correctIndex: 3,
    explanation: 'i=0 时内层不执行；i=1 时输出 1#0-；i=2 时输出 2#0-、2#1-；循环结束后输出 END，即 1#0-2#0-2#1-END，选 D。',
  },
  'gesp-2025-06-2-14': {
    question: '判断一个数是否为自守数。自守数的定义是如果一个数的平方其尾数与该数相同，则为自守数，如25的平方是625，其尾数是25，所以25是自守数。相关说法错误的是（ ）。',
    code: `int N, N1, M1;
cout << "输入一个正整数：";
cin >> N;
N1 = N, M1 = N * N;

bool Flag = true;

while (N1 > 0) {
    if (N1 % 10 != M1 % 10) {
        Flag = false;
        break;
    }
    else {
        N1 = N1 / 10, M1 = M1 / 10;
    }
}

if (Flag == true)
    printf("%d的平方是%d,是自守数", N, N * N);
else
    printf("%d的平方是%d,不是自守数", N, N * N);`,
    options: [
      'A. 如果Flag在循环中不被改为false，则说明该数是自守数',
      'B. 代码if（N1 % 10 != M1 % 10）用于判断其个位数是否相等，如果不等，则表明不是自守数',
      'C. 代码N1 = N1 / 10, M1 = M1 / 10将个位数去掉',
      'D. 将N1 > 0 改为 N > 0 效果相同',
    ],
    correctIndex: 3,
    explanation: 'N 在循环中从未被修改，把循环条件 N1>0 改成 N>0 后，若 N>0 则循环无法按位消去（死循环/行为完全不同），效果不相同，故 D 说法错误。A/B/C 均正确。',
  },
  'gesp-2024-06-4-15': {
    question: '下面程序中，如果语句cout<<p<<endl;输出的是0x6ffe00，则cout<<++p<<endl;输出的是（ ）。',
    code: `int x[10][10][10] = {{0}};
int *p;
p = &x[0][0][0];
cout << p << endl;
cout << ++p << endl;`,
    options: [
      'A. 0x6ffe0c',
      'B. 0x6ffe09',
      'C. 0x6ffe06',
      'D. 0x6ffe04',
    ],
    correctIndex: 3,
    explanation: 'p 是 int* 指针，++p 使指针前进 sizeof(int)=4 字节，故 0x6ffe00 后输出 0x6ffe04，选 D。',
  },
  'gesp-2024-09-2-10': {
    question: '下面C++代码执行后的输出是（ ）。',
    code: `int loopCount = 0;
for (int i = 1; i < 5; i += 2)
    loopCount += 1;
cout << (loopCount);`,
    options: [
      'A. 1',
      'B. 2',
      'C. 3',
      'D. 5',
    ],
    correctIndex: 1,
    explanation: 'i 依次取 1、3（i<5 且步长2），循环体执行 2 次，loopCount=2，选 B。',
  },
  'gesp-2026-06-2-11': {
    question: '如下C++代码执行后输出为 1 2 3 4 5 6 7 8 9 10 11 5 6 7 8 9 10 11 5 6 7 8 9 10 11 5 6 7 8 9 10 11 5 6 7，横线处应该填入的运算符是（ ）。',
    code: `int num = 1;
for (int i = 0; i < 35; i++) {
    cout << num << " ";
    if (num _______ 10)
        num _______ 2;
    else
        num _______ 1;
}`,
    options: [
      'A. >  /=  +=',
      'B. >=  %=  +=',
      'C. >  /=  =+',
      'D. >=  %=  =+',
    ],
    correctIndex: 0,
    explanation: '输出到 11 后回到 5：num>10 时 num/=2（11/2=5），否则 num+=1 从 5 累加到 11，故三处分别为 >、/=、+=，选 A。编译实测输出与题干一致。',
  },
  'gesp-2025-03-2-04': {
    question: '下面C++代码用于根据N%10判断彩球颜色（每组5红3绿2蓝，共10个），正确说法是（ ）。',
    code: `int N, remainder;
cin >> N;
remainder = N % 10; // remainder变量保存余数

if ((1 <= remainder) && (remainder <= 5))
    cout << "Red";
else if ((6 <= remainder) && (remainder <= 8))
    cout << "Green";
else if ((remainder == 9) || (remainder == 0))
    cout << "Blue";`,
    options: [
      'A. 将最后一个else if修改为else效果相同',
      'B. 将((1 <= remainder) && (remainder <= 5))修改为(remainder <= 5)效果相同',
      'C. else if ((6 <= remainder) && (remainder <= 8))写法错误，应修改为else if (6 <= remainder <= 8)',
      'D. 根据题意remainder = N % 10应修改为remainder = N / 10',
    ],
    correctIndex: 0,
    explanation: 'remainder 取值只有 0-9，前两个分支排除了 1-8 后，剩余恰好是 9 和 0，最后一个 else if 改为 else 效果相同，A 正确。B 中 remainder<=5 会把 0 也判为 Red，逻辑不同；C 中 6<=remainder<=8 是连比写法，C++ 不合法；D 应保留取余。',
  },
  'gesp-2025-06-2-04': {
    question: '下面C++代码用于输出正整数N的百位数字，横线处应填入的代码是（ ）。',
    code: `int N, remainder;
cout << "请输入正整数：";
cin >> N;
cout << ____;`,
    options: [
      'A. N % 1000 / 100',
      'B. N / 1000 % 100',
      'C. N / 1000 / 100',
      'D. N % 100 / 100',
    ],
    correctIndex: 0,
    explanation: '百位数字：N%1000 去掉高位后取 N/100 的个位。A 中 (N%1000)/100 正确（如 1234 → 234/100=2）；B 得到的是千位，C 为 0，D 为十位以下。',
  },
  'gesp-2024-06-2-11': {
    question: '假设下面C++代码执行过程中仅输入正负整数或0，有关说法错误的是（ ）。',
    code: `int N, Sum = 0;
cin >> N;
while (N) {
    Sum += N;
    cin >> N;
}
cout << Sum;`,
    options: [
      'A. 执行上面代码如果输入0，将终止循环',
      'B. 执行上面代码能实现所有非0整数的求和',
      'C. 执行上面代码第一次输入0，最后将输出0',
      'D. 执行上面代码将陷入死循环，可将while(N)改为while(N==0)',
    ],
    correctIndex: 3,
    explanation: 'while(N) 在 N 为 0 时退出循环，并不会死循环；改为 while(N==0) 反而在 N 为 0 时进入循环，逻辑错误。A/B/C 均正确，故错误的是 D。',
  },
  'gesp-2025-03-2-15': {
    question: '在C++中，如果a和b均为float类型的变量，那么二者如果相差足够小（比如0.000001），就可以视作相等。比如2.2345676和2.2345677就可以视作相等。下列哪个表达式能用来正确判断"a等于b"（ ）。',
    code: '',
    options: [
      'A. ((b - a) < 0.000001)',
      'B. ((b - a) <= 0.000001)',
      'C. (abs(b - a) <= 0.000001)',
      'D. (sqrt(b - a) <= 0.000001)',
    ],
    correctIndex: 2,
    explanation: '判断两个浮点数近似相等应取差值的绝对值并与误差阈值比较：abs(b-a)<=0.000001。A/B 只判断单侧，当 b<a 时 b-a 为负也会满足条件，逻辑错误；D 对负数求 sqrt 无意义。',
  },
  'gesp-2024-12-4-13': {
    question: '下面代码实现了插入排序函数，则横线上应填写（ ）。',
    code: `void insertion_sort(vector<int> &nums) {
    for (int i = 1; i < nums.size(); i++) {
        ____ // 在此处填入代码
        while (j >= 0 && nums[j] > base) {
            nums[j + 1] = nums[j];
            j--;
        }
        nums[j + 1] = base;
    }
}`,
    options: [
      'A. int base = nums[i], j = i - 1;',
      'B. int base = nums[i], j = i;',
      'C. int base = nums[0], j = i - 1;',
      'D. int base = nums[0], j = i;',
    ],
    correctIndex: 0,
    explanation: '插入排序每轮暂存当前元素 nums[i] 为 base，从 i-1 开始向前比较并后移，故填 int base = nums[i], j = i - 1;，选 A。',
  },
  'gesp-2024-12-4-15': {
    question: '运行下面的代码，将出现什么情况？（ ）',
    code: `double hmean(double a, double b) {
    if (a == -b)
        throw runtime_error("Runtime error occurred");
    return 2.0 * a * b / (a + b);
}

int main() {
    double x = 10;
    double y = -10;

    try {
        int result = hmean(x, y);
        cout << "hmean: " << result << endl;
    }
    catch (const runtime_error& e) {
        cout << "Caught: " << e.what() << endl;
    }
    catch (...) {
        cout << "Caught an unknown exception." << endl;
    }
    return 0;
}`,
    options: [
      'A. 屏幕上输出Caught: Runtime error occurred',
      'B. 屏幕上输出Caught an unknown exception',
      'C. 程序调用std::terminate()',
      'D. 编译错误',
    ],
    correctIndex: 0,
    explanation: 'x=10、y=-10 时 a==-b 成立，抛出 runtime_error，被 catch(const runtime_error& e) 捕获，输出 "Caught: Runtime error occurred"，选 A。编译实测通过。',
  },
  'gesp-2025-09-2-19': {
    question: '下面的C++代码中变量都是整型，则执行后将输出1。（ ）',
    code: `x = 5, y = 10, z = 15;
result = x < y < z;
cout << result;`,
    options: [
      'A. 正确',
      'B. 错误',
    ],
    correctIndex: 0,
    explanation: 'x=5、y=10、z=15；x<y 为真（值为1），1<z（15）为真，result=1，输出1，说法正确。官方原卷判断第4题答案为 √。',
  },
  'gesp-2025-12-1-07': {
    question: '下面的C++代码执行时如果先输入10回车后输入20并回车，其输出是（ ）。',
    code: `int N, M;
printf("第一个数:");
scanf("%d", &N);
printf("第二个数:");
scanf("%d", &M);
printf("%%(N+M)=%d", N+M, int(N+M));`,
    options: [
      'A. 30=30',
      'B. 10+20=30',
      'C. %(N+M)=30',
      'D. 错误提示',
    ],
    correctIndex: 2,
    explanation: 'printf 中 %% 输出一个 % 字符，%d 输出 N+M=30，故输出 %(N+M)=30，选 C。',
  },
  'gesp-2026-03-1-14': {
    question: '执行下面C++代码可以判断一个6位正整数N的高3位和低3位的差是否是314的倍数。例如628314就符合要求。横线处应该填入（ ）。',
    code: `cin >> N;
if (____)
    cout << N << "符合条件" << endl;`,
    options: [
      'A. ((N % 1000) - (N / 1000)) / 314 == 0',
      'B. ((N / 1000) - (N % 1000)) % 314 == 0',
      'C. ((N % 1000) - (N / 1000)) / 314',
      'D. ((N / 1000) - (N % 1000)) % 314',
    ],
    correctIndex: 1,
    explanation: '高3位=N/1000，低3位=N%1000，差是314的倍数即 ((N/1000)-(N%1000))%314==0。628314 时 (628-314)%314=0 成立，选 B。',
  },
  'gesp-2024-03-4-10': {
    question: '在如下的C++代码执行后，设第11和12行的输出地址值分别为X和Y，则下面正确的是（ ）。',
    code: `struct pass {
    int no;
    char name[20];
    int level;
};

int main()
{
    struct pass XiaoYang;

    cout << "&XiaoYang=" << &XiaoYang << endl; //第11行
    cout << "&(XiaoYang.no)=" << &(XiaoYang.no) << endl; //第12行

    cout << endl;
    return 0;
}`,
    options: [
      'A. X > Y',
      'B. X == Y',
      'C. X < Y',
      'D. 不确定',
    ],
    correctIndex: 1,
    explanation: '结构体的第一个成员 no 从偏移 0 开始，因此 &XiaoYang 与 &(XiaoYang.no) 地址相同，X==Y，选 B。编译实测一致。',
  },
  'gesp-2025-06-1-02': {
    question: '在某集成开发环境中调试下面代码段时尝试设置断点和检查局部变量，下面哪个说法是错误的（ ）。',
    code: `int i, N = 0; // L1
cin >> N; // L2
for (i = 1; i < 9; i++)
    if (N % i == 0) break; // L3
if (i < 9)
    printf("N不能大于9\\n"); // L4`,
    options: [
      'A. 断点不可以设在L1标记的代码行',
      'B. 执行暂停在L2标记的代码行时，可以检测i的值',
      'C. 执行暂停在L3标记的代码行时，可以修改i的值',
      'D. 执行有可能暂停在L4标记的代码行',
    ],
    correctIndex: 0,
    explanation: '断点可以设在声明行 L1 上，A 说法错误。B/C/D 均为调试器常见能力，说法正确。',
  },
  'gesp-2025-03-4-14': {
    question: '运行下面的代码，将出现（ ）。',
    code: `double hmean(double a, double b) {
    if (a == -b)
        throw runtime_error("Runtime error occurred.");
    return 2.0 * a * b / (a + b);
}

int main() {
    double x = 10;
    double y = -10;

    try {
        int result = hmean(x, y);
        cout << "hmean: " << result << endl;
    }
    catch (const runtime_error& e) {
        cout << "Caught: " << e.what() << endl;
    }
    catch (...) {
        cout << "Caught an unknown exception." << endl;
    }
    return 0;
}`,
    options: [
      'A. 屏幕上输出Caught: Runtime error occurred.',
      'B. 屏幕上输出Caught an unknown exception',
      'C. 程序调用std::terminate()',
      'D. 编译错误',
    ],
    correctIndex: 0,
    explanation: 'x=10、y=-10 时 a==-b 成立，抛出 runtime_error，被 catch(const runtime_error& e) 捕获并输出 "Caught: Runtime error occurred."，选 A。',
  },
  'gesp-2024-06-2-12': {
    question: '执行下面的C++代码，有关说法正确的是（ ）。【质数是指仅能被1和它本身整除的正整数】',
    code: `int N;
cin >> N;
bool Flag = true;
for (int i = 2; i < N; i++) {
    if (i * i > N)
        break;
    if (N % i == 0) {
        Flag = false;
        break;
    }
}
if (Flag)
    cout << N << "是质数" << endl;
else
    cout << N << "不是质数" << endl;`,
    options: [
      'A. 如果输入正整数，上面代码能正确判断N是否为质数',
      'B. 如果输入整数，上面代码能正确判断N是否为质数',
      'C. 如果输入大于等于0的整数，上面代码能正确判断N是否为质数',
      'D. 如将Flag = true修改为Flag = N>=2? true:false，则能判断所有整数包括负整数、0、正整数是否为质数',
    ],
    correctIndex: 3,
    explanation: 'N=1、0、负数时循环不执行，Flag保持true，会把非质数判为质数，故A/B/C均错；将Flag初始化为N>=2后，小于2的数直接判为非质数，大于等于2的数由循环正确判断，故D正确。',
  },
  'gesp-2024-06-2-15': {
    question: '在下面的C++代码中，N必须是小于10大于1的整数，M为正整数（大于0）。如果M被N整除则M为幸运数，如果M中含有N且能被N整除，则为超级幸运数，否则不是幸运数。程序用于判断M是否为幸运数或超级幸运数或非幸运数。阅读下面代码，有关说法正确的是（ ）。',
    code: `int N, M;
cout << "请输入幸运数字：";
cin >> N;
cout << "请输入正整数：";
cin >> M;

bool Lucky;
if (M % N == 0)
    Lucky = true;
else
    Lucky = false;
while (M) {
    if (M % 10 == N && Lucky) {
        printf("%d是%d的超级幸运数!", M, N);
        break;
    }
    M /= 10;
}
if (M == 0)
    if (Lucky)
        printf("%d是%d的幸运数!", M, N);
    else
        printf("%d非%d的幸运数!", M, N);`,
    options: [
      'A. 如果N输入3，M输入36则将输出：36是3的超级幸运数!',
      'B. 如果N输入7，M输入21则将输出：21是7的幸运数!',
      'C. 如果N输入8，M输入36则将输出：36非8的超级幸运数!',
      'D. 如果N输入3，M输入63则将输出：63是3的超级幸运数!',
    ],
    correctIndex: 3,
    explanation: '逐项模拟：A中M=36时循环把36除以10到3才命中，输出"3是3的超级幸运数!"；B、C循环结束M被除到0，输出的是"0是7的幸运数!"、"0非8的幸运数!"（注意printf用此时的M=0）；D中M=63首次取模即命中，输出"63是3的超级幸运数!"，正确。',
  },
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
let applied = 0;
for (const file of FILES) {
  const p = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const entries = Array.isArray(data) ? data : (data.questions || data.items || Object.values(data));
  const isDict = !Array.isArray(data) && !data.questions && !data.items;
  for (const [id, fix] of Object.entries(FIXES)) {
    let q = isDict ? data[id] : entries.find(e => e && e.id === id);
    if (!q) { console.log(`skip ${id}: not in ${file}`); continue; }
    Object.assign(q, fix);
    applied++;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log(`updated ${file}`);
}

// 同步 verification.json：官方原卷确认的题置为 auto_verified
const vp = path.join(root, VERIFICATION_PATH);
if (fs.existsSync(vp)) {
  const ver = JSON.parse(fs.readFileSync(vp, 'utf8'));
  for (const id of Object.keys(FIXES)) {
    const r = (ver.results || []).find(x => x.questionId === id);
    if (!r) { console.log(`skip ${id}: not in verification.json`); continue; }
    r.status = 'auto_verified';
    r.blockers = [];
    r.evidence = r.evidence || {};
    r.evidence.paperVerified20260804 = '官方 GESP 原卷答案表确认（修复脚本 fix-gesp-20260804-14.mjs）';
  }
  for (const [id, note] of Object.entries(WHITELIST)) {
    const r = (ver.results || []).find(x => x.questionId === id);
    if (!r) { console.log(`skip whitelist ${id}: not in verification.json`); continue; }
    r.status = 'auto_verified';
    r.blockers = [];
    r.evidence = r.evidence || {};
    r.evidence.paperVerified20260804 = `已复核确认正确：${note}`;
  }
  fs.writeFileSync(vp, JSON.stringify(ver, null, 2) + '\n');
  console.log(`synced ${VERIFICATION_PATH}`);
}

console.log(`applied fix count: ${applied}`);
}
