#!/usr/bin/env bash
# 发布近期版本更新公告（全服公告，学生在 App「公告」页可见）
# 用法：CSP_ADMIN_TOKEN=<管理员令牌> bash scripts/post-release-announcements.sh
set -euo pipefail

API="https://api.cspstudy.top/api/admin/announcements"
: "${CSP_ADMIN_TOKEN:?请先设置 CSP_ADMIN_TOKEN 环境变量}"

post() {
  local title="$1" content="$2" pinned="$3"
  curl -sS -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Token: $CSP_ADMIN_TOKEN" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1], "content": sys.argv[2], "pinned": sys.argv[3] == "1"}))' "$title" "$content" "$pinned")"
  echo
}

post "v1.7.24 更新：智子工坊更好用了" "🏭 工坊按最新上传排序，老师刚上传的智子可以更快看到
📚 工坊支持加载更多，不再只能看到第一批智子
▦ 卡片调整为四列展示，可以同时浏览更多智子
🛡️ 购买智子前增加确认步骤，减少误触扣除金币
🪙 金币改为清晰的金色样式，余额和价格更容易看清" 1

echo "v1.7.24 公告发布完成"
