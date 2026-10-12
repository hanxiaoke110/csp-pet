import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const dir='reports/learning-materials/course-cards-p70-p77';
const recordFile=path.join(dir,'published.json');
const records=fs.existsSync(recordFile)?JSON.parse(fs.readFileSync(recordFile,'utf8')):{state:'publishing',lessons:[]};
const nav='https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const save=()=>fs.writeFileSync(recordFile,JSON.stringify(records,null,2)+'\n');
function cli(args){const raw=execFileSync('lark-cli',[...args,'--as','user'],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1',LARKSUITE_CLI_NO_SKILLS_NOTIFIER:'1'}});const out=JSON.parse(raw);if(!out.ok)throw Error(JSON.stringify(out.error));return out.data;}
const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>');
function toXml(md){
 const lines=md.split('\n');const out=[];
 for(let i=1;i<lines.length;i++){
  const line=lines[i];if(!line.trim())continue;
  if(line.startsWith('```')){const lang=line.slice(3)||'text';const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);out.push(`<pre lang="${esc(lang)}"><code>${esc(code.join('\n')).replaceAll('\n','<br/>')}</code></pre>`);}
  else if(/^#{2,3} /.test(line)){const level=line.indexOf(' ');out.push(`<h${level}>${inline(line.slice(level+1))}</h${level}>`);}
  else if(line.startsWith('|')){const rows=[];do{rows.push(lines[i]);i++;}while(i<lines.length&&lines[i].startsWith('|'));i--;out.push('<table>');rows.forEach((row,index)=>{if(/^\|[ :|\-]+\|$/.test(row))return;const tag=index===0?'th':'td';const cells=row.split('|').slice(1,-1).map(s=>s.trim());out.push(`${index===0?'<thead>':'<tbody>'}<tr>${cells.map(s=>`<${tag}>${inline(s)}</${tag}>`).join('')}</tr>${index===0?'</thead>':'</tbody>'}`);});out.push('</table>');}
  else if(line.startsWith('- ')){const items=[];do{items.push(lines[i].slice(2));i++;}while(i<lines.length&&lines[i].startsWith('- '));i--;out.push(`<ul>${items.map(s=>`<li>${inline(s)}</li>`).join('')}</ul>`);}
  else out.push(`<p>${inline(line)}</p>`);
 }return out.join('\n');
}
function header(title){return `<p><a href="${nav}">返回智子学习资料库</a></p><p>先看课前故事卡建立直觉，再用知识总览卡整理规则，最后完成复习结合卡。完整例题与可复制代码在图片下方。</p><h2>本课卡片</h2>`;}
const oldDocs={70:'R65Ldns0FoEOyFxmyfmc4Jd1nGe',71:'Z2uNdfqCxoSfsHxOouqcHlfmnqb'};
for(const file of fs.readdirSync(dir).filter(s=>/^P7[0-7]-.*\.md$/.test(s)).sort()){
 const no=Number(file.match(/^P(\d+)/)[1]);const md=fs.readFileSync(path.join(dir,file),'utf8');const title=md.split('\n')[0].slice(2);
 let rec=records.lessons.find(s=>s.lessonNo===no);
 if(!rec){
  let docId=oldDocs[no];
  if(docId){const old=cli(['docs','+fetch','--doc',docId,'--detail','full']);const xml=old.document.content;if(!xml.includes('预置入口')||/<img |<source /.test(xml))throw Error(`P${no} 原文档已不是纯占位，停止覆盖`);cli(['docs','+update','--doc',docId,'--command','overwrite','--content',header(title)]);}
  else {const created=cli(['docs','+create','--parent-token','UIqef45D2lc458dpuOqcu8CCnHe','--content',`<title>${esc(title)}</title>${header(title)}`]);docId=created.document.document_id;}
  rec={lessonNo:no,title,file,documentId:docId,url:`https://scncdgmg7m6w.feishu.cn/docx/${docId}`,images:[],bodyWritten:false};records.lessons.push(rec);save();
 }
 for(const [kind,caption] of [['story','课前故事卡'],['overview','知识总览卡'],['review','复习结合卡']]){
  if(rec.images.some(s=>s.kind===kind))continue;
  const image=cli(['docs','+media-insert','--doc',rec.documentId,'--file',`${dir}/images/P${no}-${kind}.png`,'--type','image','--width','900','--caption',`P${no} ${caption}`]);
  rec.images.push({kind,...image});save();
 }
 if(!rec.bodyWritten){cli(['docs','+update','--doc',rec.documentId,'--command','append','--content',`<hr/><h2>完整讲义与代码</h2>${toXml(md)}`]);rec.bodyWritten=true;save();}
 const permission=cli(['drive','permission.public','get','--token',rec.documentId,'--type','docx']).permission_public;
 rec.permissionBefore=permission;save();
 if(permission.link_share_entity!=='anyone_readable'||permission.external_access!==true){
  const auth=cli(['drive','permission.members','auth','--token',rec.documentId,'--type','docx','--action','manage_public']);if(auth.auth_result!==true)throw Error(`P${no} 无权管理分享设置`);
  cli(['drive','permission.public','patch','--token',rec.documentId,'--type','docx','--data',JSON.stringify({external_access:true,invite_external:false,link_share_entity:'anyone_readable',security_entity:'only_full_access',share_entity:'only_full_access',comment_entity:'anyone_can_edit'}),'--yes']);
 }
 rec.permission=cli(['drive','permission.public','get','--token',rec.documentId,'--type','docx']).permission_public;
 if(rec.permission.link_share_entity!=='anyone_readable'||!rec.permission.external_access)throw Error(`P${no} 阅读权限验证失败`);
 const xml=cli(['docs','+fetch','--doc',rec.documentId,'--detail','full']).document.content;
 const codes=[...xml.matchAll(/<pre\b[^>]*lang="cpp"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(x=>x[1].replace(/<br\s*\/?\s*>/g,'\n').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&').trim());
 const expected=[...md.matchAll(/```cpp\n([\s\S]*?)\n```/g)].map(x=>x[1].trim());
 if(codes.length!==2||codes.some((s,i)=>s!==expected[i]))throw Error(`P${no} 线上代码与已编译正文不一致`);
 if((xml.match(/<img\b/g)||[]).length!==3)throw Error(`P${no} 图片不完整`);
 if(xml.includes('当前状态：制作中'))throw Error(`P${no} 存在占位残留`);
 rec.verified=true;rec.sha256=createHash('sha256').update(md).digest('hex');rec.verifiedAt=new Date().toISOString();save();console.log(`P${no} 已上传并回读：3 张图片、2 段完整代码、公开只读链接 ${rec.url}`);
}
records.state='documents_verified_catalog_pending';save();
