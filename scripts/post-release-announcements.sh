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

post "v1.7.45 更新：专项刷题与成就优化" "🎯 选择题页新增“专项刷题”，可按计算机常识、进制编码、分支循环、数据结构、动态规划、排列组合等 13 个专题练习
📚 每个专题可选 5、10 或 20 题，共收录 998 道已核验选择题；程序阅读和程序填空不会混入专项练习
🎁 专项练习答对获得 3 EXP 和 3 基础金币，与自由练习共享每日 30 道奖励上限；答错会自动进入月度复盘
🏆 金币达到 10000 可解锁“富可敌国”成就，并修复“小有积蓄”等成就反复显示达成的问题
💾 手动备份前会先同步最新做题进度，减少备份文件中进度滞后的情况" 1

echo "v1.7.45 公告发布完成"
