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

post "v1.7.46 更新：40 张迷宫与试炼装备" "🗺️ 8 个副本、40 个普通关卡全部新增首通迷宫，每关独立保存位置、迷雾、题目、事件与结算进度
⚔️ 新增武器、护甲、法器三类试炼装备；效果已接入战斗和探索，掉落与品级固定，无抽卡、无隐藏概率
📖 新增装备图鉴、换装对比、触发次数、失效与重置说明，手机和平板也可点击查看完整规则
🎯 GESP 练习扩展到 1—8 级，新增 688 道高阶选择题；普通任务默认保持 1—4 级，避免难度突然跳升
🐉 完善五行克制与属性特性、八大 Boss 战斗形象、第二赛季一次免费属性调整，并支持食物批量购买" 1

echo "v1.7.46 公告发布完成"
