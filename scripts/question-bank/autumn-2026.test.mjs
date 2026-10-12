import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateQuestion } from './lib/validate.mjs';
import { buildChannels } from './lib/channels.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./data/autumn-2026.json',import.meta.url),'utf8'));
describe('2026 autumn question import',()=>{
  it('imports only the 120 September GESP choices with all eight levels',()=>{
    const items=data.questions.filter(q=>q.source==='gesp');
    expect(items).toHaveLength(120);
    for(let l=1;l<=8;l++)expect(items.filter(q=>q.exam.level===l&&q.exam.date==='2026-09'&&q.type==='choice')).toHaveLength(15);
  });
  it('preserves all CSP choice options and publishes 80 vetted subitems',()=>{
    const items=data.questions.filter(q=>q.source==='csp_exam');
    expect(items).toHaveLength(39);
    expect(items.reduce((sum,q)=>sum+(q.children.length||1),0)).toBe(80);
    for(const q of items){expect(q.provenance.level).toBe('secondary');expect(q.provenance.url).toBe('https://www.luogu.com.cn/discuss/1380094');}
  });
  it('quarantines the obscured OCR instead of guessing its six answers',()=>{
    expect(data.quarantined[0].numbers).toEqual([16,17,18,19,20,21]);
    expect(data.questions.some(q=>q.id==='csp-j-2026-r01')).toBe(false);
  });
  it('has no missing context, duplicate IDs, empty explanation or invalid answer',()=>{
    expect(new Set(data.questions.map(q=>q.id)).size).toBe(data.questions.length);
    for(const q of data.questions){expect(validateQuestion(q).blockers,q.id).toEqual([]);expect(q.explanation,q.id).toBeTruthy();for(const c of q.children)expect(c.explanation,q.id).toBeTruthy();}
  });
  it('keeps grade 5–8 out of the basic dungeon pool',()=>{
    const channels=buildChannels(data.questions.map(q=>({...q,verificationStatus:'auto_verified'})));
    expect(channels.daily.filter(q=>q.source==='gesp')).toHaveLength(120);
    expect(channels.dungeon.filter(q=>q.source==='gesp')).toHaveLength(60);
    expect(channels.exam).toHaveLength(39);
  });
});
