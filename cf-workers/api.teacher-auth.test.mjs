import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker from './api.js';
let sql, db;
beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  db = { exec: async query => sql.exec(query), prepare(query) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
  } };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old-password-csp-teacher-salt'));
  const hash = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  sql.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO meta VALUES('schema_version','12');
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,reset_at TEXT);
    CREATE TABLE teachers(teacher_id TEXT PRIMARY KEY,phone TEXT,password_hash TEXT,name TEXT,token TEXT,permissions TEXT,max_pets INTEGER,created_at TEXT);
    CREATE TABLE classes(class_code TEXT,teacher_id TEXT,status TEXT,created_at TEXT);`);
  sql.prepare('INSERT INTO teachers VALUES(?,?,?,?,?,?,?,?)').run('T1','13800000000',hash,'老师','legacy-token','[]',20,'2026-01-01');
});
afterEach(() => { sql.close(); vi.useRealTimers(); });
const request = (path, body, headers = {}, env = {}) => worker.fetch(new Request('https://test.invalid' + path, {
  method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), headers: { 'Content-Type': 'application/json', ...headers },
}), { DB: db, ADMIN_TOKEN: 'synthetic-admin', TEACHER_SESSION_V2: 'enabled', ...env }, { waitUntil() {} });
const login = (password = 'old-password', headers = {}) => request('/api/teacher/login', { phone: '13800000000', password }, headers);
const classes = token => request('/api/classes', undefined, { 'X-Teacher-Token': token });
it('keeps the existing non-expiring login behavior unless the new session rollout is explicitly enabled', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  const response = await request('/api/teacher/login', { phone: '13800000000', password: 'old-password' }, {}, { TEACHER_SESSION_V2: undefined });
  expect(response.status).toBe(200);
  const { token } = await response.json();
  expect(token).not.toMatch(/^v2\./);
  vi.setSystemTime(new Date('2026-11-19T00:00:00Z'));
  expect((await classes(token)).status).toBe(200);
});
it('resetting a password revokes the previous session immediately', async () => {
  expect((await classes('legacy-token')).status).toBe(200);
  expect((await request('/admin/teachers/T1/reset-password', { password: 'new-password' }, { 'X-Admin-Token': 'synthetic-admin' })).status).toBe(200);
  expect((await classes('legacy-token')).status).toBe(401);
  expect((await login()).status).toBe(401);
  expect((await login('new-password')).status).toBe(200);
});
it('keeps legacy sessions compatible and expires newly issued sessions after seven days', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  expect((await classes('legacy-token')).status).toBe(200);
  const response = await login();
  expect(response.status).toBe(200);
  const { token } = await response.json();
  expect((await classes(token)).status).toBe(200);
  expect((await classes('legacy-token')).status).toBe(401);
  vi.setSystemTime(new Date('2026-10-26T00:00:01Z'));
  expect((await classes(token)).status).toBe(401);
  expect((await login()).status).toBe(200);
});
it('atomically limits parallel login attempts and permits a new window after the cooldown', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  const results = await Promise.all(Array.from({ length: 8 }, () => login('incorrect')));
  expect(results.filter(response => response.status === 401)).toHaveLength(5);
  expect(results.filter(response => response.status === 429)).toHaveLength(3);
  expect((await login()).status).toBe(429);
  vi.setSystemTime(new Date('2026-10-19T00:15:01Z'));
  expect((await login()).status).toBe(200);
});
it('normal successful logins clear account failures and never authenticate a stored token digest', async () => {
  for (let i = 0; i < 8; i++) {
    expect((await login('typo')).status).toBe(401);
    const response = await login();
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect((await classes(token)).status).toBe(200);
  }
  const stored = sql.prepare('SELECT token FROM teachers').get().token;
  expect(stored).toMatch(/^sha256:/);
  expect((await classes(stored)).status).toBe(401);
  const forged = `v2.${Math.floor(Date.now() / 1000) + 3600}.${'a'.repeat(64)}`;
  expect((await classes(forged)).status).toBe(401);
});
