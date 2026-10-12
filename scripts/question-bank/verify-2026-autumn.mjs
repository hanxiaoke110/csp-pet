import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const data=JSON.parse(fs.readFileSync('scripts/question-bank/data/autumn-2026.json','utf8'));
const byId=new Map(data.questions.map(q=>[q.id,q]));
const checks=[];
function check(name,actual,expected) {assert.deepEqual(actual,expected,name);checks.push({name,passed:true});}
const gcd=(a,b)=>b?gcd(b,a%b):a;
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
const power=(a,b,m)=>{let r=1n;for(a=BigInt(a),b=BigInt(b),m=BigInt(m);b;b>>=1n,a=a*a%m)if(b&1n)r=r*a%m;return Number(r);};
function bfsGrid(){const grid=['S..#.','...#.','...#.','##..E','...#.'],q=[[0,0]],seen=new Set(['0,0']);for(let i=0;i<q.length;i++){const [r,c]=q[i];for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){const x=r+dr,y=c+dc,k=`${x},${y}`;if(x<0||x>=5||y<0||y>=5||grid[x][y]==='#'||seen.has(k))continue;seen.add(k);q.push([x,y]);if(grid[x][y]==='E')return seen.size;}}}
check('J2 base conversion',(0x2f5).toString(8),'1365');
check('J3 integer division',Math.trunc(7/3)*3+7%3,7);
check('J4 forbidden stack order',permutations([1,2,3,4]).filter(p=>{const st=[];let x=1;for(const v of p){while(x<=4&&st.at(-1)!==v)st.push(x++);if(st.pop()!==v)return false;}return true;}).some(p=>p.join()==='3,1,2,4'),false);
check('J5 leaf count',Array.from({length:100},(_,i)=>i+1).filter(i=>2*i>100).length,50);
check('J6 multiples sum',Array.from({length:100},(_,i)=>i+1).filter(i=>i%3===0||i%5===0).reduce((a,b)=>a+b,0),2418);
const stairs=[1];for(let i=1;i<=8;i++)stairs[i]=[1,2,3].reduce((s,d)=>s+(stairs[i-d]||0),0);check('J7 stairs DP',stairs[8],81);
check('J8 ordered BFS grid',bfsGrid(),14);
check('J9 gcd count',Array.from({length:100},(_,i)=>i+1).filter(i=>gcd(i,60)===6).length,6);
const coins=[0];for(let i=1;i<=9;i++)coins[i]=1+Math.min(...[1,4,6].filter(c=>c<=i).map(c=>coins[i-c]));check('J10 coin DP',coins[9],3);
check('J12 comparison depth',Math.floor(Math.log2(1000))+1,10);
check('J13 prefix difference',3*100+10-(3*81+9),58);
check('J14 median distance',[1,3,4,7,10,15,20].reduce((s,x)=>s+Math.abs(x-7),0),37);
check('J15 handshake',(4*3+6*4)/2,18);
check('S1 popcount',2026..toString(2).replaceAll('0','').length,8);
const weights=[1,2,3,4,5,6,7,8];let wpl=0;while(weights.length>1){weights.sort((a,b)=>a-b);const v=weights.shift()+weights.shift();wpl+=v;weights.push(v);}check('S2 Huffman',wpl,102);
check('S3 digit enumeration',Array.from({length:1000},(_,i)=>String(i+1)).join('').replace(/[^1]/g,'').length,301);
check('S4 exactly two fixed letters',permutations([0,1,2,3,4]).filter(p=>p.filter((x,i)=>x===i).length===2).length,20);
check('S5 modular exponent',power(3,2026,100),29);
const stone=[4,1,3,2,5],dp=Array.from({length:5},()=>Array(5).fill(0));for(let len=2;len<=5;len++)for(let l=0;l+len<=5;l++){const r=l+len-1;dp[l][r]=Math.min(...Array.from({length:len-1},(_,j)=>dp[l][l+j]+dp[l+j+1][r]))+stone.slice(l,r+1).reduce((a,b)=>a+b,0);}check('S6 interval DP',dp[0][4],34);
let query=0,update=0;for(let x=11;x;x-=x&-x)query++;for(let x=3;x<=16;x+=x&-x)update++;check('S7 Fenwick visits',[query,update],[3,4]);
check('S8 topo enumeration',permutations([1,2,3,4]).filter(p=>p.indexOf(1)<p.indexOf(2)&&p.indexOf(1)<p.indexOf(3)).length,8);
const cat=[1];for(let n=1;n<=6;n++)cat[n]=Array.from({length:n},(_,i)=>cat[i]*cat[n-1-i]).reduce((a,b)=>a+b);check('S12 Catalan',cat[6],132);
check('S13 borders',Array.from({length:8},(_,i)=>i+1).filter(i=>'ababaabab'.slice(0,i)==='ababaabab'.slice(-i)).reduce((a,b)=>a+b,0),6);
check('S15 fast exponent',power(2,100,1000),376);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'csp-autumn-verify-'));
let compiled=0,executions=0;
function compile(id){const q=byId.get(id);assert(q);let code=q.code;if(q.type==='fillBlank')q.children.forEach((c,i)=>{code=code.replace(`/* ${'①②③④⑤'[i]} */`,c.options[c.correctIndex]);});const src=path.join(temp,id+'.cpp'),bin=path.join(temp,id);fs.writeFileSync(src,code);const p=spawnSync('clang++',['-std=c++17','-O2','-Wall','-Wextra',src,'-o',bin],{encoding:'utf8'});assert.equal(p.status,0,`${id}: ${p.stderr}`);compiled++;return input=>{const r=spawnSync(bin,[],{input,encoding:'utf8',timeout:5000});assert.equal(r.status,0,`${id}: ${r.stderr}`);executions++;return r.stdout.trim();};}
let seed=20261012;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
try {
  const jr2=compile('csp-j-2026-r02');
  check('J22 carry and leading zero',jr2('123 456'),'0579');check('J25 addition sample',jr2('12345 678'),'013023');
  for(let i=0;i<50;i++){const a=random(10000),b=random(10000),len=Math.max(String(a).length,String(b).length)+1;check(`J addition random ${i}`,jr2(`${a} ${b}`),String(a+b).padStart(len,'0'));}
  const jr3=compile('csp-j-2026-r03');check('J28 DFS count',jr3('10').split('\n').length,9);check('J31 DFS third',jr3('24').split('\n')[2],'29');check('J33 DFS count',jr3('200').split('\n').length,14);
  const jf1=compile('csp-j-2026-f01');for(let i=0;i<50;i++){const n=2+random(9),m=2+random(9),digits=Array.from({length:1+random(6)},()=>random(n*m));let v=0n;for(const d of digits)v=v*BigInt(n*m)+BigInt(d);const expected=[];do{expected.unshift(Number(v%BigInt(n)));v/=BigInt(n);}while(v);check(`J base conversion random ${i}`,jf1(`${n} ${m} ${digits.length}\n${digits.join(' ')}`).split(/\s+/).map(Number),expected);}
  const jf2=compile('csp-j-2026-f02');for(let i=0;i<30;i++){const n=2+random(6),a=Array.from({length:n},()=>random(16)),s=a.map(x=>x.toString(16).toUpperCase()).join('');let best=Infinity;for(let mask=1;mask<(1<<(n-1));mask++){const means=[];let sum=0,len=0;for(let j=0;j<n;j++){sum+=a[j];len++;if(j===n-1||(mask>>j&1)){means.push(sum/len);sum=len=0;}}best=Math.min(best,Math.max(...means)-Math.min(...means));}check(`J partition random ${i}`,Math.abs(Number(jf2(`${n}\n${s}`))-best)<1e-6,true);}
  const sr1=compile('csp-s-2026-r01');const poly=BigInt('0b1100000001111');for(let i=0;i<50;i++){const value=BigInt(random(2**30)),s=value.toString(2).padStart(32,'0');let rem=value<<12n;for(let bit=43;bit>=12;bit--)if(rem>>BigInt(bit)&1n)rem^=poly<<BigInt(bit-12);check(`S CRC random ${i}`,sr1(s),rem.toString(2).padStart(12,'0'));}
  const sr2=compile('csp-s-2026-r02');for(let i=0;i<25;i++){const a=Array.from({length:1+random(20)},()=>1+random(100)),queries=Array.from({length:20},()=>{const l=random(a.length),r=l+random(a.length-l);return[l,r];});const expected=queries.map(([l,r])=>a.slice(l,r+1).reduce(gcd));check(`S range gcd random ${i}`,sr2(`${a.length} 20\n${a.join(' ')}\n${queries.map(([l,r])=>`${l+1} ${r+1}`).join('\n')}`).split(/\s+/).map(Number),expected);}
  const sr3=compile('csp-s-2026-r03');let chains=0;const parents=[];function enumerate(i){if(i===10){const adj=Array.from({length:10},()=>[]);parents.forEach((p,k)=>{adj[p].push(k+2);adj[k+2].push(p);});let diameter=0;for(let start=1;start<=9;start++){const d=Array(10).fill(-1),q=[start];d[start]=0;for(const x of q)for(const y of adj[x])if(d[y]<0){d[y]=d[x]+1;q.push(y);}diameter=Math.max(diameter,...d);}if(diameter===8)chains++;return;}for(let p=1;p<i;p++){parents.push(p);enumerate(i+1);parents.pop();}}enumerate(2);check('S33 chain combinatorics n9',chains,128);
  for(let i=0;i<40;i++){const n=2+random(18),p=Array.from({length:n-1},(_,k)=>1+random(k+1)),adj=Array.from({length:n+1},()=>[]);p.forEach((x,k)=>{adj[x].push(k+2);adj[k+2].push(x);});let expected=0;for(let start=1;start<=n;start++){const d=Array(n+1).fill(-1),queue=[start];d[start]=0;for(const x of queue)for(const y of adj[x])if(d[y]<0){d[y]=d[x]+1;queue.push(y);}expected=Math.max(expected,...d);}check(`S diameter random ${i}`,Number(sr3(`${n}\n${p.join(' ')}`)),expected);}
  const sf1=compile('csp-s-2026-f01');for(let i=0;i<80;i++){const n=2+random(5),edges=[];for(let u=1;u<=n;u++)for(let v=u+1;v<=n;v++)if(random(3)!==0)edges.push([u,v,random(2)?1:-1]);if(!edges.length)edges.push([1,2,1]);const adj=Array.from({length:n+1},()=>[]);for(const[u,v,w]of edges){adj[u].push([v,w]);adj[v].push([u,w]);}const seen=new Set(['1,0']),queue=[[1,0]];let best=Infinity;for(const[u,d]of queue){if(u===n)best=Math.min(best,Math.abs(d));for(const[v,w]of adj[u]){const z=d+w,key=`${v},${z}`;if(Math.abs(z)>20||seen.has(key))continue;seen.add(key);queue.push([v,z]);}}check(`S signed walk random ${i}`,Number(sf1(`${n} ${edges.length} 1 ${n}\n${edges.map(([u,v,w])=>`${u} ${v} ${w===1?'+':'-'}`).join('\n')}`)),best===Infinity?-1:best);}
  const sf2=compile('csp-s-2026-f02');for(let i=0;i<80;i++){const n=1+random(6),m=1+random(6),a=Array.from({length:n},()=>Array.from({length:m},()=>random(2)?'A':'B').join('')),x=Array.from({length:n},()=>random(m+1));const score=s=>a.reduce((sum,row,j)=>sum+Math.abs([...row].filter((c,k)=>c===s[k]).length-x[j]),0);const expected=Math.max(...Array.from({length:1<<m},(_,mask)=>score(Array.from({length:m},(_,j)=>mask>>j&1?'A':'B').join(''))));const res=sf2(`${n} ${m}\n${x.join(' ')}\n${a.join('\n')}`);check(`S standard answer brute ${i}`,score(res),expected);}
} finally {fs.rmSync(temp,{recursive:true,force:true});}
const report={sourceHash:createHash('sha256').update(fs.readFileSync('scripts/question-bank/data/autumn-2026.json')).digest('hex'),verifiedAt:new Date().toISOString(),compiled,executions,checks,quarantined:data.quarantined,notes:['CSP answers independently derived in import metadata; executable checks validate selected program completions against separate oracles.','J16–21 remain unpublished because the original OCR is explicitly tentative.','GESP reused project-owner provided source with its official PDF audit; online/local equality checked for every exam and image.']};
fs.writeFileSync('reports/csp-2026/verification.json',JSON.stringify(report,null,2)+'\n');
console.log(`Verified ${checks.length} checks, ${compiled} C++ programs, ${executions} executions.`);
