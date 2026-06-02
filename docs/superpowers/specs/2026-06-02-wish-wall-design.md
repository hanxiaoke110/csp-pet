# CSP 许愿墙 — 最终方案

> 状态：✅ 后端已完成，App 前端待开发

## 一、概述

学生在 App 内提交新精灵许愿、投票支持他人许愿。后端使用 Cloudflare Workers + D1（免费）。老师通过管理页查看和删除。三重内容审核保障安全。

## 二、权限体系

| 操作 | 门槛 | 频率限制 |
|------|------|------|
| 浏览 | 无 | — |
| 投票 | 商城购买许愿票 | 每周限购 3 张 |
| 提交 | Lv.10+ 宠物 | 24h 最多 3 条 |

### 许愿票

| 商品 | 价格 | 限购 |
|------|------|------|
| 🎫 许愿票 ×1 | 100g | 每周 3 张 |
| 🎫 许愿票 ×3 | 250g | 每周 3 张 |

## 三、内容审核（三层防线）

### 第一层：客户端预检（App 端）
提交前本地检查敏感词，命中则提示「内容不符合规范，请重新输入」

### 第二层：服务端强检（Worker）
POST 请求进入 Worker → 关键词黑名单（色情/暴力/政治/侮辱/毒品/诈骗）→ 命中返回 400

### 第三层：老师人工清理
管理页可删除违规内容（后续 P2 做）

## 四、隐私设计

| 数据 | 存储位置 | 谁可见 |
|------|------|------|
| 许愿内容 | D1 | 所有人 |
| 票数 | D1 | 所有人 |
| 昵称 | D1 | 所有人 |
| 真实姓名 | D1（AES 加密） | 仅老师（管理页解密） |
| 设备 hash | D1 | 仅服务端 |
| 投票记录 | D1 | 仅服务端 |

## 五、技术架构

```
App（智子 → 💡许愿 Tab）
  ├── GET  /api/wishes?sort=hot&limit=50
  ├── POST /api/wishes  {content, display_name, real_name_enc, device_hash}
  └── POST /api/vote    {wish_id, device_hash}
         ↓ HTTPS
api.cspstudy.top → Cloudflare Workers
         ↓
      CF D1 (csp-db)
```

## 六、数据表

| 表 | 字段 | 用途 |
|------|------|------|
| `wishes` | id, content, display_name, real_name_enc, device_hash, votes, status, created_at | 许愿内容 |
| `votes` | id, wish_id, device_hash, created_at（UNIQUE） | 投票记录 |
| `classes` | class_code, teacher_name, created_at | P3 预留 |
| `students` | device_hash, class_code, nickname, real_name_enc, joined_at | P3 预留 |

## 七、App 端开发任务

| 文件 | 内容 | 工时 |
|------|------|------|
| `src/components/pet/WishWall.tsx` | 许愿墙 Tab 组件 | 2h |
| `src/utils/crypto.ts` | AES 加密工具 | 0.5h |
| `PetPanel.tsx` | 加 Tab 按钮 + 路由 | 0.5h |
| 商城 | 加许愿票商品 | 0.5h |
| 测试 | | 0.5h |
| **总计** | | **~4h** |

## 八、后端已完成

| 项目 | 详情 |
|------|------|
| 域名 | `api.cspstudy.top` |
| API | GET/POST/VOTE 全部通过 |
| 数据库 | D1 四表已建 |
| 审核 | 敏感词黑名单已部署 |
| 费用 | 0 元/月 |
