# 精灵工坊 v2 — 设计方案

> 日期：2026-06-14  
> 状态：设计完成，待评审  
> 参考：crafter-station/petdex

## 一、核心思路：生成与工坊分离

**v1 的问题：**
- 866 行单文件 SPA，浏览器 Canvas 拼合 → CORS 地狱
- 4 个 AI 供应商 2 个空壳
- KV 存储有大小限制
- 帧验证简陋，重试缺失

**v2 方案：**

```
┌─────────────────────────────────────────────────────┐
│  csp-pet-generator (独立 Python 包，教师本地运行)      │
│  ┌───────────────────────────────────────────────┐  │
│  │  cli.py: csp-gen-pet "描述" --style pixel      │  │
│  │  providers/zhipu.py  ← 主力（CogView-4）        │  │
│  │  providers/qwen.py   ← 备用（Wanxiang）         │  │
│  │  assemble.py         ← PIL 拼合 spritesheet    │  │
│  │  validate.py         ← 逐帧 Alpha 校验          │  │
│  │  Claude Code Skill   ← 调度 + 重试 + 打包       │  │
│  │  输出: name.zip (pet.json + spritesheet.webp)  │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  工坊 Web (workshop.cspstudy.top)                    │
│  ┌───────────────────────────────────────────────┐  │
│  │  📤 上传 ZIP → Worker → KV                     │  │
│  │  👁️ 预览 (Canvas 动图)                          │  │
│  │  📋 管理 (编辑/删除)                            │  │
│  │  866 行 → ~300 行                              │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  学生 App (Tauri)                                    │
│  ┌───────────────────────────────────────────────┐  │
│  │  工坊商店 → 购买 → 下载 spritesheet → 孵化       │  │
│  │  (此部分已有，不变)                             │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 二、csp-pet-generator 详细设计

### 2.1 目录结构

```
csp-pet-generator/
├── pyproject.toml
├── csp_pet_gen/
│   ├── cli.py                # 命令行入口
│   ├── generate.py           # 生成主流程
│   ├── providers/
│   │   ├── base.py           # Provider 抽象接口
│   │   ├── zhipu.py          # 智谱 CogView-4
│   │   └── qwen.py           # 通义千问 Wanxiang
│   ├── assemble.py           # PIL 拼合 spritesheet
│   ├── validate.py           # 帧质量校验
│   └── templates.py          # pet.json 模板
├── skill/                    # Claude Code Skill
│   └── hatch-pet.md
└── README.md
```

### 2.2 命令行

```bash
# 基本用法
csp-gen-pet "一只火系小龙，像素风格，红色鳞片，可爱的卡通造型"

# 选项
csp-gen-pet "描述" \
  --element fire          # earth/fire/wind/water/light
  --tier rare             # common/rare/legendary
  --style pixel           # pixel/plush/clay/flat-vector
  --provider zhipu        # zhipu/qwen
  --api-key $ZHIPU_KEY    # 或环境变量
  --output ./my-pets/     # 输出目录
  --retry 3               # 失败行重试次数
```

### 2.3 生成流程（7 步）

```
输入: 精灵描述 + 元素 + 风格
  │
  ├─ ① 构建增强 Prompt
  │     "masterpiece, best quality, game sprite sheet, pixel art,
  │      192x208 frame, {{description}}, {{element}} element,
  │      {{style}} style, character design sheet, 6-frame horizontal
  │      animation strip, transparent background, consistent design"
  │
  ├─ ② 生成 Base Image（1 张，192×208）
  │     API: Zhipu CogView-4 或 Qwen Wanxiang
  │     作为后续所有行的风格参考图
  │
  ├─ ③ 逐行动画生成（7 行 × 6 帧）
  │     idle(w=6) walk(8) sleep(6) celebrate(4) think(6) eat(5) unhappy(8)
  │     每行调用 API 1 次，传入 ref_image = base
  │     输出: 水平条带 192×h × 6 帧 = 1152×208
  │     失败自动重试（最多 3 次）
  │
  ├─ ④ PIL 拼合 Spritesheet
  │     8 rows × 9 cols × 192×208 = 1728×1872 PNG
  │     行 0: idle (填充前 6 列，后 3 列透明)
  │     行 1: walk (8 列)
  │     行 2: sleep (6 列)
  │     行 3: celebrate (4 列)
  │     行 4: think (6 列)
  │     行 5: eat (5 列)
  │     行 6: unhappy (8 列)
  │     行 7: extra (预留，全部透明)
  │
  ├─ ⑤ 帧校验
  │     每帧检查: Alpha 通道非零像素 > 5%（排除全空帧）
  │     尺寸检查: 每帧精确 192×208
  │     色彩检查: 至少 3 种不同颜色（排除纯色帧）
  │
  ├─ ⑥ 生成 pet.json
  │     {
  │       "name": "小火龙", "slug": "fire-dragon",
  │       "element": "fire", "tier": "rare",
  │       "frameWidth": 192, "frameHeight": 208,
  │       "maxFrames": 9,
  │       "anims": {"idle":6, "walk":8, "sleep":6, "celebrate":4,
  │                 "think":6, "eat":5, "unhappy":8},
  │       "animOrder": ["idle","walk","sleep","celebrate","think","eat","unhappy"],
  │       "durations": {"idle":1100, "walk":1060, "sleep":1010,
  │                      "celebrate":700, "think":1030, "eat":840, "unhappy":1220}
  │     }
  │
  └─ ⑦ 打包输出
        name.zip → {name}/pet.json + {name}/spritesheet.png
