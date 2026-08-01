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

post "v1.7.25 更新：多智子更稳定" "🛡️ 已购买的第二、第三桌宠位置会在升级后继续保留，不会重复扣除金币
⚡ 优化 Windows 同时开启多个桌宠时的数据同步与后台调度，减少卡顿
🖼️ 工坊智子出现红点、空白或动画缺失时，会自动恢复原来的缩略图和动画素材
☁️ 稀有和传说智子本地素材缺失时会从 Gitee 自动补回，不影响等级、属性和培养数据
💰 素材恢复不会扣金币，也不会重复新增智子" 1

echo "v1.7.25 公告发布完成"
