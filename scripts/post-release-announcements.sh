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

post "v1.7.48 更新：学习区轻装升级" "🧭 学习区精简为选择题、CSP 真题、OJ 训练和学习资料，查找内容更直接
📜 已经完成的旧课程成就会作为“绝版荣誉”永久保留，原奖励仍可领取
✨ 博学桂冠、灵感铅笔、万卷星河和翠芯遗迹启用新的挑战条件；老玩家已经获得的内容不会被收回
🧹 移除课程与 AI 教练的页面、配置和大体积缓存，启动更轻、更稳定
💾 金币、智子、装备、典藏卡、星相衣橱、迷宫进度和本地备份全部兼容旧版本" 1

echo "v1.7.48 公告发布完成"
