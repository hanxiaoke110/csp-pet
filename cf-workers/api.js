// CSP API — Cloudflare Workers + D1
// 部署在 api.cspstudy.top
// 功能：许愿墙 + 教师管理 + 班级系统 + 兑换码生成

const MONTHLY_SUBMIT_LIMIT = 3;
const CLEANUP_PROTECT_DAYS = 7;
const CLEANUP_MIN_KEEP = 20;

// ── 敏感词黑名单 ──
const BAD_WORDS = [
  '色情','裸体','裸聊','性交','淫秽','色诱','约炮','嫖娼','卖淫','色情片','成人','激情',
  '杀人','杀死','砍死','炸死','枪毙','自杀','割腕','跳楼','虐杀','打死','弄死','灭口',
  '习近','法轮','六四','天安门','台独','藏独','港独','疆独','退党','翻墙',
  '傻逼','操你','你妈','草泥马','fuck','shit','bitch','nigger','卧槽','尼玛','sb',
  '赌博','赌场','吸毒','大麻','海洛因','摇头丸','冰毒','可卡因','毒品','嗑药',
  '诈骗','传销','网赌','裸贷','校园贷','高利贷','刷单','返利',
  '代考','替考','作弊','答案','买分',
];
function hasBadContent(text) {
  if (!text) return false;
  const lower = text.toLowerCase().replace(/\s/g, '');
  return BAD_WORDS.some(w => lower.includes(w));
}

// ── AES-GCM encryption ──
let _serverKey = null;
async function getServerKey(env) {
  if (_serverKey) return _serverKey;
  if (!env.SERVER_SECRET) throw new Error('SERVER_SECRET not configured');
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SERVER_SECRET), { name: 'PBKDF2' }, false, ['deriveKey']);
  _serverKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('csp-admin-salt'), iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return _serverKey;
}
async function serverEncrypt(text, env) {
  if (!text) return '';
  const key = await getServerKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function serverDecrypt(encBase64, env) {
  if (!encBase64) return '';
  try {
    const key = await getServerKey(env);
    const bytes = Uint8Array.from(atob(encBase64), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12); const data = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return '[解密失败]'; }
}

// ── Auth ──
function checkAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token') || '';
  return token === (env.ADMIN_TOKEN || 'csp-admin-2024');
}
async function checkTeacher(request, db) {
  const token = request.headers.get('X-Teacher-Token') || '';
  if (!token) return null;
  const t = await db.prepare('SELECT teacher_id, phone, name, token FROM teachers WHERE token=?').bind(token).first();
  return t || null;
}

// ── Hash (matches Chrome extension algorithm) ──
function codeHash(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = ((h << 5) - h + input.charCodeAt(i)) | 0; }
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  let v = Math.abs(h);
  for (let i = 0; i < 4; i++) { result = chars[v % chars.length] + result; v = Math.floor(v / chars.length); }
  return result;
}
function randomChars(len) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let r = '';
  for (let i = 0; i < len; i++) r += chars[bytes[i] % chars.length];
  return r;
}

