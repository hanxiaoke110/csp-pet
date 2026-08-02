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

post "v1.7.26 更新：多智子更稳定" "🐾 修复多智子窗口闪烁，点击智子更稳定
⬆️ 智子窗口会保持在最上层，不会被主窗口挡住
🖥️ 修复 Windows 弹窗权限提示，删除确认正常弹出
💬 气泡改为固定窗口展示，不再反复跳动
⚡ 优化多窗口数据同步与漫游流畅度" 1

echo "v1.7.26 公告发布完成"
