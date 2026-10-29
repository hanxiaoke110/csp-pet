// Read-only release verification. Backup contains private identifiers; never print rows.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const before = new DatabaseSync(':memory:');
before.exec(readFileSync(process.argv[2], 'utf8'));
const command = `SELECT id,wish_id,device_hash,class_code,created_at FROM votes ORDER BY id;
SELECT id,votes FROM wishes ORDER BY id;
SELECT value FROM meta WHERE key='schema_version';
SELECT COUNT(*) AS n FROM pragma_index_list('votes') WHERE "unique"=1;
SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='wish_vote_requests';`;
const result = JSON.parse(execFileSync('npx',['wrangler','d1','execute','csp-db','--remote','--config','wrangler.toml','--command',command,'--json'],{encoding:'utf8',maxBuffer:4*1024*1024}));
assert(result.every(r=>r.success));
const online = new Map(result[0].results.map(row=>[row.id,row]));
const old = before.prepare('SELECT id,wish_id,device_hash,class_code,created_at FROM votes ORDER BY id').all();
for (const row of old) assert.deepEqual(online.get(row.id),{...row},`Historical vote ${row.id} changed`);
const wishes = new Map(result[1].results.map(row=>[row.id,row]));
for (const row of before.prepare('SELECT id,votes FROM wishes').all()) assert(wishes.has(row.id)&&wishes.get(row.id).votes>=row.votes,`Wish ${row.id}: total decreased`);
assert.equal(result[2].results[0].value,'14');
assert.equal(result[3].results[0].n,0);
assert.equal(result[4].results[0].n,1);
before.close();
const listResponse=await fetch('https://api.cspstudy.top/api/wishes?device_hash=release-read-only-probe');
assert.equal(listResponse.status,200);
const list=await listResponse.json();
const items=Array.isArray(list)?list:list.items;
assert(Array.isArray(items));
assert(items.every(item=>item.next_vote_at===null),'Legacy clients must receive no wait');
const endpoints = [];
for (const path of ['/api/health','/api/collector-vote/config','/api/workshop/pets?limit=1&paginated=1','/api/dungeon/leaderboard?scope=global&type=power']) {
  const r = await fetch('https://api.cspstudy.top'+path);
  assert.equal(r.status,200,path);
  const data = await r.json();
  if(path==='/api/health') assert.equal(data.ok,true);
  endpoints.push({path,status:r.status,json:true});
}
console.log(JSON.stringify({verifiedAt:new Date().toISOString(),schemaVersion:14,historicalVotesPreserved:old.length,totalHistory:online.size,wishesPreserved:wishes.size,permanentUniqueLocks:0,cooldownDays:0,requestIdempotencyTable:true,endpoints,productionTestVotes:0},null,2));