// ── Date helpers ──
function getMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function getDateStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
function getDateShort() {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
function getDateDashed() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ── Schema migration (cached per instance) ──
let _schemaEnsured = false;
async function ensureSchema(db) {
  if (_schemaEnsured) return;
  // Core tables (CREATE IF NOT EXISTS for fresh deployments)
  try { await db.exec(`CREATE TABLE IF NOT EXISTS wishes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, display_name TEXT, real_name_enc TEXT DEFAULT '', phone_enc TEXT DEFAULT '', device_hash TEXT, votes INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), class_code TEXT DEFAULT '')`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS votes (id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id INTEGER, device_hash TEXT, class_code TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS teachers (teacher_id TEXT PRIMARY KEY, phone TEXT UNIQUE, password_hash TEXT, name TEXT, token TEXT, created_at TEXT)`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS classes (class_code TEXT PRIMARY KEY, teacher_id TEXT, teacher_name TEXT DEFAULT '', label TEXT DEFAULT '', created_at TEXT, status TEXT DEFAULT 'active')`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS class_students (class_code TEXT, device_hash TEXT, student_name TEXT, joined_at TEXT, status TEXT DEFAULT 'active', PRIMARY KEY(class_code, device_hash))`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS generated_codes (code TEXT PRIMARY KEY, type TEXT, teacher_id TEXT, level TEXT, created_at TEXT)`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, title TEXT, description TEXT, teacher_id TEXT, teacher_name TEXT, submitter TEXT DEFAULT 'teacher', status TEXT DEFAULT 'open', created_at TEXT)`); } catch {}
  try { await db.exec(`CREATE TABLE IF NOT EXISTS workshop_pets (id TEXT PRIMARY KEY, teacher_id TEXT, teacher_name TEXT, name TEXT, element TEXT, style TEXT, description TEXT, tier TEXT, price INTEGER, pet_json TEXT, spritesheet_url TEXT, thumbnail_url TEXT, status TEXT DEFAULT 'active', created_at TEXT)`); } catch {}
  try { await db.exec(`ALTER TABLE feedback ADD COLUMN submitter TEXT DEFAULT 'teacher'`); } catch {}
  // Migrations for existing tables
  try { await db.exec(`ALTER TABLE wishes ADD COLUMN phone_enc TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE wishes ADD COLUMN class_code TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE wishes ADD COLUMN real_name_enc TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE votes ADD COLUMN class_code TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE classes ADD COLUMN teacher_id TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE classes ADD COLUMN label TEXT DEFAULT ''`); } catch {}
  try { await db.exec(`ALTER TABLE classes ADD COLUMN status TEXT DEFAULT 'active'`); } catch {}
  try { await db.exec(`ALTER TABLE classes ADD COLUMN teacher_name TEXT DEFAULT ''`); } catch {}
  // Unique index for vote dedup (atomic INSERT race-condition fix)
  try { await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_unique ON votes(wish_id, device_hash)`); } catch {}
  _schemaEnsured = true;
}

// ── Lazy monthly cleanup ──
let _cleanupChecked = '';
async function maybeCleanup(db) {
  const thisMonth = getMonthKey();
  if (_cleanupChecked === thisMonth) return; // Instance cache
  const last = await db.prepare("SELECT value FROM meta WHERE key='last_cleanup'").first();
  if (last && last.value === thisMonth) { _cleanupChecked = thisMonth; return; }
  await db.prepare(`UPDATE wishes SET status='archived' WHERE status='active' AND votes=0 AND created_at < datetime('now','-${CLEANUP_PROTECT_DAYS} days')`).run();
  const cnt = await db.prepare("SELECT COUNT(*) as c FROM wishes WHERE status='active'").first();
  if (cnt && cnt.c > CLEANUP_MIN_KEEP) {
    const n = Math.floor(cnt.c * 0.2);
    if (n > 0) await db.prepare(`UPDATE wishes SET status='archived' WHERE id IN (SELECT id FROM wishes WHERE status='active' AND created_at < datetime('now','-${CLEANUP_PROTECT_DAYS} days') ORDER BY votes ASC, created_at ASC LIMIT ?)`).bind(n).run();
  }
  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_cleanup', ?)").bind(thisMonth).run();
  _cleanupChecked = thisMonth;
}

// ── Password hashing (simple SHA-256) ──
async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw + '-csp-teacher-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ═══════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;
    await ensureSchema(db);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Teacher-Token',
      'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      // ═══ TEACHER AUTH ═══
      if (path === '/api/teacher/register' && request.method === 'POST') {
        const { phone, password, name } = await request.json();
        if (!phone || !password || !name) return new Response(JSON.stringify({ error: '请填写手机号、密码和花名' }), { status: 400, headers: cors });
        if (!/^1[3-9]\d{9}$/.test(phone)) return new Response(JSON.stringify({ error: '手机号格式不正确' }), { status: 400, headers: cors });
        if (password.length < 6) return new Response(JSON.stringify({ error: '密码至少6位' }), { status: 400, headers: cors });
        if (!/^[a-zA-Z一-龥]{2,10}$/.test(name)) return new Response(JSON.stringify({ error: '花名需2-10个汉字或英文字母' }), { status: 400, headers: cors });

        const exists = await db.prepare('SELECT teacher_id FROM teachers WHERE phone=?').bind(phone).first();
        if (exists) return new Response(JSON.stringify({ error: '该手机号已注册' }), { status: 409, headers: cors });

        const nameExists = await db.prepare('SELECT teacher_id FROM teachers WHERE name=?').bind(name).first();
        if (nameExists) return new Response(JSON.stringify({ error: '该花名已被使用' }), { status: 409, headers: cors });

        const teacherId = 'T' + randomChars(8);
        const pwHash = await hashPassword(password);
        const token = randomChars(32);
        await db.prepare('INSERT INTO teachers (teacher_id, phone, password_hash, name, token, created_at) VALUES (?,?,?,?,?,datetime("now"))').bind(teacherId, phone, pwHash, name, token).run();
        return new Response(JSON.stringify({ success: true, teacher_id: teacherId, token, name }), { headers: cors });
      }

      if (path === '/api/teacher/login' && request.method === 'POST') {
        const { phone, password } = await request.json();
        const t = await db.prepare('SELECT * FROM teachers WHERE phone=?').bind(phone).first();
        if (!t) return new Response(JSON.stringify({ error: '手机号未注册' }), { status: 401, headers: cors });

        const pwHash = await hashPassword(password);
        if (pwHash !== t.password_hash) return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers: cors });

        // Rotate token
        const token = randomChars(32);
        await db.prepare('UPDATE teachers SET token=? WHERE teacher_id=?').bind(token, t.teacher_id).run();
        return new Response(JSON.stringify({ success: true, teacher_id: t.teacher_id, token, name: t.name }), { headers: cors });
      }

      // ═══ CLASS MANAGEMENT (teacher auth) ═══
      if (path === '/api/classes' && request.method === 'GET') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });
        const classes = await db.prepare("SELECT * FROM classes WHERE teacher_id=? AND status='active' ORDER BY created_at DESC").bind(teacher.teacher_id).all();
        return new Response(JSON.stringify(classes.results), { headers: cors });
      }

      if (path === '/api/classes' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const { label } = await request.json();
        if (!label) return new Response(JSON.stringify({ error: '请输入班级名称' }), { status: 400, headers: cors });

        // Generate unique class code (12-char random)
        let code;
        for (let i = 0; i < 10; i++) {
          code = randomChars(12);
          const dup = await db.prepare('SELECT class_code FROM classes WHERE class_code=?').bind(code).first();
          if (!dup) break;
        }
        await db.prepare('INSERT INTO classes (class_code, teacher_id, teacher_name, label, created_at) VALUES (?,?,?,?,datetime("now"))').bind(code, teacher.teacher_id, teacher.name, label).run();
        return new Response(JSON.stringify({ success: true, class_code: code, label }), { headers: cors });
      }

      if (path.startsWith('/api/classes/') && path.endsWith('/delete') && request.method === 'DELETE') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });
        const code = path.split('/')[3];
        const cls = await db.prepare('SELECT * FROM classes WHERE class_code=? AND teacher_id=?').bind(code, teacher.teacher_id).first();
        if (!cls) return new Response(JSON.stringify({ error: '班级不存在' }), { status: 404, headers: cors });
        await db.prepare("UPDATE classes SET status='deleted' WHERE class_code=?").bind(code).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // Class code validation + student status check
      if (path === '/api/classes/validate' && request.method === 'GET') {
        const code = url.searchParams.get('code') || '';
        const dh = url.searchParams.get('device_hash') || '';
        const cls = await db.prepare("SELECT c.*, t.name as teacher_name FROM classes c JOIN teachers t ON c.teacher_id=t.teacher_id WHERE c.class_code=? AND c.status='active'").bind(code).first();
        if (!cls) return new Response(JSON.stringify({ error: '班级码无效或已关闭' }), { status: 404, headers: cors });
        // Check student status if device_hash provided (accept active or unbind_pending)
        if (dh) {
          const student = await db.prepare("SELECT * FROM class_students WHERE class_code=? AND device_hash=? AND status IN ('active','unbind_pending')").bind(code, dh).first();
          if (!student) return new Response(JSON.stringify({ error: '你已被移出该班级' }), { status: 403, headers: cors });
        }
        return new Response(JSON.stringify({ class_code: cls.class_code, label: cls.label, teacher_name: cls.teacher_name, teacher_id: cls.teacher_id }), { headers: cors });
      }

      // Class binding (student registers to class)
      if (path === '/api/classes/bind' && request.method === 'POST') {
        const { class_code, device_hash, student_name } = await request.json();
        if (!class_code || !device_hash) return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: cors });
        if (student_name && !/^[a-zA-Z一-龥]{1,10}$/.test(student_name)) return new Response(JSON.stringify({ error: '姓名只能使用中文或英文，1-10个字' }), { status: 400, headers: cors });

        const cls = await db.prepare("SELECT * FROM classes WHERE class_code=? AND status='active'").bind(class_code).first();
        if (!cls) return new Response(JSON.stringify({ error: '班级码无效' }), { status: 404, headers: cors });

        // Upsert student binding (preserve original joined_at)
        await db.prepare("INSERT INTO class_students (class_code, device_hash, student_name, joined_at, status) VALUES (?,?,?,datetime('now'),'active') ON CONFLICT(class_code, device_hash) DO UPDATE SET student_name=excluded.student_name, status='active'").bind(class_code, device_hash, student_name || '').run();
        return new Response(JSON.stringify({ success: true, class_code, label: cls.label, teacher_name: cls.teacher_name }), { headers: cors });
      }

      // PUT /api/classes/update-info — student updates their info
      if (path === '/api/classes/update-info' && request.method === 'POST') {
        const { class_code, device_hash, student_name } = await request.json();
        if (!class_code || !device_hash) return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: cors });
        if (student_name && !/^[a-zA-Z一-龥]{1,10}$/.test(student_name)) return new Response(JSON.stringify({ error: '姓名只能使用中文或英文，1-10个字' }), { status: 400, headers: cors });

        // Verify student is active in class
        const student = await db.prepare("SELECT * FROM class_students WHERE class_code=? AND device_hash=? AND status='active'").bind(class_code, device_hash).first();
        if (!student) return new Response(JSON.stringify({ error: '你已不在该班级中' }), { status: 403, headers: cors });

        await db.prepare("UPDATE class_students SET student_name=? WHERE class_code=? AND device_hash=?").bind(student_name || '', class_code, device_hash).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // ═══ CODE GENERATION (teacher auth) ═══
      const EXC_SECRET = 'csp-coach-2025';
      const CAMP_SECRET = 'csp-camp-2025';

      if (path === '/api/codes/exc' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher && !checkAdmin(request, env)) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const { level, count } = await request.json();
        const cnt = Math.min(count || 1, 20);
        const codes = [];
        for (let i = 0; i < cnt; i++) {
          const date = getDateShort(); // MMDD — matches Chrome extension
          const rand = randomChars(4);
          const hash = codeHash(`${level}-${date}-${rand}-${EXC_SECRET}`);
          const code = `EXC-${level}-${date}-${hash}-${rand}`;
          codes.push(code);
          await db.prepare('INSERT INTO generated_codes (code, type, teacher_id, level, created_at) VALUES (?,"exc",?,?,datetime("now"))').bind(code, teacher.teacher_id, String(level)).run();
        }
        return new Response(JSON.stringify({ codes }), { headers: cors });
      }

      if (path === '/api/codes/camp' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher && !checkAdmin(request, env)) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const date = getDateStr();
        const rand = randomChars(4);
        const hash = codeHash(`${date}-${rand}-${CAMP_SECRET}`);
        const code = `CAMP-${date}-${hash}-${rand}`;
        await db.prepare('INSERT INTO generated_codes (code, type, teacher_id, level, created_at) VALUES (?,"camp",?,?,datetime("now"))').bind(code, teacher.teacher_id, '').run();
        return new Response(JSON.stringify({ code }), { headers: cors });
      }

      // ═══ WISH WALL (public) ═══
      if (path === '/api/wishes' && request.method === 'GET') {
        await maybeCleanup(db);

        const sort = url.searchParams.get('sort') || 'hot';
        const classCode = url.searchParams.get('class_code') || '';
        const order = sort === 'new' ? 'created_at DESC' : 'votes DESC, created_at DESC';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

        let result;
        if (classCode) {
          // Teacher-level isolation: find teacher and show all their classes' wishes
          const cls = await db.prepare("SELECT teacher_id FROM classes WHERE class_code=? AND status='active'").bind(classCode).first();
          if (cls) {
            const classCodes = await db.prepare("SELECT class_code FROM classes WHERE teacher_id=? AND status='active'").bind(cls.teacher_id).all();
            const codes = classCodes.results.map(r => r.class_code);
            if (codes.length > 0) {
              const placeholders = codes.map(() => '?').join(',');
              result = await db.prepare(`SELECT id, content, display_name, votes, status, created_at FROM wishes WHERE status IN ('active','completed') AND class_code IN (${placeholders}) ORDER BY ${order} LIMIT ?`).bind(...codes, limit).all();
            } else {
              result = { results: [] };
            }
          } else {
            result = { results: [] };
          }
        } else {
          // No class code — show all wishes (backward compat)
          result = await db.prepare(`SELECT id, content, display_name, votes, status, created_at FROM wishes WHERE status IN ('active','completed') ORDER BY ${order} LIMIT ?`).bind(limit).all();
        }
        return new Response(JSON.stringify(result.results), { headers: cors });
      }

      if (path === '/api/wishes/my-stats' && request.method === 'GET') {
        const device_hash = url.searchParams.get('device_hash') || '';
        const count = await db.prepare("SELECT COUNT(*) as c FROM wishes WHERE device_hash=? AND status IN ('active','archived') AND created_at >= datetime('now','start of month')").bind(device_hash).first();
        return new Response(JSON.stringify({ monthlySubmitted: count ? count.c : 0, monthlyLimit: MONTHLY_SUBMIT_LIMIT }), { headers: cors });
      }

      if (path === '/api/wishes' && request.method === 'POST') {
        const body = await request.json();
        const { content, display_name, real_name, phone, device_hash, class_code } = body;

        if (hasBadContent(content) || hasBadContent(display_name)) return new Response(JSON.stringify({ error: '内容包含不当词汇，请重新输入' }), { status: 400, headers: cors });
        if (!content || content.length < 2 || content.length > 60) return new Response(JSON.stringify({ error: '内容需2-60字' }), { status: 400, headers: cors });
        if (!display_name || display_name.length < 1 || display_name.length > 20) return new Response(JSON.stringify({ error: '昵称需1-20字' }), { status: 400, headers: cors });
        if (phone && !/^1[3-9]\d{9}$/.test(phone)) return new Response(JSON.stringify({ error: '手机号格式不正确' }), { status: 400, headers: cors });

        // Require class_code for submission
        if (!class_code) return new Response(JSON.stringify({ error: '请先在设置中绑定班级码' }), { status: 400, headers: cors });

        // Validate class_code and student status
        const cls = await db.prepare("SELECT * FROM classes WHERE class_code=? AND status='active'").bind(class_code).first();
        if (!cls) return new Response(JSON.stringify({ error: '班级已关闭，请联系老师' }), { status: 400, headers: cors });

        // Check if student is still active in this class
        const student = await db.prepare("SELECT * FROM class_students WHERE class_code=? AND device_hash=? AND status='active'").bind(class_code, device_hash).first();
        if (!student) return new Response(JSON.stringify({ error: '你已被移出班级，无法提交许愿' }), { status: 403, headers: cors });

        // Rate limiting
        const recent24 = await db.prepare("SELECT COUNT(*) as c FROM wishes WHERE device_hash=? AND created_at > datetime('now','-1 day')").bind(device_hash).first();
        if (recent24 && recent24.c >= 3) return new Response(JSON.stringify({ error: '24小时内最多提交3条' }), { status: 429, headers: cors });

        const monthly = await db.prepare("SELECT COUNT(*) as c FROM wishes WHERE device_hash=? AND status IN ('active','archived') AND created_at >= datetime('now','start of month')").bind(device_hash).first();
        if (monthly && monthly.c >= MONTHLY_SUBMIT_LIMIT) return new Response(JSON.stringify({ error: `本月已提交${MONTHLY_SUBMIT_LIMIT}条，下个月再来吧` }), { status: 429, headers: cors });

        const encName = real_name ? await serverEncrypt(real_name, env) : '';
        const encPhone = phone ? await serverEncrypt(phone, env) : '';

        await db.prepare('INSERT INTO wishes (content, display_name, real_name_enc, phone_enc, device_hash, class_code) VALUES (?,?,?,?,?,?)').bind(content, display_name, encName, encPhone, device_hash, class_code).run();

        // Also ensure student is bound (with correct device_hash)
        try { await db.prepare("INSERT OR IGNORE INTO class_students (class_code, device_hash, student_name, joined_at, status) VALUES (?,?,?,datetime('now'),'active')").bind(class_code, device_hash, real_name || display_name || '').run(); } catch {}

        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      if (path === '/api/vote' && request.method === 'POST') {
        const body = await request.json();
        const { wish_id, device_hash, class_code } = body;

        if (!wish_id || !device_hash) return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: cors });
        if (!class_code) return new Response(JSON.stringify({ error: '请先在设置中绑定班级码' }), { status: 400, headers: cors });

        // Validate class and student status
        const clsVote = await db.prepare("SELECT * FROM classes WHERE class_code=? AND status='active'").bind(class_code).first();
        if (!clsVote) return new Response(JSON.stringify({ error: '班级已关闭，请联系老师' }), { status: 400, headers: cors });

        const studentVote = await db.prepare("SELECT * FROM class_students WHERE class_code=? AND device_hash=? AND status='active'").bind(class_code, device_hash).first();
        if (!studentVote) return new Response(JSON.stringify({ error: '你已被移出班级，无法投票' }), { status: 403, headers: cors });

        // Verify wish belongs to same teacher scope
        const wishCls = await db.prepare("SELECT class_code FROM wishes WHERE id=? AND status='active'").bind(wish_id).first();
        if (!wishCls) return new Response(JSON.stringify({ error: '许愿不存在或已删除' }), { status: 404, headers: cors });
        const wishTeacher = await db.prepare("SELECT teacher_id FROM classes WHERE class_code=? AND status='active'").bind(wishCls.class_code).first();
        if (!wishTeacher || wishTeacher.teacher_id !== clsVote.teacher_id) return new Response(JSON.stringify({ error: '无法跨老师投票' }), { status: 403, headers: cors });

        // Atomic insert to prevent race-condition duplicate votes
        try {
          await db.prepare('INSERT INTO votes (wish_id, device_hash, class_code) VALUES (?,?,?)').bind(wish_id, device_hash, class_code).run();
          await db.prepare('UPDATE wishes SET votes=votes+1 WHERE id=?').bind(wish_id).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return new Response(JSON.stringify({ error: '你已经投过票了' }), { status: 400, headers: cors });
          throw e;
        }
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // ═══ ADMIN API ═══
      // GET /admin/wishes — supports both legacy admin token and teacher token
      if (path === '/admin/wishes' && request.method === 'GET') {
        let teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        if (!teacher && !isAdmin) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });

        let result;
        if (teacher) {
          // Teacher sees only their classes' wishes
          const classes = await db.prepare("SELECT class_code FROM classes WHERE teacher_id=? AND status='active'").bind(teacher.teacher_id).all();
          const codes = classes.results.map(r => r.class_code);
          if (codes.length > 0) {
            const ph = codes.map(() => '?').join(',');
            result = await db.prepare(`SELECT w.*, c.label as class_label FROM wishes w LEFT JOIN classes c ON w.class_code=c.class_code WHERE w.class_code IN (${ph}) ORDER BY w.created_at DESC LIMIT 200`).bind(...codes).all();
          } else {
            result = { results: [] };
          }
        } else {
          // Legacy admin sees all
          result = await db.prepare('SELECT w.*, c.label as class_label FROM wishes w LEFT JOIN classes c ON w.class_code=c.class_code ORDER BY w.created_at DESC LIMIT 200').all();
        }

        const wishes = await Promise.all(result.results.map(async (w) => ({ ...w, real_name: await serverDecrypt(w.real_name_enc || '', env), phone: await serverDecrypt(w.phone_enc || '', env) })));
        return new Response(JSON.stringify(wishes), { headers: cors });
      }

      if (path.startsWith('/admin/wishes/') && request.method === 'DELETE') {
        let teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        if (!teacher && !isAdmin) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });

        const id = parseInt(path.split('/').pop());
        if (!Number.isFinite(id) || id < 1) return new Response(JSON.stringify({ error: '无效的ID' }), { status: 400, headers: cors });

        // If teacher, verify wish belongs to their class
        if (teacher) {
          const wish = await db.prepare('SELECT w.class_code FROM wishes w JOIN classes c ON w.class_code=c.class_code WHERE w.id=? AND c.teacher_id=?').bind(id, teacher.teacher_id).first();
          if (!wish) return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });
        }

        await db.prepare('UPDATE wishes SET status=? WHERE id=?').bind('deleted', id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // ═══ TEACHER STUDENT LIST ═══
      if (path === '/api/teacher/students' && request.method === 'GET') {
        let teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        if (!teacher && !isAdmin) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const classCode = url.searchParams.get('class_code') || '';
        let students;
        if (classCode) {
          // Admin can see any class; teacher only sees own classes
          if (isAdmin) {
            students = await db.prepare("SELECT * FROM class_students WHERE class_code=? ORDER BY joined_at DESC").bind(classCode).all();
          } else {
            students = await db.prepare("SELECT cs.* FROM class_students cs JOIN classes c ON cs.class_code=c.class_code WHERE c.teacher_id=? AND cs.class_code=? ORDER BY cs.joined_at DESC").bind(teacher.teacher_id, classCode).all();
          }
        } else {
          if (isAdmin) {
            students = await db.prepare("SELECT * FROM class_students ORDER BY joined_at DESC LIMIT 200").all();
          } else {
            const classes = await db.prepare("SELECT class_code FROM classes WHERE teacher_id=? AND status='active'").bind(teacher.teacher_id).all();
            const codes = classes.results.map(r => r.class_code);
            if (codes.length > 0) {
              const ph = codes.map(() => '?').join(',');
              students = await db.prepare(`SELECT * FROM class_students WHERE class_code IN (${ph}) ORDER BY joined_at DESC`).bind(...codes).all();
            } else {
              students = { results: [] };
            }
          }
        }
        return new Response(JSON.stringify(students.results), { headers: cors });
      }

      if (path === '/api/teacher/students/remove' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const { class_code, device_hash } = await request.json();
        // Verify ownership
        const cls = await db.prepare("SELECT * FROM classes WHERE class_code=? AND teacher_id=?").bind(class_code, teacher.teacher_id).first();
        if (!cls) return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });

        await db.prepare("UPDATE class_students SET status='removed' WHERE class_code=? AND device_hash=?").bind(class_code, device_hash).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // ═══ SUPER ADMIN ENDPOINTS ═══
      // GET /admin/teachers — list all teachers with stats
      if (path === '/admin/teachers' && request.method === 'GET') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const teachers = await db.prepare('SELECT teacher_id, phone, name, created_at FROM teachers ORDER BY created_at DESC').all();
        const result = await Promise.all(teachers.results.map(async (t) => {
          const classes = await db.prepare("SELECT COUNT(*) as c FROM classes WHERE teacher_id=? AND status='active'").bind(t.teacher_id).first();
          const students = await db.prepare("SELECT COUNT(*) as c FROM class_students cs JOIN classes c ON cs.class_code=c.class_code WHERE c.teacher_id=? AND cs.status='active'").bind(t.teacher_id).first();
          return { ...t, class_count: classes?.c || 0, student_count: students?.c || 0 };
        }));
        return new Response(JSON.stringify(result), { headers: cors });
      }

      // GET /admin/classes?teacher_id=xxx — admin view of teacher's classes
      if (path === '/admin/classes' && request.method === 'GET') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const teacherId = url.searchParams.get('teacher_id') || '';
        if (!teacherId) return new Response(JSON.stringify({ error: '缺少teacher_id' }), { status: 400, headers: cors });
        const classes = await db.prepare("SELECT * FROM classes WHERE teacher_id=? AND status='active' ORDER BY created_at DESC").bind(teacherId).all();
        const result = await Promise.all(classes.results.map(async (c) => {
          const students = await db.prepare("SELECT COUNT(*) as c FROM class_students WHERE class_code=? AND status='active'").bind(c.class_code).first();
          return { ...c, student_count: students?.c || 0 };
        }));
        return new Response(JSON.stringify(result), { headers: cors });
      }

      // Admin: add teacher
      if (path === '/admin/teachers' && request.method === 'POST') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const { phone, password, name } = await request.json();
        if (!phone || !password || !name) return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: cors });
        if (!/^1[3-9]\d{9}$/.test(phone)) return new Response(JSON.stringify({ error: '手机号格式不正确' }), { status: 400, headers: cors });
        if (password.length < 6) return new Response(JSON.stringify({ error: '密码至少6位' }), { status: 400, headers: cors });
        if (!/^[a-zA-Z一-龥]{2,10}$/.test(name)) return new Response(JSON.stringify({ error: '花名需2-10个汉字或英文字母' }), { status: 400, headers: cors });
        const exists = await db.prepare('SELECT teacher_id FROM teachers WHERE phone=?').bind(phone).first();
        if (exists) return new Response(JSON.stringify({ error: '手机号已存在' }), { status: 409, headers: cors });
        const nameExists = await db.prepare('SELECT teacher_id FROM teachers WHERE name=?').bind(name).first();
        if (nameExists) return new Response(JSON.stringify({ error: '花名已被使用' }), { status: 409, headers: cors });
        const teacherId = 'T' + randomChars(8);
        const pwHash = await hashPassword(password);
        const token = randomChars(32);
        await db.prepare('INSERT INTO teachers (teacher_id, phone, password_hash, name, token, created_at) VALUES (?,?,?,?,?,datetime("now"))').bind(teacherId, phone, pwHash, name, token).run();
        return new Response(JSON.stringify({ success: true, teacher_id: teacherId, name }), { headers: cors });
      }

      // Admin: delete teacher
      if (path.startsWith('/admin/teachers/') && request.method === 'DELETE') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const teacherId = path.split('/')[3];
        await db.prepare("UPDATE classes SET status='deleted' WHERE teacher_id=?").bind(teacherId).run();
        await db.prepare('DELETE FROM teachers WHERE teacher_id=?').bind(teacherId).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // Admin: add class for any teacher
      if (path === '/admin/classes' && request.method === 'POST') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const { teacher_id, label } = await request.json();
        if (!teacher_id || !label) return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: cors });
        let code;
        for (let i = 0; i < 10; i++) { code = randomChars(12); const dup = await db.prepare('SELECT class_code FROM classes WHERE class_code=?').bind(code).first(); if (!dup) break; }
        const teacher = await db.prepare('SELECT name FROM teachers WHERE teacher_id=?').bind(teacher_id).first();
        await db.prepare('INSERT INTO classes (class_code, teacher_id, teacher_name, label, created_at) VALUES (?,?,?,?,datetime("now"))').bind(code, teacher_id, teacher?.name || '', label).run();
        return new Response(JSON.stringify({ success: true, class_code: code, label }), { headers: cors });
      }

      // Admin: delete class
      if (path.startsWith('/admin/classes/') && request.method === 'DELETE') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const code = path.split('/')[3];
        await db.prepare("UPDATE classes SET status='deleted' WHERE class_code=?").bind(code).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // Admin: remove student from class
      if (path === '/admin/students/remove' && request.method === 'POST') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const { class_code, device_hash } = await request.json();
        await db.prepare("UPDATE class_students SET status='removed' WHERE class_code=? AND device_hash=?").bind(class_code, device_hash).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // Admin: get wishes by teacher
      if (path === '/admin/wishes/by-teacher' && request.method === 'GET') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const teacherId = url.searchParams.get('teacher_id') || '';
        if (!teacherId) return new Response(JSON.stringify({ error: '缺少teacher_id' }), { status: 400, headers: cors });
        const classes = await db.prepare("SELECT class_code FROM classes WHERE teacher_id=? AND status='active'").bind(teacherId).all();
        const codes = classes.results.map(r => r.class_code);
        if (codes.length === 0) return new Response(JSON.stringify([]), { headers: cors });
        const ph = codes.map(() => '?').join(',');
        const result = await db.prepare(`SELECT w.*, c.label as class_label FROM wishes w LEFT JOIN classes c ON w.class_code=c.class_code WHERE w.class_code IN (${ph}) ORDER BY w.created_at DESC LIMIT 200`).bind(...codes).all();
        const wishes = await Promise.all(result.results.map(async (w) => ({ ...w, real_name: await serverDecrypt(w.real_name_enc || '', env), phone: await serverDecrypt(w.phone_enc || '', env) })));
        return new Response(JSON.stringify(wishes), { headers: cors });
      }

      // POST /api/classes/unbind — student requests unbind (pending teacher approval)
      if (path === '/api/classes/unbind' && request.method === 'POST') {
        const { class_code, device_hash } = await request.json();
        if (!class_code || !device_hash) return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: cors });
        await db.prepare("UPDATE class_students SET status='unbind_pending' WHERE class_code=? AND device_hash=?").bind(class_code, device_hash).run();
        return new Response(JSON.stringify({ success: true, status: 'unbind_pending' }), { headers: cors });
      }

      // POST /api/teacher/students/handle-unbind — teacher approves/denies unbind
      if (path === '/api/teacher/students/handle-unbind' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) {
          if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        }
        const { class_code, device_hash, approve } = await request.json();
        // Verify ownership (teacher only)
        if (teacher) {
          const cls = await db.prepare("SELECT * FROM classes WHERE class_code=? AND teacher_id=?").bind(class_code, teacher.teacher_id).first();
          if (!cls) return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });
        }
        const newStatus = approve ? 'unbound' : 'active';
        await db.prepare("UPDATE class_students SET status=? WHERE class_code=? AND device_hash=?").bind(newStatus, class_code, device_hash).run();
        return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: cors });
      }

      // ═══ FEEDBACK ═══
      // POST /api/feedback — submit (teacher or student)
      if (path === '/api/feedback' && request.method === 'POST') {
        const { type, title, description, submitter, class_code } = await request.json();
        if (!title || !description) return new Response(JSON.stringify({ error: '请填写标题和描述' }), { status: 400, headers: cors });
        if (hasBadContent(title) || hasBadContent(description)) return new Response(JSON.stringify({ error: '内容包含不当词汇，请重新输入' }), { status: 400, headers: cors });
        if (submitter === 'student') {
          await db.prepare('INSERT INTO feedback (type, title, description, teacher_id, teacher_name, submitter, created_at) VALUES (?,?,?,?,?,?,datetime("now"))').bind(type||'feature', title, description, class_code || '', '学生反馈', 'student').run();
        } else {
          const teacher = await checkTeacher(request, db);
          const teacherId = teacher ? teacher.teacher_id : '';
          const teacherName = teacher ? teacher.name : '匿名';
          await db.prepare('INSERT INTO feedback (type, title, description, teacher_id, teacher_name, submitter, created_at) VALUES (?,?,?,?,?,?,datetime("now"))').bind(type||'feature', title, description, teacherId, teacherName, 'teacher').run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      // GET /api/feedback — list (admin/teacher, with submitter filter)
      if (path === '/api/feedback' && request.method === 'GET') {
        const teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        const who = url.searchParams.get('submitter') || '';
        let result;
        if (isAdmin) {
          result = await db.prepare("SELECT * FROM feedback WHERE submitter='teacher' ORDER BY created_at DESC LIMIT 100").all();
        } else if (teacher) {
          if (who === 'student') {
            const classes = await db.prepare("SELECT class_code FROM classes WHERE teacher_id=? AND status='active'").bind(teacher.teacher_id).all();
            const codes = classes.results.map(r => r.class_code);
            if (codes.length > 0) {
              result = await db.prepare(`SELECT * FROM feedback WHERE submitter='student' AND teacher_id IN (${codes.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 100`).bind(...codes).all();
            } else { result = { results: [] }; }
          } else {
            result = await db.prepare("SELECT * FROM feedback WHERE teacher_id=? AND submitter='teacher' ORDER BY created_at DESC LIMIT 50").bind(teacher.teacher_id).all();
          }
        } else {
          return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });
        }
        return new Response(JSON.stringify(result.results), { headers: cors });
      }

      // PATCH /admin/feedback/:id — update feedback status (admin)
      if (path.startsWith('/admin/feedback/') && request.method === 'PATCH') {
        if (!checkAdmin(request, env)) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const id = parseInt(path.split('/').pop());
        if (!Number.isFinite(id) || id < 1) return new Response(JSON.stringify({ error: '无效的ID' }), { status: 400, headers: cors });
        const { status } = await request.json();
        await db.prepare('UPDATE feedback SET status=? WHERE id=?').bind(status||'processed', id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // DELETE /admin/feedback/:id — delete feedback (admin or teacher who owns it)
      if (path.startsWith('/admin/feedback/') && request.method === 'DELETE') {
        const teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        if (!teacher && !isAdmin) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const id = parseInt(path.split('/').pop());
        if (!Number.isFinite(id) || id < 1) return new Response(JSON.stringify({ error: '无效的ID' }), { status: 400, headers: cors });
        if (teacher) {
          const fb = await db.prepare('SELECT * FROM feedback WHERE id=?').bind(id).first();
          if (!fb) return new Response(JSON.stringify({ error: '反馈不存在' }), { status: 404, headers: cors });
          // Teacher can only delete student feedback from their classes
          if (fb.submitter === 'student') {
            const cls = await db.prepare("SELECT * FROM classes WHERE class_code=? AND teacher_id=?").bind(fb.teacher_id, teacher.teacher_id).first();
            if (!cls) return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });
          } else if (fb.teacher_id !== teacher.teacher_id) {
            return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });
          }
        }
        await db.prepare('DELETE FROM feedback WHERE id=?').bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // PATCH /admin/wishes/:id — mark wish as completed
      if (path.startsWith('/admin/wishes/complete/') && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        const isAdmin = checkAdmin(request, env);
        if (!teacher && !isAdmin) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: cors });
        const id = parseInt(path.split('/').pop());
        if (!Number.isFinite(id) || id < 1) return new Response(JSON.stringify({ error: '无效的ID' }), { status: 400, headers: cors });
        if (teacher) {
          const wish = await db.prepare('SELECT w.class_code FROM wishes w JOIN classes c ON w.class_code=c.class_code WHERE w.id=? AND c.teacher_id=?').bind(id, teacher.teacher_id).first();
          if (!wish) return new Response(JSON.stringify({ error: '无权操作' }), { status: 403, headers: cors });
        }
        await db.prepare("UPDATE wishes SET status='completed' WHERE id=?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // ═══ WORKSHOP ═══
      // GET /api/workshop/pets — list workshop pets (public, used by App)
      if (path === '/api/workshop/pets' && request.method === 'GET') {
        const result = await db.prepare("SELECT * FROM workshop_pets WHERE status='active' ORDER BY created_at DESC LIMIT 50").all();
        return new Response(JSON.stringify(result.results), { headers: cors });
      }

      // POST /api/workshop/pets — teacher submits a generated pet
      if (path === '/api/workshop/pets' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });
        const { name, element, style, description, tier, price, spritesheet_url, thumbnail_url } = await request.json();
        if (!name || !element || !tier) return new Response(JSON.stringify({ error: '缺少必填字段' }), { status: 400, headers: cors });
        const id = 'ws-' + randomChars(10);
        await db.prepare('INSERT INTO workshop_pets (id, teacher_id, teacher_name, name, element, style, description, tier, price, spritesheet_url, thumbnail_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime("now"))').bind(id, teacher.teacher_id, teacher.name, name, element, style||'', description||'', tier, price||200, spritesheet_url||'', thumbnail_url||'').run();
        return new Response(JSON.stringify({ success: true, id }), { headers: cors });
      }

      // DELETE /api/workshop/pets/:id — teacher deletes own pet
      if (path.startsWith('/api/workshop/pets/') && request.method === 'DELETE') {
        const teacher = await checkTeacher(request, db);
        if (!teacher) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });
        const id = path.split('/').pop();
        await db.prepare("UPDATE workshop_pets SET status='deleted' WHERE id=? AND teacher_id=?").bind(id, teacher.teacher_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      // POST /api/ai/generate — proxy AI image generation
      if (path === '/api/ai/generate' && request.method === 'POST') {
        const teacher = await checkTeacher(request, db);
        if (!teacher && !checkAdmin(request, env)) return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: cors });

        const { prompt, reference_image, provider: bodyProvider, api_key } = await request.json();
        if (!prompt) return new Response(JSON.stringify({ error: '缺少prompt' }), { status: 400, headers: cors });

        const provider = bodyProvider || env.AI_PROVIDER || 'zhipu';
        const apiKey = api_key || '';
        if (!apiKey) return new Response(JSON.stringify({ error: '未配置API Key，请在精灵工坊 ⚙️AI配置 中填写' }), { status: 400, headers: cors });
        let result;

        if (provider === 'zhipu') {
          const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'cogview-4', prompt, ...(reference_image ? { image: reference_image } : {}) }),
          });
          result = await resp.json();
        } else if (provider === 'qwen') {
          const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'wanx-v1',
              input: { prompt },
              parameters: { size: '1536*1872', n: 1 },
            }),
          });
          result = await resp.json();
        } else if (provider === 'hunyuan') {
          return new Response(JSON.stringify({ error: '腾讯混元接入开发中，请先用智谱或阿里' }), { status: 400, headers: cors });
        } else if (provider === 'coze') {
          return new Response(JSON.stringify({ error: '字节豆包接入开发中，请先用智谱或阿里' }), { status: 400, headers: cors });
        } else {
          return new Response(JSON.stringify({ error: `不支持的AI模型: ${provider}` }), { status: 400, headers: cors });
        }
        // Check for provider-level errors
        if (result && result.code) return new Response(JSON.stringify({ error: result.message || `API错误(${result.code})` }), { status: 400, headers: cors });
        if (result && result.error) return new Response(JSON.stringify({ error: typeof result.error === 'string' ? result.error : (result.error.message || 'API调用失败') }), { status: 400, headers: cors });

        return new Response(JSON.stringify({ provider, result }), { headers: cors });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: cors });
    } catch (e) {
      console.error('API Error:', e.message || String(e));
      return new Response(JSON.stringify({ error: '服务器错误，请稍后重试' }), { status: 500, headers: cors });
    }
  },
};
