# 精灵工坊 — 设计方案

> 状态：方案已确认，待开发

## 一、概述

精灵工坊是一个 Web 工具，让老师用 AI 批量生成精灵 spritesheet。部署在 `workshop.cspstudy.top`。

核心：**图生图**——基准图锁定形象 → 逐行生成 7 个动画状态 → 拼 spritesheet → 导出。

参考 [hatch-pet skill](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md) 和 [Petdex](https://github.com/crafter-station/petdex) 的设计。

---

## 二、Tech Stack

| 层 | 技术 |
|------|------|
| 前端 | Cloudflare Pages，独立部署 |
| 后端 API | Cloudflare Workers（复用 `api.cspstudy.top`） |
| 数据库 | D1（`workshop_pets` 表） |
| 图片存储 | Cloudflare R2 |
| 图片处理 | Sharp（JS 图片库，Worker 内运行） |
| AI 生图 | 多厂商可切换（见第五节） |

---

## 三、界面

`workshop.cspstudy.top`，登录后两个 Tab：

### Tab 1: 🎨 创建精灵

```
名字：[___________]           必填，如：火灵狐
元素：[🟫地 🔴火 🟢风 🔵水 🌟光]  必填，单选
样式：[像素 黏土 3D玩具 矢量 水彩]  必填，下拉
参考图：[📤 上传图片]           可选，jpg/png，≤1MB
描述：[_________________]      必填，中文描述
     如：火红色狐狸，尾巴火焰，
     圆脸大眼，可爱风格

[🚀 开始生成]
```

点击后显示进度条，逐个展示每行动画帧的生成状态。

### Tab 2: 📚 我的精灵

已生成精灵的列表，每项显示预览图 + 名字 + 元素 + 创建时间。可下载 spritesheet，可发布到商城。

---

## 四、生成流程（参考 hatch-pet 完整保留）

### 4.1 生成基准图

```
输入：名字 + 元素 + 样式 + 描述 + (可选)参考图
  ↓
AI 生成一张 192×208 基准图
  ↓
老师确认或重试
```

基准图锁定精灵形象（脸、身材、配色、材质），后续所有帧以此为准。

### 4.2 生成动画行（逐行图生图）

每行 = 6 帧 × 192×208，AI 一次生成一行 6 帧的条带。

| 行 | 动画 | AI 提示重点 |
|------|------|------|
| 0 | idle | 静止，微呼吸 |
| 1 | walk | 走路姿态 |
| 2 | sleep | 闭眼，放松 |
| 3 | celebrate | 跳跃，开心 |
| 4 | think | 思考姿态 |
| 5 | eat | 吃东西 |
| 6 | unhappy | 不高兴 |

每行生成时传入基准图作为 identity lock + layout guide 约束帧位置。

### 4.3 图片处理（Sharp，Worker 内运行）

```
① 逐行裁剪 → 把 AI 生成的条带切成 6 个 192×208 帧
② 帧校验 → 检查透明背景、尺寸、完整性
③ 拼图 → 7 行 × 6-9 列 → 最终 spritesheet（1536×1872）
④ 生成 pet.json（动画配置）
⑤ 保存 spritesheet 到 R2 + 记录到 D1
⑥ 生成 GIF 动画预览
```

如果帧校验失败，自动重试该行动画（最多 3 次）。

### 4.4 产出

```
sprite-{petId}.webp     → R2 存储，CDN 访问
pet.json                 → 元素/样式/动画帧配置
thumbnail-{petId}.png   → R2 存储（200×200，第一帧截取）
preview.gif              → 6 帧循环预览
```

缩略图由 Sharp 从 spritesheet 第一帧自动截取 → 缩放至 200×200 → 存 R2。

---

## 五、AI 多厂商切换

### API Gateway 设计

```
POST api.cspstudy.top/api/ai/generate
  Body: { model: "zhipu", prompt: "...", reference_image?: "base64..." }
  
Worker 内部路由：
  AI_PROVIDER env var → 决定调用哪个厂商 API
```

### 支持的厂商

| 厂商 | 模型 | API 地址 | 价格 |
|------|------|------|------|
| 智谱 | CogView-4 | open.bigmodel.cn | ~0.05 元/次 |
| 阿里 | 通义万象 | dashscope.aliyuncs.com | ~0.04 元/次 |
| 字节 | 豆包 (Coze) | api.coze.cn | 免费 100 次/天 |

### Worker 环境变量

```
AI_PROVIDER=zhipu      # 当前使用哪个
ZHIPU_API_KEY=xxx      # 智谱 API Key
DASHSCOPE_API_KEY=xxx  # 阿里 API Key
COZE_API_KEY=xxx       # 字节 API Key
```

换厂商只需改 `AI_PROVIDER` 的值，不改代码。

---

## 六、数据库

### workshop_pets 表

```sql
CREATE TABLE workshop_pets (
  id TEXT PRIMARY KEY,
  teacher_id TEXT,
  name TEXT,
  element TEXT,
  style TEXT,
  description TEXT,
  pet_json TEXT,           -- JSON 字符串
  spritesheet_url TEXT,     -- R2 URL
  preview_url TEXT,         -- GIF 预览 URL
  status TEXT DEFAULT 'active',
  created_at TEXT
);
```

---

## 七、精灵分发到 App

### App 端流程

```
App 启动
  ↓
GET api.cspstudy.top/api/workshop/pets
  ↓ 返回精灵列表 ({ id, name, element, tier, spritesheet_url, thumbnail_url, price, teacher_name })
  ↓
App 商城新增「🏭 工坊」Tab，显示缩略图 + 名字 + 老师名 + 价格
  ↓
点击购买 → 下载 spritesheet 到本地 AppData → 孵化
```

### 商城结构

```
App 商城
├── 🍖 食物
├── ⭐ 普通
├── ✨ 稀有
├── 👑 传说
├── 🎁 特殊
└── 🏭 工坊   ← 新增！动态从 API 拉
       ├── 火灵狐（韩老师） 200g  [缩略图]
       ├── 冰晶龙（韩老师） 350g  [缩略图]
       └── ...
```

### 精灵价格

老师创建时自定等级和价格：

| 等级 | 建议价格 |
|------|------|
| ⭐ 普通 | 150g |
| ✨ 稀有 | 260g |
| 👑 传说 | 500g |

### 回退机制（已有精灵不受影响）

```
工坊精灵 → 先从 R2 下载 → 失败 → 从 Gitee raw 下载
内置精灵 → 直接从 Gitee raw 下载（现有逻辑不动）
```

Gitee 上的精灵一个不删。工坊精灵是新增的，不是替换。

---

## 八、部署

| 组件 | 部署方式 |
|------|------|
| workshop.cspstudy.top | `npx wrangler pages deploy workshop-app --project-name=workshop-csp` |
| API 端点 | 追加到 `cf-workers/api.js` 并 `npx wrangler deploy` |
| R2 Bucket | Cloudflare Dashboard 创建 `csp-sprites` bucket |
| DNS | CNAME `workshop` → `workshop-csp.pages.dev`（参照 teacher 域名流程） |

---

## 九、开发任务

| 阶段 | 内容 | 预计 |
|------|------|------|
| 1 | Worker：AI 多厂商切换 + R2 上传 | 2h |
| 2 | Worker：Sharp 帧切割 + 拼图 + 校验 | 3h |
| 3 | 前端：创建精灵页 + 进度条 + 预览 | 3h |
| 4 | 前端：我的精灵列表 | 1h |
| 5 | App 端：从 API 拉取精灵列表 | 1h |
| 6 | 测试 + 部署 | 1h |
| **总计** | | **~11h** |
