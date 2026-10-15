import { createBattleGame, type BattlePhaserGame } from '../../src-dungeon/phaser/BattlePhaserGame';
import { loadBattlePortrait } from '../../src-dungeon/utils/battlePortraits';
import { readBattleVisualMode, writeBattleVisualMode } from '../../src-dungeon/utils/battleVisuals';
import type { PetElement } from '../../src/types/pet';

let battle: BattlePhaserGame | null=null;
let paused=false;
let revision=0;
let answerTimer:ReturnType<typeof setTimeout>|undefined;
const status=document.querySelector('#status')!;
const container=document.querySelector<HTMLDivElement>('#battle')!;
async function restart(){
  const current=++revision;
  clearTimeout(answerTimer);
  battle?.destroy();battle=null;paused=false;
  const speciesId=(document.querySelector('#pet') as HTMLSelectElement).value;
  const element=(document.querySelector('#element') as HTMLSelectElement).value as PetElement;
  const portrait=await loadBattlePortrait(speciesId);
  if(current!==revision){portrait?.release();return;}
  const actor={petId:'preview',displayName:speciesId,speciesId,element,level:10,maxHp:2000,currentHp:2000,attack:20,defense:5,speed:10,isPlayer:true,previewUrl:portrait?.url||`/pet-sprites/previews/${speciesId}.png`,textureKey:'previewPlayer',textureStyle:portrait?.style||'pixel'};
  battle=createBattleGame(container,{dungeonId:'preview',stageId:'preview',isBoss:false,playerPet:actor,enemyPet:{...actor,petId:'previewEnemy',displayName:'练习伙伴',isPlayer:false,element:'water',textureKey:'previewEnemy'},initialEnergy:5,maxEnergy:5,dungeonColor:'#59c8ef',dungeonName:'本地验收'},(event,data)=>{
    if(event==='skillSelected'){
      status.textContent=`模拟答对：${(data as {skillId:string}).skillId}`;
      answerTimer=setTimeout(()=>{if(current===revision)battle?.setAnswerResult({skillId:(data as {skillId:string}).skillId,isCorrect:true});},300);
    }
    if(event==='battleEnd')status.textContent='演示战斗结束，可重新开始。';
  });
  battle.game.events.once('destroy',()=>portrait?.release());
  status.textContent=portrait?'已加载本地高清透明立绘':'使用原图回退';
  (window as unknown as {__partnerBattlePreview:BattlePhaserGame|null}).__partnerBattlePreview=battle;
}
document.querySelector('#restart')!.addEventListener('click',()=>void restart());
document.querySelector('#pet')!.addEventListener('change',()=>void restart());
document.querySelector('#element')!.addEventListener('change',()=>void restart());
document.querySelector('#pause')!.addEventListener('click',()=>{paused=!paused;if(paused)battle?.pause();else battle?.resume();});
document.querySelector('#mode')!.addEventListener('click',()=>{const mode=readBattleVisualMode()==='full'?'simple':'full';writeBattleVisualMode(mode);status.textContent=`特效：${mode==='full'?'完整':'简洁'}`;});
void restart();
window.addEventListener('pagehide',()=>{++revision;clearTimeout(answerTimer);battle?.destroy();});
