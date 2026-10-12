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

post "v1.7.50 更新：星光换装，专注出发！" "📚 课堂资料回到学习资料：按阶段折叠、搜索、复制链接；后续资料在线更新。P70–P77 制作中，后续课次陆续补充
⏳ 新增专注学习：设个目标，开始计时！可暂停、复盘、查看本周记录；自愿使用、没有奖励、不监控其他应用，记录仅在本机并可随备份恢复
✨ 典藏卡光影与景深升级，保留鼠标跟随和自动赏卡；星相衣橱新增 20 件在线装扮
⚔️ 新增多属性装备与专属图标，可购买、强化、卸下后分解，返还实际投入金币的 80%；强化材料通过探索获取，不返还
💰 试炼评分金币不再受周上限限制，仍需真实通关，重复结算不会重复领奖
🗺️ 修复未完成封印进入迷宫出口卡住的问题，可返回继续探索
🌠 自己的愿望可删除；同一愿望投票满 14 天后可以再投，不退还已用许愿券
🐾 加强智子拖动、旧钱包载入和备份恢复保护；关闭集训码增益入口，不扣回之前已获得的资源" 1

echo "v1.7.50 公告发布完成"
