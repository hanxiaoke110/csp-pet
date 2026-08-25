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

post "v1.7.42 更新：试炼场成就图鉴与同步修复" "🏅 成就图鉴现已展示全部 23 枚徽章，包含获取条件、当前进度、稀有度和完成状态
📅 修复连续登录成就没有累计的问题；升级后会自动补发已经达成但未记录的历史徽章
☁️ 徽章同时保存在本地与云端，登录时会合并，不会覆盖孩子原有的成就记录
⚙️ 优化试炼场进度同步，重复挑战且成绩未提升时不再产生无效写入，多人使用更稳定
🛡️ 本次更新不会重置智子、金币、课程进度或试炼场赛季数据" 1

echo "v1.7.42 公告发布完成"
