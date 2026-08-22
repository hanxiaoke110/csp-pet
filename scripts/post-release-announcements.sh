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

post "v1.7.41 更新：题库、智子与试炼场优化" "📚 预置最新可靠题库，修复选择题混入程序大题、月度复盘子题无法作答等问题
🪙 智子页新增每周修行津贴：按账号最高等级计算，每周手动领取一次，多只智子不会重复发放
🎰 抽卡页显示真实保底进度，Lv.15 与 Lv.20 的 50/30 抽权益清晰可见
🩹 修复灵力净化重复出题和完成后返回位置不清晰的问题
🏆 排行榜增加在线规则说明，并完善班级榜成员匹配
🖥️ Windows 升级后主动刷新桌面快捷方式和任务栏 Logo
🛡️ 本次更新不会重置智子、金币、课程进度或试炼场赛季数据" 1

echo "v1.7.41 公告发布完成"
