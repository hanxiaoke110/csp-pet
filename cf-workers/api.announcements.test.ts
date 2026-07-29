import { describe, expect, it } from 'vitest';
import worker from './api.js';

function makeDb() {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    calls,
    async exec() {},
    prepare(sql: string) {
      const call = { sql, bindings: [] as unknown[] };
      calls.push(call);
      return {
        bind(...values: unknown[]) { call.bindings = values; return this; },
        async first() {
          if (sql.includes("key='schema_version'")) return { value: '6' };
          if (sql.includes('FROM classes WHERE class_code=')) return { teacher_id: 'teacher-A' };
          if (sql.includes('FROM teachers WHERE token=')) {
            return { teacher_id: 'teacher-A', name: '王老师', token: 'teacher-token' };
          }
          return null;
        },
        async run() { return { meta: { changes: 1, last_row_id: 8 } }; },
        async all() {
          if (sql.includes('FROM announcements')) {
            return { results: [{ id: 1, title: '公告', content: '内容', scope: 'teacher', teacher_id: 'teacher-A' }] };
          }
          return { results: [] };
        },
      };
    },
  };
}

const ctx = { waitUntil() {} } as any;

describe('公告权限与可见范围', () => {
  it('学生只通过班级码解析教师，并同时查询全服和该教师公告', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/announcements?class_code=6WB74A1ZPP9E'),
      { DB: db },
      ctx,
    );

    expect(response.status).toBe(200);
    const classQuery = db.calls.find(call => call.sql.includes('FROM classes WHERE class_code='));
    const announcementQuery = db.calls.find(call => call.sql.includes('FROM announcements'));
    expect(classQuery?.bindings).toEqual(['6WB74A1ZPP9E']);
    expect(announcementQuery?.sql).toContain("scope='teacher' AND teacher_id=?");
    expect(announcementQuery?.bindings).toEqual(['teacher-A']);
  });

  it('教师修改公告时 SQL 同时约束公告范围和教师所有权', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/teacher/announcements/7', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Teacher-Token': 'teacher-token' },
        body: JSON.stringify({ title: '新标题', content: '新内容', pinned: true }),
      }),
      { DB: db },
      ctx,
    );

    expect(response.status).toBe(200);
    const update = db.calls.find(call => call.sql.startsWith('UPDATE announcements SET title='));
    expect(update?.sql).toContain("scope='teacher' AND teacher_id=?");
    expect(update?.bindings.at(-1)).toBe('teacher-A');
  });

  it('管理员创建公告时范围固定为全服', async () => {
    const db = makeDb();
    const response = await worker.fetch(
      new Request('https://api.example.test/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin-token' },
        body: JSON.stringify({ title: '版本更新', content: '更新内容', scope: 'teacher' }),
      }),
      { DB: db, ADMIN_TOKEN: 'admin-token' },
      ctx,
    );

    expect(response.status).toBe(200);
    const insert = db.calls.find(call => call.sql.startsWith('INSERT INTO announcements'));
    expect(insert?.sql).toContain("'global'");
    expect(insert?.bindings).toEqual(['版本更新', '更新内容', 0]);
  });
});
