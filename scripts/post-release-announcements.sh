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

post "v1.7.27 更新：阅读题显示修复" "🐛 修复阅读题没有选项、代码显示不全的问题
🔄 题库缓存加强校验，旧缓存会自动更新修复
🎁 新增补偿码兑换（教师发放的补偿码，每码每设备限兑一次）
⭐ 优秀码改为服务器校验，仅当天有效
🕒 统一按北京时间计算日期" 1

echo "v1.7.27 公告发布完成"
