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

post "v1.7.29 更新：成就修复与指南更新" "🏆 修复每周任务 5/5 全对却不解锁成就的问题
📈 超级挑战成就改为按正确率判定（≥60% / ≥80% / 全对）
🎓 阶段成就改为按课程阶段判定，C4 敬请期待
📖 更新饲养指南：心情/好感度、商城道具、神秘代码、多智子说明（记得先确认电脑硬件够硬核哦）
🐛 修复「三连完美」成就描述，累计 3 次周常完美即可达成" 1

echo "v1.7.29 公告发布完成"
