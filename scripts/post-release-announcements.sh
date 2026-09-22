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

post "v1.7.49 更新：我的星途，慢慢走也会发光" "🌠 “我的”新增星途：11 项永久累计任务，不用每天打卡；以前完成的做题、迷宫和试炼进度也会算进来
🎁 领取一次性焕新礼：200 金币、100 经验与 2 份普通食物；达成星途任务还能领取更多奖励
🐾 修复旧用户升级后短暂显示“请先领养”或进入选择题报错的问题；真正的新用户仍先领养智子
💾 星途领取记录保存在本机并进入备份；资料恢复完成前不会提前结算奖励
☁️ 星途任务目录可静态在线更新，离线时仍能使用内置任务" 1

echo "v1.7.49 公告发布完成"
