# Cloudflare 完整配置指南

> 最后更新：2026-06-03

---

## 一、账户信息

| 项目 | 值 |
|------|------|
| 邮箱 | Hanyanwei8062@dingtalk.com |
| 账户 ID | `908f0def3e8015ca7a20de49a99cf334` |
| 区域 ID | `9babb3d83455c4e3f92f206de64f544b` |
| API Token 名 | `csp-deploy-v2` |
| API Token | `***`（见本地 .env 或 Cloudflare Dashboard） |

### Token 权限

| 权限 | 级别 | 用途 |
|------|------|------|
| Workers Scripts:Edit | Account | 部署 Worker |
| D1:Edit | Account | 数据库操作 |
| Cloudflare Pages:Edit | Account | 部署 Web 后台 |
| DNS:Edit | Zone | 添加 DNS 记录 |
| DNS:Read | Zone | 读取 DNS 记录 |

---

## 二、域名

| 域名 | 用途 | 类型 |
|------|------|------|
| `cspstudy.top` | 根域名 | 腾讯云注册，DNS 托管 Cloudflare |
| `api.cspstudy.top` | API 网关 | Worker 自定义域 |
| `teacher.cspstudy.top` | 教师后台 | Pages 自定义域 |

### 域名注册信息

| 项目 | 值 |
|------|------|
| 注册商 | 腾讯云 |
| 价格 | 14 元/首年，32 元/年续费 |
| Nameserver | `amanda.ns.cloudflare.com`, `keenan.ns.cloudflare.com` |

---

## 三、数据库 D1

| 项目 | 值 |
|------|------|
| D1 名称 | `csp-db` |
| D1 ID | `5477cbee-76aa-4e7f-854e-39860f9644d7` |

### 数据表

| 表 | 用途 |
|------|------|
| `wishes` | 许愿内容（id, content, display_name, real_name_enc, phone_enc, votes, class_code, status, created_at） |
| `votes` | 投票记录（id, wish_id, device_hash, class_code）+ UNIQUE INDEX(wish_id, device_hash) |
| `teachers` | 教师账号（teacher_id, phone, password_hash, name, token） |
| `classes` | 班级（class_code, teacher_id, teacher_name, label, status, created_at） |
| `class_students` | 学生绑定（class_code, device_hash, student_name, status, joined_at） |
| `meta` | 系统元数据（key-value: last_cleanup） |
| `generated_codes` | 兑换码记录（code, type, teacher_id, level, created_at） |
| `feedback` | 反馈收集（id, type, title, description, teacher_id, teacher_name, submitter, status, created_at） |

---

## 四、Worker

| 项目 | 值 |
|------|------|
| Worker 名称 | `api` |
| 源文件 | `cf-workers/api.js` |
| Worker URL | `api.hanyanwei8062.workers.dev` |
| 自定义域 | `api.cspstudy.top` |

### Worker 密钥

| 密钥 | 值 | 用途 |
|------|------|------|
| SERVER_SECRET | `***` | AES 加密隐私数据 |
| ADMIN_TOKEN | `csp-teacher-2026` | 管理员登录密码 |

### 部署命令

```bash
cd csp-desktop-pet
CLOUDFLARE_API_TOKEN="***" npx wrangler deploy
```

---

## 五、Pages（教师后台）

| 项目 | 值 |
|------|------|
| Pages 项目名 | `teacher-csp` |
| 源文件 | `teacher-app/index.html` |
| 默认域名 | `teacher-csp.pages.dev` |
| 自定义域 | `teacher.cspstudy.top` |

### 部署命令

```bash
cd csp-desktop-pet
CLOUDFLARE_API_TOKEN="***" npx wrangler pages deploy teacher-app --project-name=teacher-csp --branch=main
```

### 添加自定义域名（Dashboard 操作）

`.top` TLD 不能用 API，需手动操作：

1. 打开 https://dash.cloudflare.com/908f0def3e8015ca7a20de49a99cf334/pages/view/teacher-csp
2. 点「自定义域」→「设置自定义域」
3. 输入 `teacher.cspstudy.top` → 保存
4. 确认 DNS 记录更新 → SSL 证书 1-2 分钟自动签发

---

## 六、管理凭证

| 角色 | 登录方式 | 密码 |
|------|------|------|
| 管理员 | teacher.cspstudy.top → 🔑 管理员 | `csp-teacher-2026` |
| 教师 | teacher.cspstudy.top → 教师登录 | 手机号+密码 |

---

## 七、Token 权限修改指南

如果后续需要加权限：

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 找到 `csp-deploy-v2` → 点「编辑」
3. 点「Add more」添加需要的权限
4. 注意：DNS 权限选 **Zone** 级别（不是 Account），资源选 **All zones**
5. 保存后会生成新 token，更新本文件中的 API Token 值
