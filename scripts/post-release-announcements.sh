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

post "v1.7.36 更新：弹窗与设置页修复" "🏫 修复绑定班级弹窗被遮挡、无法填写完整信息的问题
🪟 修复开启窗口皮肤后，购买、许愿、孵化等弹窗可能被裁切的问题
🎨 设置页全新样式：卡片分区更清晰，输入框与按钮风格统一
🛡️ 本次更新不会重置任何数据，智子、金币、课程进度全部保留" 1

echo "v1.7.36 公告发布完成"