```

### 2.4 AI Provider 接口（统一抽象）

```python
class BaseProvider(ABC):
    @abstractmethod
    def generate_image(self, prompt: str, ref_image: Optional[bytes] = None) -> bytes:
        """生成单张图片，返回 PNG bytes"""
    
    @abstractmethod
    def name(self) -> str:
        """Provider 名称"""
```

| Provider | 模型 | API | ref_image |
|----------|------|-----|-----------|
| Zhipu | CogView-4 | `open.bigmodel.cn/api/paas/v4/images/generations` | ✅ |
| Qwen | Wanx2.1-t2i-turbo | `dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/image-synthesis` | ✅ (async polling) |

### 2.5 Claude Code Skill

```markdown
# Hatch Pet Skill

触发词: "/hatch-pet", "帮我生成一只精灵", "创建新宠物"

流程:
1. 收集需求: 名称、描述、元素、风格、稀有度
2. 调用 csp-gen-pet CLI
3. 监控生成进度（7 行动画逐行报告）
4. 校验输出 ZIP
5. 提示教师上传到工坊
```

## 三、工坊 Web 页面（精简版）

### 3.1 功能

| Tab | 功能 | 实现 |
|-----|------|------|
| 📤 上传 | 拖拽 ZIP → Worker 验证 → KV 存储 | ~80 行 |
| 👁️ 预览 | 选中精灵 → Canvas 渲染动图 | ~80 行 |
| 📋 管理 | 列表 + 编辑名称/元素 + 删除 | ~120 行 |

砍掉的内容：
- ❌ 8 步 AI 生成 pipeline（866 行 → 移入 csp-pet-generator）
- ❌ Canvas 拼合逻辑
- ❌ AI 配置 Tab（教师本地管理 API Key）
- ❌ 多供应商切换
- ❌ CORS 代理

### 3.2 上传流程

```
教师拖拽 ZIP
  → Worker 解压验证 (pet.json + spritesheet.png)
  → 校验 spritesheet 尺寸 (1728×1872)
  → 校验 pet.json 字段完整性
  → 上传 spritesheet + pet.json 到 KV (key: workshop/{slug}/)
  → 写入 D1 workshop_pets 表
  → 返回成功
```

### 3.3 API 端点（Worker 侧）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/workshop/pets` | 上传 ZIP（multipart） |
| GET | `/api/workshop/pets` | 获取教师的所有精灵 |
| PUT | `/api/workshop/pets/:slug` | 编辑精灵信息 |
| DELETE | `/api/workshop/pets/:slug` | 删除精灵 |

## 四、学生端（不变）

学生 App 已有完整工坊商店+下载+孵化流程：
- `WorkshopShop.tsx` — 精灵商店
- `spriteDownloader.ts` — 下载管理
- `hatchStore.ts` — 孵化状态
- 下载 → AppData 缓存 → PetSprite 加载

## 五、petdex 经验吸收

| petdex | 我们 |
|--------|------|
| 8×9 网格, 72 帧 | 8×9 网格，maxFrames=9 |
| 行映射: idle/wave/run/failed/review/jump/extra1/extra2 | idle/walk/sleep/celebrate/think/eat/unhappy/extra |
| 固定 6 帧/行 | 可变帧数/行（4-8） |
| WebP spritesheet | PNG spritesheet |
| R2 存储 | KV 存储（后续迁 R2） |
| CLI: `npx petdex submit` | CLI: `csp-gen-pet` + Web 上传 |
| dHash 去重 | 帧校验去空 |
| Manifest API | Workshop API |
| ~10 个动画状态 | 7 个动画状态 |

## 六、实施计划概要

### Phase 1: csp-pet-generator（核心）
1. 项目骨架 (pyproject.toml, CLI)
2. Zhipu provider
3. Qwen provider  
4. PIL 拼合引擎
5. 帧校验
6. 打包 ZIP
7. Claude Code Skill

### Phase 2: 工坊 Web 精简
1. 砍掉生成 pipeline
2. ZIP 上传 + 验证
3. 预览 + 管理

### Phase 3: 测试 + 迁移
1. 生成 3 只测试精灵
2. 学生端下载孵化验证
3. 清理旧生成代码

## 七、修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-14 | 初版 |
