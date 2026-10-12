import fs from 'node:fs';
import { createHash } from 'node:crypto';
const url = 'https://www.luogu.com.cn/discuss/1380094';
const html = await (await fetch(url)).text();
const match = html.match(/<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/);
if (!match) throw new Error('Missing Luogu page data');
const data = JSON.parse(match[1]);
function find(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.content === 'string' && node.content.includes('CSP-J') && node.content.includes('CSP-S')) return node.content;
  for (const item of Object.values(node)) { const value = find(item); if (value) return value; }
  return null;
}
const content = find(data);
if (!content) throw new Error('Missing J/S paper content');
fs.mkdirSync('reports/csp-2026', { recursive: true });
fs.writeFileSync('reports/csp-2026/luogu-source.md', content);
fs.writeFileSync('reports/csp-2026/source.json', JSON.stringify({url, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(content).digest('hex'), official: false}, null, 2)+'\n');
console.log('Saved Luogu source snapshot:', content.length, 'characters');
