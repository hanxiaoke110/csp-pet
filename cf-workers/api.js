// CSP 许愿墙 API — Cloudflare Workers + D1
// 部署在 api.cspstudy.top

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Wish-Token',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      // GET /api/wishes — 获取许愿列表（公开）
      if (path === '/api/wishes' && request.method === 'GET') {
        const sort = url.searchParams.get('sort') || 'hot';
        const order = sort === 'new' ? 'created_at DESC' : 'votes DESC, created_at DESC';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

        const result = await db.prepare(
          `SELECT id, content, display_name, votes, created_at FROM wishes WHERE status='active' ORDER BY ${order} LIMIT ?`
        ).bind(limit).all();

        return new Response(JSON.stringify(result.results), { headers: cors });
      }

      // POST /api/wishes — 提交许愿
      if (path === '/api/wishes' && request.method === 'POST') {
        const body = await request.json();
        const { content, display_name, real_name_enc, device_hash } = body;

        // 校验
        if (!content || content.length < 2 || content.length > 60) {
          return new Response(JSON.stringify({ error: '内容需2-60字' }), { status: 400, headers: cors });
        }
        if (!display_name || display_name.length < 1 || display_name.length > 20) {
          return new Response(JSON.stringify({ error: '昵称需1-20字' }), { status: 400, headers: cors });
        }

        // 频率限制：同一设备24h最多3条
        const recent = await db.prepare(
          "SELECT COUNT(*) as c FROM wishes WHERE device_hash=? AND created_at > datetime('now','-1 day')"
        ).bind(device_hash).first();
        if (recent && recent.c >= 3) {
          return new Response(JSON.stringify({ error: '24小时内最多提交3条' }), { status: 429, headers: cors });
        }

        const result = await db.prepare(
          'INSERT INTO wishes (content, display_name, real_name_enc, device_hash) VALUES (?,?,?,?)'
        ).bind(content, display_name, real_name_enc || '', device_hash).run();

        return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), { headers: cors });
      }

      // POST /api/vote — 投票
      if (path === '/api/vote' && request.method === 'POST') {
        const body = await request.json();
        const { wish_id, device_hash } = body;

        if (!wish_id || !device_hash) {
          return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: cors });
        }

        // 检查是否已投过
        const existing = await db.prepare(
          'SELECT id FROM votes WHERE wish_id=? AND device_hash=?'
        ).bind(wish_id, device_hash).first();

        if (existing) {
          return new Response(JSON.stringify({ error: '你已经投过票了' }), { status: 400, headers: cors });
        }

        // 投票
        await db.prepare('INSERT INTO votes (wish_id, device_hash) VALUES (?,?)').bind(wish_id, device_hash).run();
        await db.prepare('UPDATE wishes SET votes=votes+1 WHERE id=?').bind(wish_id).run();

        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Server error', detail: String(e) }), { status: 500, headers: cors });
    }
  },
};
