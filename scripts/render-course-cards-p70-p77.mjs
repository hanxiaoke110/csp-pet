import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = 'reports/learning-materials/course-cards-p70-p77';
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const lessons = [
  { n:70, title:'递归算法（一）', story:'七层塔的传令铃', scene:'塔顶的小信使要算出七层共有多少盏灯。它把下面六层交给下一位信使，自己只数这一层。每位信使都照做，直到第一层直接报出答案，再一层层把结果送回。', rule:'递归：先交出小问题，再接回答案。', diagram:['sum(4) → sum(3) → sum(2) → sum(1) → sum(0)','10 ← 6 ← 3 ← 1 ← 0'], keys:[['说清含义','sum(n) 表示 1 到 n 的和。'],['找到出口','n=0 时直接返回 0。'],['缩小规模','每次调用 sum(n−1)。'],['接住答案','返回 sum(n−1)+n。']], checks:['sum(4) 的结果？','输出放在递归前，会先看到 3 还是 1？','gcd(12,8) 最后停在哪组参数？'], answers:['10','3；递进时先输出。','(4,0)'], pitfall:'有出口还不够：每次调用都必须向出口靠近。', practice:'18205 倒计时 · 18206 累加和 · 18207 GCD' },
  { n:71, title:'递归算法（二）', story:'楼梯口的答案本', scene:'小伙伴要走到第五级台阶，每步能走一级或两级。它发现：最后一步只能从第四级或第三级来。两个助手不断问同样的问题，于是它拿出答案本：算过一次就记下，下次直接翻看。', rule:'重复的子问题，用记忆化保存答案。', diagram:['最后一步走 1 级：从 n−1 来','最后一步走 2 级：从 n−2 来','f(n) = f(n−1) + f(n−2)'], keys:[['状态','f(n)：到第 n 级的走法数。'],['出口','f(1)=1，f(2)=2。'],['记忆化','先查 memo，再计算并保存。'],['防重复','因数按非递减顺序枚举。']], checks:['四级台阶有几种走法？','f(3) 已缓存，再调用会重算吗？','8 有几种非递减乘积分解？'], answers:['5','不会，直接返回缓存。','3：8、2×4、2×2×2'], pitfall:'n=50 的走法超过 int，数组与返回值都要用 long long。', practice:'18344 爬楼梯 · 18350 记忆化 · 18352 数的分解' },
  { n:72, title:'综合练习（一）', story:'假期里的旅行列车', scene:'旅行列车沿着固定路线经过六个景点，分别要花 3、1、1、1、2、1 天。你只有五天假期。列车向右加入新景点，一旦超时，就从左边舍去景点；可不能跳过中间的一站。', rule:'连续区间 + 正数：用滑动窗口找最长合法段。', diagram:['3  |  1  |  1  |  1  |  2  |  1','去掉左侧 3 → [1,1,1,2]，和=5，长=4'], keys:[['滑动窗口','右端加入，超限时左端持续收缩。'],['二分计数','upper_bound(R)−lower_bound(L)。'],['栈模拟','按输入进站，按目标顺序出站。'],['适用条件','窗口元素均为正；二分前先排序。']], checks:['天数全是 6，假期 5 天，答案？','[2,2,3] 中落在 [2,2] 的元素个数？','窗口超限，只删一个就够吗？'], answers:['0','2，重复值对应不同选择。','不一定，while 收缩到合法。'], pitfall:'组合数量可达 10¹⁰，答案用 long long；空栈不能取 top。', practice:'18803 旅行团 · 18804 干饭人 · 18809 古老车站' },
  { n:73, title:'综合练习（二）', story:'三座塔与大盘子', scene:'三个架子上堆着大小不同的盘子。要把整摞从 A 搬到 C，大盘子永远不能压在小盘子上。小伙伴先把上面的小盘搬走，移动最大盘，再把小盘搬回来——小任务的规则和大任务完全一样。', rule:'汉诺塔分三步；快速幂把指数不断减半。', diagram:['① n−1 个小盘：A → B（借 C）','② 最大盘：A → C','③ n−1 个小盘：B → C（借 A）'], keys:[['汉诺塔','T(n)=2T(n−1)+1=2ⁿ−1。'],['偶数指数','a²ᵏ=(aᵏ)²。'],['奇数指数','a²ᵏ⁺¹=(aᵏ)²×a。'],['整数取模','每轮乘法后取模，乘法类型要足够大。']], checks:['三个盘子最少移动几次？','13=8+4+1，快速幂选择哪些权值？','2⁹ 的本课堂输出补零吗？'], answers:['7','8、4、1','不补零，输出 512。'], pitfall:'输出汉诺塔全过程有 2ⁿ−1 行，时间为 O(2ⁿ)。', practice:'19734 汉诺塔 · 19736 幂的最后四位' },
  { n:74, title:'真题演练（一）', story:'数字工坊的排队秘诀', scene:'工坊捡到了混在字母里的数字：2、9、0、1、0。小伙伴想拼出最大的数，把大的数字安排在最前面：9、2、1、0、0。零虽然站在最后，也一个都不能丢。', rule:'先看题意和数据范围，再说明贪心为何正确。', diagram:['290es1q0 → 2,9,0,1,0 → 92100','拦截高度 389,207,158,300,155,159 → 2 套'], keys:[['拼数','计数 0–9，按大到小输出字符。'],['导弹拦截','每套系统能接相等或更低的高度。'],['贪心选择','选末高度 ≥h 且最小的系统。'],['二分位置','有序末高度中使用 lower_bound。']], checks:['a100b9 能拼出的最大数？','5、5、5 需要几套拦截系统？','1、2、3 需要几套系统？'], answers:['9100','1','3'], pitfall:'本卡求最少系统数，别与最长可拦截序列混淆。', practice:'19960 拼数 · 19961 导弹拦截 · 19962 公路' },
  { n:75, title:'真题演练（二）', story:'公交站的优惠票', scene:'小伙伴坐地铁拿到一张优惠票，45 分钟内能用来坐公交。上车时，它要从最早的票开始找：没用过、没过期、面额还足够。票只能用一次；时间差恰好 45 分钟，仍然有效。', rule:'把文字规则变成状态，并逐条检查边界。', diagram:['一张票 = 面额 + 获得时间 + 是否使用','未用过 AND 时间差≤45 AND 面额≥票价'], keys:[['票据状态','记录 price、time、used。'],['选票顺序','选最早的合格票，不是最大面额。'],['二进制分解','137=2⁷+2³+2⁰。'],['幂次表示','2⁰ 写 2(0)，2¹ 写 2。']], checks:['时刻 1 的票在时刻 46 能用吗？','票价与票面额相等时能用吗？','10 的幂次方表示是什么？'], answers:['能，差 45 分钟。','能，面额 ≥ 票价。','2(2+2(0))+2'], pitfall:'不要把「已使用」与「已过期」混成同一个状态。', practice:'18895 公交换乘 · 19098 幂次方' },
  { n:76, title:'树（一）', story:'星树家族的名册', scene:'星树家族从一个根节点向下分出枝条。小伙伴沿着父亲、孩子的关系画家谱：没有孩子的是叶子，同一个父亲的孩子是兄弟。找根时，它不看谁先登记，只看谁没有父亲。', rule:'树的关系看结构；遍历顺序看根、左、右的位置。', diagram:['            1（根）','         2         3','      4     5（叶子）'], keys:[['找根','没有父亲的节点就是根。'],['深度','本课根深度为 1，示例树深度为 3。'],['前 / 中 / 后序','根左右 / 左根右 / 左右根。'],['空孩子','编号 0 表示空，递归先判断。']], checks:['节点 2 的子树共有几人？','仅有一个根，按本课约定深度？','示例树的中序遍历结果？'], answers:['3：2、4、5','1','4 2 5 1 3'], pitfall:'普通二叉树的中序遍历不保证有序。', practice:'21256 找树根和深度 · 21258 中序遍历' },
  { n:77, title:'特殊二叉树与优先队列', story:'果园的合并挑战', scene:'果园有三堆果子，重量为 1、2、9。每次合并都要付出两堆重量之和。小伙伴先合最轻的两堆：付 3；再把 3 和 9 合并：付 12。一共 15，比先合 2 和 9 的 23 更省力。', rule:'每次取最小两堆，放回新堆，继续合并。', diagram:['1 + 2 → 3（费用 3）','3 + 9 → 12（费用 12）','总费用 = 3 + 12 = 15'], keys:[['完全二叉树','最后一层从左到右连续排列。'],['堆的关系','大根：父≥子；小根：父≤子。'],['优先队列','默认取最大；greater 取最小。'],['操作顺序','先 top 再 pop，新堆必须 push 回去。']], checks:['只有一堆重 7，需要多少合并费用？','四堆都重 1，最少费用？','默认 priority_queue 的 top 是最小值吗？'], answers:['0，不需要合并。','2+2+4=8','不是，是最大值。'], pitfall:'堆顶是最值，不代表整个堆有序；累计费用用 long long。', practice:'急诊分诊 · 合并果子 · 哈夫曼树的构造' },
];
function wrap(s, limit=27) { const out=[]; let line=''; let width=0; for (const c of s) { const w=/[\x00-\xff]/.test(c)?0.54:1; if(width+w>limit){out.push(line);line='';width=0;}line+=c;width+=w;} if(line)out.push(line);return out; }
function text(s,x,y,size=27,color='#26394b',limit=27) { return wrap(s,limit).map((line,i)=>`<text x="${x}" y="${y+i*size*1.6}" font-size="${size}" fill="${color}">${escape(line)}</text>`).join(''); }
function panel(x,y,w,h){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="white" stroke="#d4e3e8"/>`;}
function svg(l, kind){
 const accent=l.n<72?'#256a85':'#785233';
 let inner='';
 if(kind===0){
   inner+=text(l.story,64,265,39,accent,19);
   inner+=text(l.scene,64,330,29,'#26394b',26);
   inner+=panel(48,630,804,225);
   inner+=text('把故事变成算法',76,675,24,accent);
   if(l.n===76){
     inner+='<g stroke="#785233" stroke-width="3"><path d="M450 710 L280 760 M450 710 L620 760 M280 760 L200 815 M280 760 L360 815"/></g>';
     for(const [label,x,y] of [['1',450,710],['2',280,760],['3',620,760],['4',200,815],['5',360,815]]) inner+=`<circle cx="${x}" cy="${y}" r="21" fill="#f5f4ed" stroke="#785233"/><text x="${x}" y="${y+9}" font-size="25" text-anchor="middle" fill="#26394b">${label}</text>`;
   }else l.diagram.forEach((s,i)=>inner+=text(s,76,724+i*45,27,'#26394b',47));
   inner+=text(l.rule,64,926,29,accent,25);
 } else if(kind===1){
   l.keys.forEach(([a,b],i)=>{const y=232+i*178;inner+=panel(48,y,804,158);inner+=text(`${String(i+1).padStart(2,'0')}  ${a}`,76,y+47,28,accent);inner+=text(l.n===77&&i===0?'前面各层填满，最后一层从左到右连续。':b,76,y+96,28,'#26394b',27);});
   inner+=text(l.pitfall,64,1014,25,'#9b422e',29);
 } else {
   l.checks.forEach((s,i)=>{const y=246+i*177;inner+=panel(48,y,804,154);inner+=text(`挑战 ${i+1}`,76,y+40,23,accent);inner+=text(s,76,y+85,29,'#26394b',26);});
   inner+=text('核对答案',64,830,29,accent);
   let y=875;l.answers.forEach((s,i)=>{inner+=text(`${i+1}. ${s}`,64,y,26,'#26394b',35);y+=wrap(`${i+1}. ${s}`,35).length*42;});
   inner+=text(l.practice,64,1040,22,'#627887',35);
 }
 const label=['课前故事卡','知识总览卡','复习结合卡'][kind];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125" viewBox="0 0 900 1125"><rect width="900" height="1125" fill="#f5f4ed"/><circle cx="865" cy="50" r="185" fill="#e6efe9"/><circle cx="780" cy="82" r="52" fill="none" stroke="${accent}" stroke-width="2" opacity=".18"/><g font-family="PingFang SC, sans-serif"><text x="48" y="62" font-size="22" fill="${accent}" letter-spacing="3">CSP 学习助手 · 课堂资料</text><rect x="48" y="90" width="96" height="70" rx="18" fill="${accent}"/><text x="96" y="138" font-size="34" text-anchor="middle" fill="white">P${l.n}</text><text x="166" y="133" font-size="38" fill="#203344" font-weight="600">${escape(l.title)}</text><text x="48" y="203" font-size="25" fill="#627887">${label} · ${l.n<72?'C3 进阶':'C4 提高'}</text>${inner}<path d="M48 1080 H852" stroke="#cbd9dc"/><text x="48" y="1110" font-size="17" fill="#7b8f98">先建立直觉，再回到完整讲义与代码 · P${l.n}</text><text x="852" y="1110" text-anchor="end" font-size="17" fill="#7b8f98">${kind+1} / 3</text></g></svg>`;
}
fs.mkdirSync(path.join(dir,'images'),{recursive:true});
for(const l of lessons)for(let k=0;k<3;k++){
 const filename=`P${l.n}-${['story','overview','review'][k]}`;
 fs.writeFileSync(path.join(dir,'images',`${filename}.svg`),svg(l,k));
 await sharp(Buffer.from(svg(l,k))).png().toFile(path.join(dir,'images',`${filename}.png`));
}
fs.writeFileSync(path.join(dir,'card-content.json'),JSON.stringify(lessons,null,2)+'\n');
console.log('已生成 24 张 900×1125 学习卡，文字与示意采用确定性排版。');
