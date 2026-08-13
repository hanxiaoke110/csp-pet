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

post "v1.7.34 更新：智子试炼场「山海新章」" "🏔️ 智子试炼场第二赛季正式开启，八个副本按知识点重新编排
🏆 新赛季关卡进度与排行榜重新起跑；智子、金币、皮肤和已购物品全部保留
🧭 前期副本聚焦核心知识点，后期加入跨知识点综合真题
🎨 地图、战斗界面与客户端视觉升级，并新增「山海新章」窗口皮肤
📚 题目继续使用已校验题库，残缺题和争议题不会进入学生答题渠道" 1

echo "v1.7.34 公告发布完成"
