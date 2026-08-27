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

post "v1.7.44 更新：自动备份与新电脑迁移" "💾 每天首次启动后自动备份智子、金币和学习进度，仅保留最近 3 份，不占用过多空间
🛡️ Windows 不再使用可能被置顶窗口遮住的阻塞式保存框；备份失败不会让应用未响应，也不会阻止版本更新
📥 设置页支持“从文件恢复”，换新电脑时把备份文件带到新电脑即可迁移
🔒 恢复前会检查备份完整性并再次保存当前存档；智子与金币至少成功写入一套存储后才会提示成功
📂 需要迁移时，可在设置页打开备份目录，将最新的 CSP-*.json 文件复制到 U 盘或发送到新电脑" 1

echo "v1.7.44 公告发布完成"
