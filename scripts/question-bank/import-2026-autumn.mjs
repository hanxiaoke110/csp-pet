import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeLegacyQuestion, stableContentHash } from './lib/normalize.mjs';
import { validateQuestion } from './lib/validate.mjs';

const sourceRoot = '/Users/hanliuliu/Desktop/老师成长计划/学习平台/gesp-learning-h5/public';
const output = 'scripts/question-bank/data/autumn-2026.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const explanations = {
  J: [
    'long long通常为64位有符号整数，范围覆盖10^18+1；float和double不能精确表示此整数，int范围不足。',
    '2F5(16)=757(10)=1365(8)。',
    '整数除法7/3=2，2×3+7%3=6+1=7。',
    '输出3后，栈顶是2而不是1，所以3、1、2、4不可能。',
    '完全二叉树叶子数为n-floor(n/2)，100个结点有50个叶子。',
    '按3或5的倍数累加，并将15的倍数重复计数扣除，得到2418。',
    'f(0)=1，f(n)=f(n-1)+f(n-2)+f(n-3)，计算f(8)=81。',
    '按题定邻居顺序执行BFS，E入队时累计14个格子；网格已保留在代码区。',
    'n=6t且gcd(t,10)=1，t≤16；符合的t为1、3、7、9、11、13，共6个。',
    '6+1+1+1需4枚，但4+4+1只需3枚；任意两枚无法组成9。',
    'p指向a[2]；先令a[1]=5+9=14，再令a[3]=14-1=13。',
    '最坏比较次数floor(log2(1000))+1=10。',
    'a[10]=S[10]-S[9]=(300+10)-(243+9)=58。',
    '选中位数7，距离和6+4+3+0+3+8+13=37。',
    '度数总和4×3+6×4=36，边数36/2=18。',
    '输入3的两个二进制位均为1，x与y均从1增加到3。',
    '删除奇数分支的++x后，偶数位只增加x，不能保证x=y，例如n=2。',
    '每个二进制位都增加x，只有1位增加y，所以x≥y。',
    'n降到0后仍满足n≥0，0/2仍为0，因此死循环。',
    '6的二进制为110，共3位、2个1，故x=4、y=3。',
    'y=2表示只有一个二进制1，即2^0至2^30，共31个。',
    '逐位加法产生579，输出额外最高位0，结果0579。',
    '123+456为579，但程序仍输出最高位0，反例0579。',
    '没有进位时结果不变，例如1+1；因此不一定更小。',
    '12345+678=13023，额外输出最高位0，结果013023。',
    '十位相加等于10时不再进位，直接输出数位10，连同其余位得到01010。',
    '无进位到第n位时，程序仍从第n位输出0；长度为n+1。',
    '输入10时输出23、29、31、37、53、59、71、73、79，共9行，不是10。',
    '起始枚举包含5且5为素数；当n≤5时直接输出5。',
    '大于10的素数不可能以偶数或5结尾；只枚举奇数不会漏掉输出。',
    '深度优先搜索先处理23的扩展239，再输出29，所以第三行是29。',
    '递归只从质数继续向下生成，删去末位得到的是递归路径中的质数。',
    '对n=200运行质数前缀DFS，共输出14行。',
    '已有数乘mn，在n进制下等价于先乘m再左移一位，故b[j]=b[j-1]*m。',
    'Horner展开每轮乘原进制后加新数位x，因此b[0]=x。',
    '以n为基数进位，向上一位加b[j]/n。',
    '当前数位保留除以n的余数b[j]%n。',
    '仅删除多余最高位零，必须保留表示数值0的一位，故len>1。',
    '数字字符减0，A至F减(A-10)，分界为A而不是9。',
    '每段终点从l至n逐一枚举，包含单元素段及最后一段。',
    '分段长度r-l+1，先乘1.0避免整数除法截断。',
    '下一段从r+1开始；只有r<n才计入切口，同时维护均值最小值和最大值。',
    '1-based数组从1开始，尚无切口，最小值初始正无穷、最大值负无穷。',
  ],
  S: [
    'x&=x-1每轮消去最低位1；2026二进制有8个1。',
    '依次合并最小两项：3、6、9、13、15、21、36，累加102。',
    '1至999的百、十、个位各有100个1，再计1000中的1，总计301。',
    '先选装对的2封，共C(5,2)=10；其余3封错排2种，共20。',
    '模100逐次快速幂计算3^2026余29。',
    '区间DP：dp[l][r]=min(dp[l][k]+dp[k+1][r])+区间重量，最优总代价34。',
    '查询访问11、10、8，共3项；修改访问3、4、8、16，共4项。',
    '1必须在2和3之前，前三者有2种顺序，再将孤立点4插入4个位置，共8种。',
    '每层子问题规模总和为n，最长和最短路径深度均为Θ(log n)，总计Θ(n log n)。',
    '最长路径9-5-2-1-3-6-7-8有7条边；删除1后最大连通分量为4，重心为1。',
    '多结点缩点DAG强连通化最少新增max(源点数,汇点数)=max(3,4)=4条边。',
    '左右子树可区分的二叉树数为Catalan(6)=C(12,6)/7=132。',
    '真前后缀是ab、abab，长度和2+4=6。',
    '相等时也先取右边并累加左边剩余数，统计i<j且a[i]≥a[j]的数对。',
    '快速幂计算2^100 mod1000=376。',
    '全0输入在模2长除法中始终为0，最后12位均为0。',
    '从左向右对每个最高位1消元，gen[0]=1，处理后a[0..31]全部为0。',
    'a为全局数组，默认零初始化；删除显式补零循环不改变初值。',
    'gen共有13位，按从高到低存储，gen[0]为除数最高位。',
    '输入后补12个零，再用异或完成GF(2)多项式长除法，输出12位余数。',
    '去掉continue后每次执行固定异或；输出区间a[32..43]仅由固定异或决定，与输入无关。',
    'gcd(2,6,3,3)=1。',
    '长度1时lg[1]=0，左右区间相同，都为a[L]。',
    'gcd不大于最小值，且可能更小，例如gcd(2,3)=1。',
    'dp[i][j]由两个相邻长度2^(j-1)区间合并，表示长度2^j区间的gcd。',
    '共有Θ(log n)层，每层最多n项，建表Θ(n log n)。',
    '程序在pw[t+1]≥i时保持t，lg并非通常floor(log2)；lg[x]=5对应33≤x≤64。',
    '链1-2-3-4-5的直径为4条边。',
    'f[1]为根到最远点距离，ans为直径；两条分支构成反例。',
    '先更新父深度会把当前子树重复用于直径，例如n=2可算成2，而原程序为1。',
    '遍历每个结点时用已处理子树最大深度与当前子树深度连接，ans是直径边数。',
    '给定满二叉树的两个最深叶子之间距离为4。',
    '直径9要求整棵树为链；编号递增的父约束等价将2..9分配到1的两侧，两侧互换等价，共2^8=256。',
    '边的符号必须编码为+1或-1，才能记录正负边及权值差。',
    '队列有未处理元素的条件是hh<tt。',
    'BFS发现相邻新结点，距离为d[x]+1。',
    '相邻结点颜色相同时说明存在奇环，图不是二分图。',
    '两种符号均存在时，可往返调整差值2；非二分图可改变奇偶。非二分图或端点同色时最小值0，否则1。',
    '2(r_i-x_i)=m-2x_i+Σv_ij*y_j，因此常数c[i]=m-2*x[i]。',
    '反射格雷码g=mask^(mask>>1)，相邻状态恰有一个比特变化。',
    'd是单比特差，ctzll(d)得到变化的学生下标k。',
    's[k]翻转后常数贡献变化-2*s[k]*c[k]，故C-=2ll*s[k]*c[k]。',
    '列贡献v总和与n同奇偶；选A当v≥0，奇数n时等价v≥1，即v≥(n&1)。',
  ],
};
const keys = {J:'BDCCBDDCBAADCABTFTACCTFFBACFTTBDCD BDBCB DCAD'.replaceAll(' ',''), S:'DDCDACABADCCBCBTTFCBCTTFBBDTFFACCCDBACCBDAA'};
assert.equal(keys.J.length,43); assert.equal(keys.S.length,43);
const clean = text => text.replace(/\*\*/g,'').trim();
function parseOptions(text) {
  const matches = [...text.matchAll(/(?:^|\s)([ABCD])\.\s*([\s\S]*?)(?=(?:\s[ABCD]\.\s)|$)/g)];
  assert.deepEqual(matches.map(m=>m[1]), ['A','B','C','D']);
  return matches.map(m=>clean(m[2]).replace(/^`([\s\S]*)`$/,'$1'));
}
const rawSource = fs.readFileSync('reports/csp-2026/luogu-source.md','utf8');
const rawQuestions=[];
const quarantined=[];
for (const group of ['J','S']) {
  const section = rawSource.split(`### CSP-${group}\n`)[1].split(/### 答案/)[0];
  const choices = section.split('## 一、单项选择题')[1].split('## 二、阅读程序')[0];
  for (const m of choices.matchAll(/### (\d+)\n([\s\S]*?)(?=\n### \d+\n|$)/g)) {
    const number=Number(m[1]); let text=m[2];
    const code=text.match(/```[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() || null;
    text=text.replace(/```[^\n]*\n[\s\S]*?```/g,'');
    const start=text.search(/(?:^|\n)A\.\s/m);
    assert(start>=0);
    let stem=clean(text.slice(0,start));
    // The grid in J8 is represented verbatim in the code block, not a missing image.
    if(group==='J'&&number===8) stem=stem.replace('下图','以下代码区所示网格');
    rawQuestions.push({id:`csp-${group.toLowerCase()}-2026-c${String(number).padStart(2,'0')}`,source:'csp_exam',group,year:2026,originalNumber:number,type:'choice',question:stem,code,options:parseOptions(text.slice(start)),correctIndex:'ABCD'.indexOf(keys[group][number-1]),explanation:explanations[group][number-1],knowledgePoint:group==='J'?'CSP-J综合':'CSP-S综合',difficulty:group==='J'?3:5});
  }
  for(const [kind,label,count] of [['reading','二、阅读程序',3],['fillBlank','三、完善程序',2]]) {
    const part=section.split(`## ${label}`)[1]?.split('## 三、完善程序')[0];
    assert(part);
    const blocks=[...part.matchAll(/### （(\d)）([^\n]*)\n([\s\S]*?)(?=\n### （\d）|$)/g)];
    assert.equal(blocks.length,count);
    for(const block of blocks) {
      const no=Number(block[1]), text=block[3], first=kind==='reading'?16+(no-1)*6:34+(no-1)*5;
      const id=`csp-${group.toLowerCase()}-2026-${kind==='reading'?'r':'f'}${String(no).padStart(2,'0')}`;
      if(group==='J'&&kind==='reading'&&no===1) {quarantined.push({id,numbers:[16,17,18,19,20,21],reason:'Luogu explicitly labels obscured ++y as tentative OCR recovery'});continue;}
      let code=text.match(/```cpp\n([\s\S]*?)```/)?.[1]?.trim(); assert(code);
      let repair=null;
      if(group==='J'&&kind==='fillBlank'&&no===2) {code+='\n}';repair='洛谷文本末尾缺少main闭合括号，为可编译展示补齐；填空内容未变。';}
      const withoutCode=text.replace(/```cpp\n[\s\S]*?```/g,'');
      const children=[...withoutCode.matchAll(/(?:^|\n)(\d+)\.\s*([\s\S]*?)(?=\n\d+\.\s|$)/g)].map(m=>{
        const n=Number(m[1]), start=m[2].search(/(?:^|\s)A\.\s/);
        const options=start<0?['正确','错误']:parseOptions(m[2].slice(start).replace(/:::[\s\S]*/,''));
        return {label:clean(start<0?m[2]:m[2].slice(0,start)),options,correctIndex:start<0?(keys[group][n-1]==='T'?0:1):'ABCD'.indexOf(keys[group][n-1]),explanation:explanations[group][n-1],position:kind==='fillBlank'?n-first+1:null};
      });
      assert.equal(children.length,kind==='reading'?6:5);
      rawQuestions.push({id,source:'csp_exam',group,year:2026,originalNumber:first,type:kind,question:clean(withoutCode.split(new RegExp(`\\n${first}\\.`))[0]),code,options:[],[kind==='reading'?'subQuestions':'blanks']:children,explanation:children.map(c=>c.explanation).join('\n')+(repair?'\n'+repair:''),knowledgePoint:kind==='reading'?'程序阅读':'程序补全',difficulty:group==='J'?3:5});
    }
  }
}
const questions=rawQuestions.map(q=>{
  const result=normalizeLegacyQuestion(q);
  result.provenance={...result.provenance,level:'secondary',url:'https://www.luogu.com.cn/discuss/1380094',answerUrl:null};
  delete result.contentHash; result.contentHash=stableContentHash(result);
  return result;
});
const sources=[];
for(let level=1;level<=8;level++) {
  const file=`data/exams/202609-${level}.json`, local=fs.readFileSync(path.join(sourceRoot,file),'utf8');
  const remoteResponse=await fetch(`https://shanhai.cspstudy.top/gesp/${file}`);assert(remoteResponse.ok);
  const remote=await remoteResponse.json(), exam=JSON.parse(local);
  assert.deepEqual(remote,exam,`online/local GESP level ${level} mismatch`);
  sources.push({level,url:`https://shanhai.cspstudy.top/gesp/${file}`,sha256:digest(local),officialPdf:exam.source.officialPdf});
  const chosen=exam.questions.filter(q=>q.type==='choice');assert.equal(chosen.length,15);
  for(const q of chosen) {
    const number=Number(q.id.match(/q(\d+)$/)[1]);
    let stem=q.stem;
    const codeBlocks=[...stem.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1].trim());
    stem=stem.replace(/```[^\n]*\n[\s\S]*?```/g,'').trim();
    let image=null;
    if(q.image) {
      const bytes=fs.readFileSync(path.join(sourceRoot,q.image.replace(/^\//,'')));
      const imageResponse=await fetch(`https://shanhai.cspstudy.top/gesp/${q.image.replace(/^\//,'')}`);assert(imageResponse.ok);
      assert.equal(digest(Buffer.from(await imageResponse.arrayBuffer())),digest(bytes));
      const name=`gesp-2026-09-${level}-${String(number).padStart(2,'0')}${path.extname(q.image)}`;
      fs.mkdirSync('public/course-data/gesp-question-images',{recursive:true});
      fs.copyFileSync(path.join(sourceRoot,q.image.replace(/^\//,'')),`public/course-data/gesp-question-images/${name}`);
      image=`/course-data/gesp-question-images/${name}`;
    }
    questions.push(normalizeLegacyQuestion({id:`gesp-2026-09-${level}-${String(number).padStart(2,'0')}`,source:'gesp',year:2026,examDate:'2026-09',level,originalNumber:number,question:stem,code:codeBlocks.join('\n\n')||null,image,options:q.options.map((o,i)=>{assert.equal(o.key,'ABCD'[i]);assert(o.text||o.imageText);return o.text||o.imageText;}),correctIndex:'ABCD'.indexOf(q.answer),explanation:q.analysis,knowledgePoint:`GESP ${level}级`,difficulty:level,sourceUrl:exam.source.officialPdf,answerSourceUrl:exam.source.officialPdf}));
  }
}
for(const q of questions) {const check=validateQuestion(q);assert.deepEqual(check.blockers,[],`${q.id}: ${check.blockers}`);assert(q.explanation);}
assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
fs.writeFileSync(output,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),questions,quarantined,sources},null,2)+'\n');
console.log(`Prepared ${questions.length} records; GESP120 choices; CSP39 records/80 subitems; quarantined J16–21.`);
