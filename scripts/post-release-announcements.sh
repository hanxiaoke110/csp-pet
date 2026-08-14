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

post "v1.7.35 更新：Boss 与排行榜修正" "🐢 八个山海 Boss 重新取景，入口现在可以清楚看到异兽主体
📜 Boss 名称、台词和描述已统一为山海编程设定
🏆 排行榜同分玩家并列显示，排序稳定，不再刷新后乱跳
⚡ 重复挑战仍不重复发金币，但会同步更高的段位积分、等级与连击
🛡️ 本次更新不会重置赛季进度，智子、金币、皮肤和已购物品全部保留" 1

echo "v1.7.35 公告发布完成"
