# Cloudflare 配置

> 最后更新：2026-06-02

## 账户信息

| 项目 | 值 |
|------|------|
| 邮箱 | Hanyanwei8062@dingtalk.com |
| 账户 ID | `908f0def3e8015ca7a20de49a99cf334` |
| 区域 ID | `9babb3d83455c4e3f92f206de64f544b` |
| API Token | `cfut_9Z2eXQ70rHHOmEiRV1lPl8E8q6C92Yn5mg3aEuPQ961e2771` |
| 权限 | Workers Scripts:Edit / D1:Edit / DNS:Edit |

## 域名

| 域 | 用途 | 阶段 |
|------|------|------|
| `cspstudy.top` | 根域名 | — |
| `api.cspstudy.top` | API 网关 | P1 |
| `wish.cspstudy.top` | 许愿墙 | P1 |
| `workshop.cspstudy.top` | 精灵工坊 | P2 |
| `teacher.cspstudy.top` | 老师后台 | P3 |
| `rank.cspstudy.top` | 排行榜 | P4 |
| `parent.cspstudy.top` | 家长端 | P6 |

## 数据库

| 项目 | 值 |
|------|------|
| D1 名称 | `csp-db` |
| D1 ID | `5477cbee-76aa-4e7f-854e-39860f9644d7` |

### 数据表

| 表 | 用途 | 阶段 |
|------|------|------|
| `wishes` | 许愿内容 | P1 |
| `votes` | 投票记录 | P1 |
| `classes` | 班级 | P3 |
| `students` | 学生 | P3 |

## Worker

| 项目 | 值 |
|------|------|
| Worker 名称 | `api` |
| Worker URL | `api.hanyanwei8062.workers.dev` |
| 自定义域 | `api.cspstudy.top` |

## 域名注册

| 项目 | 值 |
|------|------|
| 注册商 | 腾讯云 |
| 域名 | `cspstudy.top` |
| 价格 | 14元/首年，32元/年续费 |
| Nameserver | `amanda.ns.cloudflare.com`, `keenan.ns.cloudflare.com` |
