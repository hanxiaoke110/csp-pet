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

post "v1.7.33 更新：试炼场题库稳定性修复" "⚔️ 修复智子试炼场偶发「题库准备中」导致技能无法继续的问题
🧹 缺题干、空选项、答案越界和缺少必要代码的题目会自动淘汰
🛡️ 增加离线应急题，网络或题库缓存异常时也可继续战斗
✅ 修复判断题出现空白 C、D 选项的问题，现在只显示「正确 / 错误」" 1

echo "v1.7.33 公告发布完成"
