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

post "v1.7.19 更新：多智子桌面伙伴" "🪙 试炼场与桌宠共用金币，补给购买增加到账和退款保护
👥 支持最多三只智子使用独立桌面窗口，可分别拖动位置
🐣 修复抽卡、商城与工坊智子的孵化和重启恢复流程
🛡️ 旧版本智子、属性、战力、资源和桌面位置自动安全迁移
📣 新增班级教师公告与全服公告入口" 0

# 列表按发布时间倒序展示，所以先发的应该是更旧的版本
sleep 3

post "v1.7.20 更新：桌面伙伴更稳定" "🌈 属性重铸增加二次确认，修改前明确显示目标属性和金币费用
👥 修复第二、第三只智子点击后桌面窗口可能无法启动的问题
⏳ 桌面伙伴启动时增加状态反馈，失败会自动回滚位置" 0

sleep 3

post "v1.7.21 更新：数据备份来了，换电脑不丢数据" "💾 新增数据备份：设置页一键导出/导入，换电脑再也不怕丢数据
🎰 灵犀抽卡新增翻牌动画，稀有度一目了然
🛒 经验胶囊、进阶核心、自动喂食器购买前增加确认弹窗
🗑 回收站、解锁桌面伙伴位置增加确认弹窗，不再误触
🤖 修复自动喂食器在饱食已低于 40 时不触发的问题
👥 修复第二、第三桌面伙伴窗口不显示的问题
🖼 修复早期购买的工坊智子卡片显示红圈的问题" 1

echo "全部公告发布完成"
