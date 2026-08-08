#!/bin/bash
# 备用部署：wrangler 凭证问题时的直接 API 部署（api worker）
# 用法: CF_API_TOKEN=xxx ./deploy-api-direct.sh
set -e
cd "$(dirname "$0")"

ACCOUNT_ID="908f0def3e8015ca7a20de49a99cf334"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/api"

cat > /tmp/csp-worker-meta.json <<'JSON'
{
  "main_module": "api.js",
  "compatibility_date": "2024-12-01",
  "bindings": [
    { "name": "DB", "type": "d1", "id": "5477cbee-76aa-4e7f-854e-39860f9644d7" },
    { "name": "SPRITES", "type": "kv_namespace", "namespace_id": "4fd505c38b4d4ce89833b660afb37703" }
  ]
}
JSON

echo "== 上传 worker 脚本 =="
curl -s -X PUT "$API" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F 'metadata=@/tmp/csp-worker-meta.json;type=application/json' \
  -F 'api.js=@cf-workers/api.js;type=application/javascript+module' | python3 -c "import json,sys; d=json.load(sys.stdin); print('success:', d.get('success'), d.get('errors') or '')"

echo "== 确认 cron 触发器 =="
curl -s -X PUT "$API/schedules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cron":["*/5 * * * *"]}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('success:', d.get('success'), d.get('errors') or '')"
