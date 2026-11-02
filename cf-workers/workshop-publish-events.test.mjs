import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './api.js';
import { WORKSHOP_PUBLISH_META_KEY as KEY, recordWorkshopPublicationChange as record,
  readWorkshopPublicationRevision as readRevision, queueWorkshopPublication as queue } from './workshop-publish-events.js';

export function makeD1() {
  const sql = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  sql.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');
  const db = { async exec(query) { sql.exec(query); }, prepare(query) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first(column) { const row = sql.prepare(query).get(...args); return column ? row?.[column] : row || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { const result = sql.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
  return { sql, db };
}
let fixture, env;
beforeEach(() => { fixture = makeD1(); env = { DB: fixture.db }; });
afterEach(() => fixture.sql.close());
const revision = () => Number(fixture.sql.prepare('SELECT value FROM meta WHERE key=?').get(KEY)?.value || 0);
describe('token-free workshop revision events', () => {
  it('returns zero before the first edit and increments concurrent edits atomically without any network credential', async () => {
    expect(await readRevision(env)).toBe(0);
    await Promise.all(Array.from({ length: 50 }, () => record(env)));
    expect(await readRevision(env)).toBe(50);
    await record(env); expect(await readRevision(env)).toBe(51);
    expect(fixture.sql.prepare('SELECT * FROM meta').all()).toEqual([expect.objectContaining({ key: KEY, value: '51' })]);
  });
  it('records in waitUntil and contains background storage errors without affecting saved metadata', async () => {
    const tasks = [];
    queue(env, { waitUntil: task => tasks.push(task) }); await tasks[0]; expect(revision()).toBe(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      queue({ DB: { prepare() { throw new Error('unavailable'); } } }, { waitUntil: task => tasks.push(task) });
      await expect(tasks[1]).resolves.toBeUndefined(); expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });
  it('rejects a malformed persisted counter rather than presenting a false unchanged revision', async () => {
    fixture.sql.prepare('INSERT INTO meta VALUES(?,?)').run(KEY, 'private or invalid data');
    await expect(readRevision(env)).rejects.toThrow('Invalid workshop publication revision');
  });
});

describe('workshop metadata event integration', () => {
  let tasks;
  beforeEach(() => {
    tasks = [];
    fixture.sql.exec(`INSERT INTO meta VALUES('schema_version','14');
      CREATE TABLE teachers(teacher_id TEXT PRIMARY KEY,phone TEXT,name TEXT,token TEXT,permissions TEXT,max_pets INTEGER);
      INSERT INTO teachers VALUES('T1','13800000000','老师','teacher-token','[]',20);
      CREATE TABLE workshop_pets(id TEXT PRIMARY KEY,teacher_id TEXT,teacher_name TEXT,name TEXT,slug TEXT,element TEXT,style TEXT,description TEXT,tier TEXT,price INTEGER,pet_json TEXT,spritesheet_url TEXT,thumbnail_url TEXT,status TEXT DEFAULT 'active',created_at TEXT);`);
    const sprites = new Map();
    env.SPRITES = { put: async (key, bytes) => { sprites.set(key, bytes); }, get: async key => sprites.get(key) };
  });
  const call = (path, method, body, token = 'teacher-token') => worker.fetch(new Request('https://test.invalid' + path, {
    method, headers: { 'X-Teacher-Token': token, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  }), env, { waitUntil: task => tasks.push(task) });
  const payload = { name: '测试智子', element: 'fire', tier: 'common', pet_json: JSON.stringify({ slug: 'test-pet' }) };
  const pending = () => fixture.sql.prepare('SELECT value FROM meta WHERE key=?').get(KEY);
  it('queues only successful JSON metadata create/update/delete, including owned-row checks', async () => {
    const created = await call('/api/workshop/pets', 'POST', payload);
    expect(created.status).toBe(200); const { id } = await created.json();
    await Promise.all(tasks); expect(revision()).toBe(1);
    expect((await call(`/api/workshop/pets/${id}`, 'PUT', { name: '新名称' })).status).toBe(200);
    await Promise.all(tasks); expect(revision()).toBe(2);
    expect((await call('/api/workshop/pets/other-owner', 'PUT', { name: '不能修改' })).status).toBe(200);
    expect(tasks).toHaveLength(2);
    expect((await call(`/api/workshop/pets/${id}`, 'DELETE')).status).toBe(200);
    await Promise.all(tasks); expect(revision()).toBe(3);
    await call(`/api/workshop/pets/${id}`, 'DELETE'); expect(tasks).toHaveLength(3);
    expect(fixture.sql.prepare('SELECT status FROM workshop_pets WHERE id=?').get(id).status).toBe('deleted');
  });
  it('queues a successful multipart metadata upload after its asset writes finish', async () => {
    const form = new FormData();
    form.set('name', '表单智子'); form.set('element', 'water');
    form.set('pet_json', JSON.stringify({ name: '表单智子', slug: 'form-pet', animOrder: ['idle'] }));
    form.set('spritesheet', new Blob(['png-bytes'], { type: 'image/png' }), 'sheet.png');
    expect((await call('/api/workshop/pets', 'POST', form)).status).toBe(200);
    await Promise.all(tasks); expect(revision()).toBe(1);
  });
  it('does not publish original-image uploads even when their storage succeeds', async () => {
    expect((await call('/api/workshop/upload', 'POST', { image: 'data:image/png;base64,AQID', filename: 'source.png' })).status).toBe(200);
    expect(tasks).toHaveLength(0); expect(pending()).toBeUndefined();
  });
  it('does not queue unauthorized or invalid metadata, nor failed database mutations', async () => {
    for (const [method, path, body] of [['POST', '/api/workshop/pets', payload], ['PUT', '/api/workshop/pets/ws-other', { name: 'test' }], ['DELETE', '/api/workshop/pets/ws-other', undefined]]) {
      expect((await call(path, method, body, '')).status).toBe(401);
    }
    expect((await call('/api/workshop/pets', 'POST', {})).status).toBe(400);
    fixture.sql.exec("CREATE TRIGGER refuse_workshop BEFORE INSERT ON workshop_pets BEGIN SELECT RAISE(FAIL,'synthetic write failure'); END;");
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect((await call('/api/workshop/pets', 'POST', payload)).status).toBe(500); }
    finally { warn.mockRestore(); }
    expect(tasks).toHaveLength(0); expect(pending()).toBeUndefined();
  });
  it('exposes only the public numeric revision and increments it after successful saved changes', async () => {
    const poll = () => call('/api/workshop/publication-revision', 'GET', undefined, '');
    let response = await poll();
    expect(response.status).toBe(200); expect(await response.json()).toBe(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await call('/api/workshop/pets', 'POST', payload)).status).toBe(200);
    await Promise.all(tasks);
    response = await poll(); expect(await response.text()).toBe('1');
    expect((await call('/api/workshop/publication-revision', 'POST', {})).status).toBe(404);
    expect(revision()).toBe(1);
  });
});
