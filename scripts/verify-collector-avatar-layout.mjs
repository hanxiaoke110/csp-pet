import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const output='output/playwright/collector-avatar-2026-10-25';
mkdirSync(output,{recursive:true});
const cli=(...args)=>JSON.parse(execFileSync('browse',args,{encoding:'utf8'}));
const evaluate=expression=>cli('eval',expression).result;
cli('open','http://127.0.0.1:4188/collector-cards?preview=1');
cli('wait','selector','.collector-tabs');
evaluate(`(async()=>{
  for(const b of document.querySelectorAll('button')) if(['知道了','稍后再说'].includes(b.textContent?.trim()||'')) b.click();
  const {useCollectorCardStore}=await import('/src/stores/collectorCardStore.ts');
  const catalog=await (await fetch('/collector-cards/catalog.json')).json();
  useCollectorCardStore.setState({ownedCards:[{cardId:catalog.cards[0].id,acquiredAt:new Date().toISOString()}],loaded:true});
  return true;
})()`);
cli('wait','selector','.collector-tile');
cli('click','.collector-primary');
cli('wait','selector','.collector-card-scene');
evaluate(`document.querySelector('.collector-page').style.filter='blur(0px)';window.__layoutErrors=[];addEventListener('error',e=>window.__layoutErrors.push(e.message));true`);
const sizes=[[1280,720],[1000,600],[1024,500],[960,400],[800,500],[600,400],[390,844],[320,480],[1280,360],[480,320]];
const layouts=[];
for(const [width,height] of sizes){
  cli('viewport',String(width),String(height));
  evaluate(`document.querySelector('.collector-modal-layout').scrollTop=0;true`);
  const result=evaluate(`(()=>{
    const modal=document.querySelector('.collector-modal'),layout=document.querySelector('.collector-modal-layout');
    const buttons=[...document.querySelectorAll('.collector-viewer-actions button,.collector-modal-close')];
    return {portal:modal.parentElement===document.body,overflow:layout.scrollWidth>layout.clientWidth+1,
      buttons:buttons.map(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:b.textContent||b.getAttribute('aria-label'),visible:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1,clickable:!!hit&&b.contains(hit)}})};
  })()`);
  assert(result.portal);
  assert(!result.overflow,`${width}x${height}: horizontal overflow`);
  for(const button of result.buttons) assert(button.visible&&button.clickable,`${width}x${height}: ${JSON.stringify(button)}`);
  cli('click','.collector-viewer-actions button:nth-child(2)');
  assert.equal(evaluate(`document.querySelector('.collector-viewer-actions button:nth-child(2)').textContent`),'回到正面 ↻');
  cli('click','.collector-viewer-actions button:nth-child(2)');
  layouts.push({width,height,buttonsVisibleAndClickable:true,flip:true});
}
cli('viewport','1000','600');
evaluate(`document.querySelector('.collector-modal-layout').scrollTop=0;true`);
cli('screenshot',`${output}/card-window.png`);
cli('click','.collector-viewer-actions button:nth-child(2)');
cli('screenshot',`${output}/card-back.png`);
cli('click','.collector-modal-close');
assert.equal(evaluate(`!!document.querySelector('.collector-modal')`),false);
cli('open','http://127.0.0.1:4188/me');
cli('wait','selector','.my-hero');
evaluate(`for(const b of document.querySelectorAll('button')) if(['知道了','稍后再说'].includes(b.textContent?.trim()||'')) b.click();true`);
await evaluate(`(async()=>{const {useProfileStore}=await import('/src/stores/profileStore.ts');useProfileStore.setState({initialized:true,loaded:true});return true;})()`);
cli('viewport','1000','700');
const directions=[];
for(const slug of ['snake','horse']) {
  evaluate(`(async()=>{const {useProfileStore}=await import('/src/stores/profileStore.ts');const s=useProfileStore.getState();useProfileStore.setState({equipped:{...s.equipped,avatar:'avatar-zodiac-${slug}'}});return true;})()`);
  cli('wait','selector','.my-hero .avatar-interactive-art');
  for(const [x,y] of [[.1,.1],[.9,.1],[.1,.5],[.9,.5],[.1,.9],[.9,.9]]) {
    const box=evaluate(`(()=>{const r=document.querySelector('.my-hero .profile-stage').getBoundingClientRect();return{x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`);
    cli('hover',String(box.x),String(box.y));
    const position=evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector('.my-hero .avatar-interactive-art').style.backgroundPosition))))`);
    const row=Math.floor(y*5), logical=Math.floor(x*5);
    const col=slug==='snake'||row<2?4-logical:logical;
    assert.equal(position,`${col*25}% ${row*25}%`,`${slug} at ${x},${y}`);
    if(x===.1&&y===.1) cli('screenshot',`${output}/${slug}-look-left-up.png`);
    directions.push({slug,x,y,column:col,row});
  }
  cli('hover','980','680');
  assert.equal(evaluate(`new Promise(resolve=>requestAnimationFrame(()=>resolve(document.querySelector('.my-hero .avatar-interactive-art').style.backgroundPosition)))`),'50% 50%');
  cli('screenshot',`${output}/${slug}.png`);
}
const report={checkedAt:new Date().toISOString(),layouts,directions,neutralReset:true,realAppComponents:true};
writeFileSync(`${output}/verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({layouts:layouts.length,directions:directions.length,neutralReset:true,output},null,2));
