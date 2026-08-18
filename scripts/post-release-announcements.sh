#!/usr/bin/env bash
# 发布近期版本更新公告（全服公告，学生在 App「公告」页可见）
# 用法：CSP_ADMIN_TOKEN=<管理员令牌> bash scripts/post-release-announcements.sh
set -euo pipefail

API="https://api.cspstudy.top/admin/announcements"
: "${CSP_ADMIN_TOKEN:?请先设置 CSP_ADMIN_TOKEN 环境变量}"

post() {
  local title="$1" content="$2" pinned="$3"
  local response
  response=$(curl -fsS -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Token: $CSP_ADMIN_TOKEN" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1], "content": sys.argv[2], "pinned": sys.argv[3] == "1"}))' "$title" "$content" "$pinned")")
  printf '%s' "$response" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("success") is True, data'
}

post "v1.7.38 更新：题库加载修复" "📡 修复题库偶尔加载不出来、一直转圈的问题：现在会显示明确提示，联网后点「重试」即可自动修复
🛠️ 修复部分已知问题，优化使用体验
🛡️ 本次更新不会重置任何数据，智子、金币、课程进度全部保留" 1

echo "v1.7.38 公告发布完成"
