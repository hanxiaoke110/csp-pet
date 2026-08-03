import { describe, expect, it } from 'vitest';
import worker from './api.js';

/**
 * 补偿码（CMP）逻辑测试：老师自定义金币/经验、绑定班级、一码一人全局一次。
 * 用内存 Map 模拟 D1 中涉及的表（classes / class_students / generated_codes / rate_limits）。
 */
function makeDb() {
  const classes = new Map<string, { class_code: string; teacher_id: string; status: string }>();
  const students = new Map<string, { status: string }>();
  const codes = new Map<string, Record<string, unknown>>();
  const rateLimits = new Map<string, { count: number; reset_at: string }>();

  const db: any = {
    seedClass(code: string, teacherId: string) {
      classes.set(code, { class_code: code, teacher_id: teacherId, status: 'active' });
    },
    seedStudent(code: string, dh: string) {
      students.set(`${code}:${dh}`, { status: 'active' });
    },
    async exec() {},
    prepare(sql: string) {
      const call: any = { sql, bindings: [] as unknown[] };
      const bound = { ...call };
      return {
        bind(...values: unknown[]) { call.bindings = values; return this; },
        async first() {
          if (sql.includes('FROM teachers WHERE token=')) {
            const token = String(call.bindings[0] || '');
            return token === 't-a' ? { teacher_id: 'teacher-A', name: '老师A', token } : null;
          }
          if (sql.includes('FROM classes WHERE class_code=')) {
            const code = String(call.bindings[0] || '');
            const cls = classes.get(code);
            if (!cls || cls.status !== 'active') return null;
            if (sql.includes('teacher_id=') && cls.teacher_id !== call.bindings[1]) return null;
            return cls;
          }
          if (sql.includes('FROM generated_codes WHERE code=')) {
            return codes.get(String(call.bindings[0] || '')) || null;
          }
          if (sql.includes('FROM class_students WHERE class_code=')) {
            const key = `${call.bindings[0]}:${call.bindings[1]}`;
            const st = students.get(key);
            return st && st.status === 'active' ? { ok: 1 } : null;
          }
          if (sql.includes('FROM rate_limits WHERE key=')) {
            const key = String(call.bindings[0] || '');
            return rateLimits.get(key) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO generated_codes')) {
            // VALUES (?,'comp',?,'',?,?,?,'unused',datetime('now'))
            const [code, teacherId, coins, exp, classCode] = call.bindings;
            codes.set(String(code), {
              code, type: 'comp', teacher_id: teacherId, level: '',
              coins, exp, class_code: classCode, status: 'unused', used_at: null, used_device_hash: null,
            });
            return { meta: { changes: 1, last_row_id: 1 } };
          }
          if (sql.includes("INSERT OR REPLACE INTO rate_limits")) {
            const [key, resetAt] = call.bindings;
            rateLimits.set(String(key), { count: 1, reset_at: String(resetAt) });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE rate_limits SET count = count + 1')) {
            const key = String(call.bindings[0] || '');
            const row = rateLimits.get(key);
            if (row) row.count += 1;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE generated_codes SET status='used'")) {
            const [deviceHash, code] = call.bindings;
            const row = codes.get(String(code));
            if (!row || row.status !== 'unused') return { meta: { changes: 0 } };
            row.status = 'used';
            row.used_device_hash = deviceHash;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async all() { return { results: [] }; },
      };
    },
  };
  return db;
}

function callWorker(db: any, path: string, method: string, token?: string, body?: unknown, admin = false) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'vitest' };
  if (token) headers['X-Teacher-Token'] = token;
  if (admin) headers['X-Admin-Token'] = 'admin-token';
  return worker.fetch(
    new Request(`https://api.example.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB: db, ADMIN_TOKEN: 'admin-token' },
    { waitUntil() {} } as any,
  );
}

describe('补偿码生成 /api/codes/comp', () => {
  it('老师生成补偿码：金额、数量、班级绑定入库', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    const resp = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 500, exp: 1000, count: 2, class_code: 'CLASS-A' });
    const data = await resp.json() as any;
    expect(resp.status).toBe(200);
    expect(data.codes).toHaveLength(2);
    expect(data.coins).toBe(500);
    expect(data.exp).toBe(1000);
    for (const code of data.codes) expect(code.startsWith('CMP-')).toBe(true);
  });

  it('未登录 401；非本班班级 403；不填班级码可生成（不绑定）', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedClass('CLASS-B', 'teacher-B');
    const noAuth = await callWorker(db, '/api/codes/comp', 'POST', undefined, { coins: 100, exp: 100, count: 1, class_code: 'CLASS-A' });
    expect(noAuth.status).toBe(401);
    const otherClass = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 1, class_code: 'CLASS-B' });
    expect(otherClass.status).toBe(403);
    const noClass = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 1 });
    const noClassData = await noClass.json() as any;
    expect(noClass.status).toBe(200);
    expect(noClassData.codes).toHaveLength(1);
  });

  it('金额上限校验：0 或超上限被拒绝/收敛', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    const bad = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 0, exp: 100, count: 1, class_code: 'CLASS-A' });
    expect(bad.status).toBe(400);
  });
});

describe('补偿码兑换 /api/codes/redeem', () => {
  it('本班学生兑换成功，金币经验按生成值返回', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedStudent('CLASS-A', 'DEVICE-1');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 300, exp: 800, count: 1, class_code: 'CLASS-A' });
    const { codes } = await gen.json() as any;
    const resp = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-1' });
    const data = await resp.json() as any;
    expect(resp.status).toBe(200);
    expect(data).toMatchObject({ success: true, coins: 300, exp: 800 });
  });

  it('一码一人：同设备重复兑、他设备再兑都失败', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedStudent('CLASS-A', 'DEVICE-1');
    db.seedStudent('CLASS-A', 'DEVICE-2');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 1, class_code: 'CLASS-A' });
    const { codes } = await gen.json() as any;
    const first = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-1' });
    expect(first.status).toBe(200);
    const again = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-1' });
    expect(again.status).toBe(400);
    const other = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-2' });
    expect(other.status).toBe(400);
  });

  it('班级限制：非绑定班学生兑换 403；不存在码 404；非 CMP 前缀 400', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedClass('CLASS-B', 'teacher-B');
    db.seedStudent('CLASS-A', 'DEVICE-A');
    db.seedStudent('CLASS-B', 'DEVICE-B');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 1, class_code: 'CLASS-A' });
    const { codes } = await gen.json() as any;
    const wrongClass = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-B' });
    expect(wrongClass.status).toBe(403);
    const missing = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: 'CMP-AAAAAAAAAAAAAAAA', device_hash: 'DEVICE-A' });
    expect(missing.status).toBe(404);
    const badPrefix = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: 'EXC-1-0801-AAAA-AAAA', device_hash: 'DEVICE-A' });
    expect(badPrefix.status).toBe(400);
  });

  it('不绑定班级的补偿码：任意班学生都能兑换，且全局仍只能一次', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedClass('CLASS-B', 'teacher-B');
    db.seedStudent('CLASS-A', 'DEVICE-A');
    db.seedStudent('CLASS-B', 'DEVICE-B');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 200, exp: 500, count: 1 });
    const { codes } = await gen.json() as any;
    const byA = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-A' });
    expect(byA.status).toBe(200);
    const byB = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-B' });
    expect(byB.status).toBe(400);
  });

  it('并发兑换同一码：原子占用，只有一个成功', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedStudent('CLASS-A', 'DEVICE-A');
    db.seedStudent('CLASS-A', 'DEVICE-B');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 1 });
    const { codes } = await gen.json() as any;
    const [r1, r2] = await Promise.all([
      callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-A' }),
      callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[0], device_hash: 'DEVICE-B' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
  });

  it('数量超过 20 收敛为 20；管理员可生成', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    const admin = await callWorker(db, '/api/codes/comp', 'POST', undefined, { coins: 100, exp: 100, count: 1, class_code: 'CLASS-A' }, true);
    expect(admin.status).toBe(200);
    const many = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 999 });
    const manyData = await many.json() as any;
    expect(many.status).toBe(200);
    expect(manyData.codes).toHaveLength(20);
  });

  it('兑换限流：同设备 1 分钟最多 5 次', async () => {
    const db = makeDb();
    db.seedClass('CLASS-A', 'teacher-A');
    db.seedStudent('CLASS-A', 'DEVICE-A');
    const gen = await callWorker(db, '/api/codes/comp', 'POST', 't-a', { coins: 100, exp: 100, count: 10 });
    const { codes } = await gen.json() as any;
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[i], device_hash: 'DEVICE-A' });
      statuses.push(r.status);
    }
    const sixth = await callWorker(db, '/api/codes/redeem', 'POST', undefined, { code: codes[5], device_hash: 'DEVICE-A' });
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(sixth.status).toBe(429);
  });
});
