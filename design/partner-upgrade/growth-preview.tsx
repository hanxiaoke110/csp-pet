import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerAscensionPanel from '../../src/components/pet/PartnerAscensionPanel';
import { usePetStore } from '../../src/stores/petStore';
import { usePartnerGrowthStore, PARTNER_GROWTH_KEY } from '../../src/stores/partnerGrowthStore';
import type { OwnedPet } from '../../src/types/pet';

function Preview(){
  const [ready,setReady]=useState(false);
  const pets=usePetStore(s=>s.ownedPets);
  const coins=usePetStore(s=>s.coins);
  const [selected,setSelected]=useState('preview-one');
  const pet=pets.find(p=>p.petId===selected);
  function seed(){
    const at=new Date().toISOString();
    const makePet=(petId:string,petName:string):OwnedPet=>({petId,petName,speciesId:'capi',element:'earth',tier:'common',renderType:'2d',modelPath:'/pet-sprites/2d/capi.json',level:10,exp:0,expToNext:100,hunger:100,mood:80,affection:80,lastFedAt:null,obtainedAt:at,updatedAt:at,acquisitionSource:'starter',acquisitionCost:0});
    const ownedPets=[makePet('preview-one','卡皮·一号'),makePet('preview-two','卡皮·二号')];
    const saved={ownedPets,activePetId:'preview-one',coins:1000,savedAt:at};
    localStorage.setItem('csp_pet_data',JSON.stringify(saved));
    const snapshot={schemaVersion:1 as const,migrated:true as const,starSand:7,firstCorrectIds:[],claimedMapIds:[],savedAt:at};
    localStorage.setItem(PARTNER_GROWTH_KEY,JSON.stringify(snapshot));
    usePetStore.setState({...saved,loaded:true});
    usePartnerGrowthStore.setState({loaded:true,snapshot,error:''});
    setReady(true);
  }
  return <main><h1>伙伴培养 · 独立验收</h1><p id="preview-notice">仅操作当前浏览器预览端口的演示存档，不连接桌面原存档。两只同种伙伴用于检查升品独立性。重置按钮会覆盖本预览页的演示金币与伙伴。</p><button onClick={seed}>{ready?'重置演示存档':'创建演示存档'}</button><a style={{color:'#8ee4ff',marginLeft:20}} href="./preview.html">查看战斗特效 →</a>{ready&&pet&&<><p>演示金币：{coins}</p><div>{pets.map(p=><button key={p.petId} onClick={()=>setSelected(p.petId)}>{p.petName}</button>)}</div><section className="preview-card"><aside><img src="/cloud-assets-source/battle-portraits/capi.webp" alt={pet.petName}/><h2>{pet.petName}</h2><p>等级 {pet.level} · 亲密度 {pet.affection}</p></aside><PartnerAscensionPanel pet={pet}/></section></>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
