#!/bin/bash
# 部署 api worker（api.cspstudy.top）。
# 优先走 wrangler（OAuth 登录态有效时）；失效则回退到 Cloudflare API 直接上传。
# 注意：本机 wrangler 4.103 只认旧变量名 CLOUDFLARE_API_TOKEN（不认 CF_API_TOKEN）。
# Token 读取顺序：环境变量 CLOUDFLARE_API_TOKEN / CF_API_TOKEN > 项目根 .cf-api-token（gitignored，权限 600）。
set -e
cd "$(dirname "$0")"

# 强制指定本目录的 wrangler.toml（api worker）：wrangler 会向上找到父目录的
# wrangler.jsonc（csp 静态资源 worker），不指定会部署错对象。
WRANGLER="npx wrangler deploy -c wrangler.toml"

if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CF_API_TOKEN" ]; then
  CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
fi
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f .cf-api-token ]; then
  CLOUDFLARE_API_TOKEN=$(cat .cf-api-token)
fi
export CLOUDFLARE_API_TOKEN

if [ -n "$CLOUDFLARE_API_TOKEN" ] && $WRANGLER; then
  exit 0
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ] && $WRANGLER; then
  # 无 token 但 wrangler OAuth 登录态有效
  exit 0
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "wrangler 失败且没有 CLOUDFLARE_API_TOKEN/.cf-api-token，无法回退部署" >&2
  exit 1
fi

echo "wrangler 通道失败，回退到直接 API 部署…"
export CF_API_TOKEN="$CLOUDFLARE_API_TOKEN"
./deploy-api-direct.sh
