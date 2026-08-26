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

post "v1.7.43 更新：Windows 备份稳定性与存档保护" "💾 重做数据备份：不再把可重新获取的精灵图片转成超大文本，Windows 选择保存位置后不易卡死
🛡️ 导出前会检查智子与金币存档是否完整，读取异常时直接提示，不再生成看似成功的空备份
🔒 应用启动时只有确认成功读取旧存档后才会自动同步，避免异常恢复期间用初始状态覆盖原数据
🔄 旧版备份仍可正常导入；新电脑缺少的普通素材由安装包提供，工坊素材会自动恢复
⚠️ v1.7.42 如曾导出后卡死，请先完全退出并重启，不要卸载或清理应用数据" 1

echo "v1.7.43 公告发布完成"
