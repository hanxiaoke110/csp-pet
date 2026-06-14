# Workshop v2 实施计划

> **For agentic workers:** Subagent-driven development recommended. Steps use `- [ ]` checkbox syntax.

**Goal:** 重建精灵工坊——独立 Python CLI 生成精灵 + 精简 Web 上传管理页面。

**Architecture:** `csp-pet-generator` (Python CLI) 负责 AI 生图+PIL 拼合+ZIP 打包；工坊 Web 只做上传+预览+管理（866行→300行）；Claude Code Skill `/hatch-pet` 调度 CLI。

**Tech Stack:** Python 3.10+, PIL/Pillow, Zhipu CogView-4 API, Qwen Wanxiang API, Cloudflare Worker (existing), KV (existing)

**Spec:** `docs/superpowers/specs/2026-06-14-workshop-v2-design.md`

---

## Phase 1: csp-pet-generator

### Task 1: Python 项目骨架

**Files:**
- Create: `csp-pet-generator/pyproject.toml`
- Create: `csp-pet-generator/csp_pet_gen/__init__.py`
- Create: `csp-pet-generator/csp_pet_gen/cli.py`

- [ ] **Step 1: 创建 pyproject.toml**

```toml
[project]
name = "csp-pet-generator"
version = "1.0.0"
description = "CSP Pet Workshop — AI sprite sheet generator"
requires-python = ">=3.10"
dependencies = [
    "Pillow>=10.0",
    "click>=8.0",
    "requests>=2.28",
]

[project.scripts]
csp-gen-pet = "csp_pet_gen.cli:main"
```

- [ ] **Step 2: 创建 CLI 骨架**

```python
# csp_pet_gen/cli.py
import click
import os

@click.command()
@click.argument("description")
@click.option("--name", help="Pet display name")
@click.option("--element", type=click.Choice(["earth","fire","wind","water","light"]), default="fire")
@click.option("--tier", type=click.Choice(["common","rare","legendary"]), default="common")
@click.option("--style", type=click.Choice(["pixel","plush","clay","flat-vector","painterly"]), default="pixel")
@click.option("--provider", type=click.Choice(["zhipu","qwen"]), default="zhipu")
@click.option("--api-key", envvar="PETGEN_API_KEY", help="API Key (or set PETGEN_API_KEY)")
@click.option("--zhipu-key", envvar="ZHIPU_API_KEY", help="Zhipu API Key")
@click.option("--qwen-key", envvar="QWEN_API_KEY", help="Qwen API Key")
@click.option("--retry", default=3, help="Max retries per animation row")
@click.option("--output", "-o", default=".", help="Output directory")
def main(description, name, element, tier, style, provider, api_key, zhipu_key, qwen_key, retry, output):
    """Generate a CSP workshop pet from an AI description."""
    if not api_key:
        api_key = zhipu_key or qwen_key
    if not api_key:
        raise click.UsageError("API Key required. Set PETGEN_API_KEY, ZHIPU_API_KEY, or QWEN_API_KEY.")
    
    click.echo(f"🖌️  Generating {element} {tier} pet: {description[:50]}...")
    click.echo(f"   Style: {style} | Provider: {provider} | Retry: {retry}")
    
    from .generate import generate_pet
    result = generate_pet(
        description=description,
        name=name,
        element=element,
        tier=tier,
        style=style,
        provider=provider,
        api_key=api_key,
        max_retries=retry,
        output_dir=output,
    )
    click.echo(f"✅ Done! Output: {result}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 创建空模块文件**

```bash
touch csp_pet_gen/__init__.py
touch csp_pet_gen/generate.py
touch csp_pet_gen/assemble.py
touch csp_pet_gen/validate.py
touch csp_pet_gen/templates.py
touch csp_pet_gen/providers/__init__.py
touch csp_pet_gen/providers/base.py
touch csp_pet_gen/providers/zhipu.py
touch csp_pet_gen/providers/qwen.py
```

- [ ] **Step 4: 验证安装**

```bash
cd csp-pet-generator && pip install -e . && csp-gen-pet --help
```

Expected: 显示 CLI help。

- [ ] **Step 5: Commit**

```bash
git add csp-pet-generator/
git commit -m "feat(csp-pet-gen): Python project skeleton with CLI"
```

---

### Task 2: Provider 抽象接口 + Zhipu

**Files:**
- Create: `csp-pet-generator/csp_pet_gen/providers/base.py`
- Create: `csp-pet-generator/csp_pet_gen/providers/zhipu.py`

- [ ] **Step 1: 创建 BaseProvider 接口**

```python
# csp_pet_gen/providers/base.py
from abc import ABC, abstractmethod
from typing import Optional

class BaseProvider(ABC):
    @abstractmethod
    def generate_image(self, prompt: str, ref_image: Optional[bytes] = None) -> bytes:
        """Generate a single image, returning PNG bytes."""
        ...

    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
        ...
```

- [ ] **Step 2: 实现 Zhipu Provider**

```python
# csp_pet_gen/providers/zhipu.py
import time
import requests
import base64
from typing import Optional
from .base import BaseProvider

class ZhipuProvider(BaseProvider):
    BASE_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def name(self) -> str:
        return "zhipu"

    def generate_image(self, prompt: str, ref_image: Optional[bytes] = None) -> bytes:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "model": "cogview-4",
            "prompt": prompt,
            "size": "1152x208" if "strip" in prompt else "192x208",
        }
        if ref_image:
            payload["image"] = base64.b64encode(ref_image).decode()

        resp = requests.post(self.BASE_URL, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        # CogView-4 returns {data: [{url}]}
        image_url = data["data"][0]["url"]
        img_resp = requests.get(image_url, timeout=60)
        img_resp.raise_for_status()
        return img_resp.content
```

- [ ] **Step 3: 验证 Zhipu 能生成图**

```bash
python3 -c "
from csp_pet_gen.providers.zhipu import ZhipuProvider
p = ZhipuProvider('$ZHIPU_API_KEY')
img = p.generate_image('a cute pixel art fire dragon, 192x208')
print(f'Generated {len(img)} bytes')
"
```

Expected: `Generated XXXXX bytes`

- [ ] **Step 4: Commit**

```bash
git add csp-pet-generator/csp_pet_gen/providers/
git commit -m "feat(csp-pet-gen): BaseProvider + Zhipu CogView-4 provider"
```

---

### Task 3: Qwen Provider

**Files:**
- Create: `csp-pet-generator/csp_pet_gen/providers/qwen.py`

- [ ] **Step 1: 实现 Qwen Wanxiang Provider（异步轮询）**

```python
# csp_pet_gen/providers/qwen.py
import time
import requests
from typing import Optional
from .base import BaseProvider

class QwenProvider(BaseProvider):
    CREATE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/image-synthesis"
    RESULT_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def name(self) -> str:
        return "qwen"

    def generate_image(self, prompt: str, ref_image: Optional[bytes] = None) -> bytes:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        payload = {
            "model": "wanx2.1-t2i-turbo",
            "input": {"prompt": prompt},
            "parameters": {
                "size": "1152*208",
                "n": 1,
            },
        }
        if ref_image:
            import base64
            payload["input"]["ref_image"] = base64.b64encode(ref_image).decode()

        # 1) Submit task
        resp = requests.post(self.CREATE_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        task_id = resp.json()["output"]["task_id"]

        # 2) Poll for result (max 120s)
        for _ in range(60):
            time.sleep(2)
            r = requests.get(self.RESULT_URL.format(task_id=task_id), headers=headers, timeout=30)
            r.raise_for_status()
            result = r.json()
            status = result["output"]["task_status"]
            if status == "SUCCEEDED":
                img_url = result["output"]["results"][0]["url"]
                img_resp = requests.get(img_url, timeout=60)
                img_resp.raise_for_status()
                return img_resp.content
            elif status == "FAILED":
                raise RuntimeError(f"Qwen task failed: {result}")

        raise TimeoutError("Qwen task timed out after 120s")
```

- [ ] **Step 2: 提交**

```bash
git add csp-pet-generator/csp_pet_gen/providers/qwen.py
git commit -m "feat(csp-pet-gen): Qwen Wanxiang provider with async polling"
```

---

### Task 4: PIL 拼合引擎 + 帧校验

**Files:**
- Create: `csp-pet-generator/csp_pet_gen/assemble.py`
- Create: `csp-pet-generator/csp_pet_gen/validate.py`

- [ ] **Step 1: 创建 assemble.py**

```python
# csp_pet_gen/assemble.py
from PIL import Image
from typing import List, Dict, Tuple

FRAME_W = 192
FRAME_H = 208
COLS = 9
ANIM_ORDER = ["idle", "walk", "sleep", "celebrate", "think", "eat", "unhappy"]
ANIM_FRAMES = {"idle": 6, "walk": 8, "sleep": 6, "celebrate": 4, "think": 6, "eat": 5, "unhappy": 8}

def assemble_spritesheet(anim_strips: Dict[str, Image.Image]) -> Image.Image:
    """Compose 7 animation strips into an 8×9 spritesheet.
    
    Each strip is a horizontal row of frames.
    Returns RGBA PIL Image 1728×1872 (9 cols × 8 rows).
    """
    canvas = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * 8), (0, 0, 0, 0))
    
    for row_idx, anim_name in enumerate(ANIM_ORDER):
        strip = anim_strips.get(anim_name)
        if not strip:
            continue
        frames = ANIM_FRAMES[anim_name]
        for col in range(frames):
            frame = strip.crop((col * FRAME_W, 0, (col + 1) * FRAME_W, FRAME_H))
            canvas.paste(frame, (col * FRAME_W, row_idx * FRAME_H))
    
    return canvas


def split_strip(strip_bytes: bytes, frame_count: int) -> List[Image.Image]:
    """Split a horizontal animation strip into individual frames."""
    strip = Image.open(__import__('io').BytesIO(strip_bytes)).convert("RGBA")
    frames = []
    for i in range(frame_count):
        frame = strip.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H))
        frames.append(frame)
    return frames
```

- [ ] **Step 2: 创建帧校验 validate.py**

```python
# csp_pet_gen/validate.py
from PIL import Image
import io
from typing import List, Tuple

FRAME_W = 192
FRAME_H = 208

def validate_frames(frames: List[Image.Image]) -> Tuple[bool, str]:
    """Check all frames meet quality standards."""
    for i, frame in enumerate(frames):
        if frame.size != (FRAME_W, FRAME_H):
            return False, f"Frame {i}: wrong size {frame.size}"
        
        # Alpha check: >5% non-zero alpha pixels
        alpha = frame.getchannel("A")
        non_zero = sum(1 for p in alpha.getdata() if p > 10)
        total = FRAME_W * FRAME_H
        if non_zero / total < 0.05:
            return False, f"Frame {i}: too few non-zero alpha pixels ({non_zero}/{total})"
        
        # Color variety: at least 3 distinct colors
        rgb = frame.convert("RGB")
        colors = len(set(rgb.getdata()))
        if colors < 3:
            return False, f"Frame {i}: only {colors} distinct colors"
    
    return True, "OK"


def validate_spritesheet(image: Image.Image) -> Tuple[bool, str]:
    """Validate complete spritesheet."""
    expected_size = (FRAME_W * 9, FRAME_H * 8)
    if image.size != expected_size:
        return False, f"Spritesheet size {image.size}, expected {expected_size}"
    return True, "OK"
```

- [ ] **Step 3: Commit**

```bash
git add csp-pet-generator/csp_pet_gen/assemble.py csp-pet-generator/csp_pet_gen/validate.py
git commit -m "feat(csp-pet-gen): PIL spritesheet assembly + frame validation"
```

---

### Task 5: pet.json 模板 + ZIP 打包

**Files:**
- Create: `csp-pet-generator/csp_pet_gen/templates.py`
- Modify: `csp-pet-generator/csp_pet_gen/generate.py`

- [ ] **Step 1: 创建模板**

```python
# csp_pet_gen/templates.py
import json
from typing import Dict

ANIM_FRAMES = {"idle":6,"walk":8,"sleep":6,"celebrate":4,"think":6,"eat":5,"unhappy":8}
ANIM_ORDER = ["idle","walk","sleep","celebrate","think","eat","unhappy"]
DURATIONS = {"idle":1100,"walk":1060,"sleep":1010,"celebrate":700,"think":1030,"eat":840,"unhappy":1220}

def build_pet_json(name: str, slug: str, element: str, tier: str) -> Dict:
    return {
        "name": name,
        "slug": slug,
        "element": element,
        "tier": tier,
        "frameWidth": 192,
        "frameHeight": 208,
        "maxFrames": 9,
        "anims": ANIM_FRAMES,
        "animOrder": ANIM_ORDER,
        "durations": DURATIONS,
    }

def write_pet_json(path: str, name: str, slug: str, element: str, tier: str):
    data = build_pet_json(name, slug, element, tier)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
```

- [ ] **Step 2: 创建主流程 generate.py**

```python
# csp_pet_gen/generate.py
import os
import io
import zipfile
import re
from PIL import Image
from .providers.zhipu import ZhipuProvider
from .providers.qwen import QwenProvider
from .assemble import ANIM_ORDER, ANIM_FRAMES, FRAME_W, FRAME_H, assemble_spritesheet
from .validate import validate_frames, validate_spritesheet
from .templates import write_pet_json
import click

PROMPT_BASE = "masterpiece, best quality, game sprite sheet, pixel art, {style} style, {element} element, {tier} tier creature, character design, consistent design, transparent background, {size}px"

def slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-'))[:30]

def generate_pet(
    description: str, name: str, element: str, tier: str,
    style: str, provider: str, api_key: str,
    max_retries: int = 3, output_dir: str = "."
) -> str:
    # Init provider
    if provider == "zhipu":
        prov = ZhipuProvider(api_key)
    else:
        prov = QwenProvider(api_key)
    
    slug = slugify(name or description[:20])
    click.echo(f"🐣 Creating: {slug}")
    
    # Step 1: Generate base image (192×208)
    base_prompt = PROMPT_BASE.format(style=style, element=element, tier=tier, size="192x208")
    full_prompt = f"{base_prompt}, {description}"
    click.echo("  [1/3] Generating base image...")
    base_img = prov.generate_image(full_prompt)
    
    # Step 2: Generate 7 animation strips
    click.echo("  [2/3] Generating animation strips...")
    anim_strips = {}
    for anim_name in ANIM_ORDER:
        frame_count = ANIM_FRAMES[anim_name]
        strip_prompt = f"{base_prompt}, 1152x208, {frame_count}-frame horizontal strip, {anim_name} animation, character performing {anim_name} motion, {description}"
        
        for attempt in range(max_retries):
            try:
                strip_bytes = prov.generate_image(strip_prompt, ref_image=base_img)
                strip = Image.open(io.BytesIO(strip_bytes)).convert("RGBA")
                # Split and validate
                frames = [strip.crop((i*FRAME_W, 0, (i+1)*FRAME_W, FRAME_H)) for i in range(frame_count)]
                ok, msg = validate_frames(frames)
                if ok:
                    anim_strips[anim_name] = strip
                    click.echo(f"    ✅ {anim_name} ({frame_count}f)")
                    break
                else:
                    click.echo(f"    ⚠️ {anim_name} attempt {attempt+1}: {msg}")
            except Exception as e:
                click.echo(f"    ❌ {anim_name} attempt {attempt+1}: {e}")
        else:
            raise RuntimeError(f"Failed to generate {anim_name} after {max_retries} attempts")
    
    # Step 3: Assemble + package
    click.echo("  [3/3] Assembling spritesheet...")
    spritesheet = assemble_spritesheet(anim_strips)
    ok, msg = validate_spritesheet(spritesheet)
    if not ok:
        raise RuntimeError(f"Spritesheet validation failed: {msg}")
    
    # Make output dir
    pet_dir = os.path.join(output_dir, slug)
    os.makedirs(pet_dir, exist_ok=True)
    
    # Save spritesheet
    spritesheet_path = os.path.join(pet_dir, "spritesheet.png")
    spritesheet.save(spritesheet_path, "PNG")
    
    # Save pet.json
    write_pet_json(os.path.join(pet_dir, "pet.json"), name or slug, slug, element, tier)
    
    # Create ZIP
    zip_path = os.path.join(output_dir, f"{slug}.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(pet_dir, "pet.json"), f"{slug}/pet.json")
        zf.write(os.path.join(pet_dir, "spritesheet.png"), f"{slug}/spritesheet.png")
    
    return zip_path
```

- [ ] **Step 3: Commit**

```bash
git add csp-pet-generator/csp_pet_gen/templates.py csp-pet-generator/csp_pet_gen/generate.py
git commit -m "feat(csp-pet-gen): pet.json template + ZIP packaging + main pipeline"
```

---

### Task 6: Claude Code Skill `/hatch-pet`

**Files:**
- Create: `csp-pet-generator/skill/hatch-pet.md`

- [ ] **Step 1: 创建 Skill 文件**

```markdown
# Hatch Pet Skill

Generate CSP workshop pets using AI. Orchestrates the csp-pet-generator CLI.

## Trigger

- `/hatch-pet "描述"`
- "帮我生成一只精灵"
- "创建新宠物"
- "生成一个智子"

## Workflow

### Step 1: Gather Requirements

Ask the teacher ONE question at a time:

1. "请描述一下你想要什么精灵？" (e.g., "红色小火龙")
2. "什么元素？" → earth/fire/wind/water/light
3. "什么稀有度？" → common/rare/legendary
4. "什么美术风格？" → pixel/plush/clay/flat-vector/painterly
5. "用哪个 AI？" → zhipu(default)/qwen

### Step 2: Verify API Key

Check if PETGEN_API_KEY is set in env. If not, ask teacher to provide it.

### Step 3: Generate

```bash
csp-gen-pet "{description}" \
  --name "{name}" \
  --element {element} \
  --tier {tier} \
  --style {style} \
  --provider {provider} \
  --retry 3 \
  --output ./output/
```

### Step 4: Show Results

Show the generated files:
- Preview the spritesheet (describe what was generated)
- Show pet.json contents
- Confirm the ZIP path

### Step 5: Upload Reminder

"✅ 精灵已生成！请打开 https://workshop.cspstudy.top 上传 {slug}.zip"
```

- [ ] **Step 2: Commit**

```bash
git add csp-pet-generator/skill/
git commit -m "feat(csp-pet-gen): Claude Code /hatch-pet skill"
```

---

## Phase 2: 工坊 Web 精简

### Task 7: 精简 workshop-app/index.html

**Files:**
- Modify: `workshop-app/index.html` (866行 → ~300行)

砍掉（不再保留）：
- Create Pet tab（全部 8 步 pipeline）
- AI Config tab（教师本地管理 Key）
- 多供应商切换
- Canvas 拼合 + 帧校验 + 预览生成
- CORS 代理调用
- JSZip 依赖

保留：
- Import 上传（改为支持 ZIP）
- My Pets 管理（编辑/删除）
- 简化的预览 Canvas

- [ ] **Step 1: 重写 index.html 为上传+管理两 Tab**

只保留：Upload Tab（拖拽 ZIP） + My Pets Tab（列表+编辑+删除）。

Upload Tab 逻辑：
```
拖拽 ZIP
  → 前端解压验证 (pet.json + spritesheet.png 都存在? spritesheet 尺寸 1728×1872?)
  → 通过 → FormData Blob: pet_json + spritesheet → POST /api/workshop/pets
  → Worker 侧验证 + KV 存储 + D1 写入
  → 显示成功，跳转到 My Pets
```

- [ ] **Step 2: 更新 Worker API**

在 `cf-workers/api.js` 中确保 `/api/workshop/pets` 端点：
- POST：接受 `pet_json` (text) + `spritesheet` (binary)，分别存 KV
- 验证 spritesheet 尺寸、pet.json 字段完整性
- 写入 D1 `workshop_pets` 表

- [ ] **Step 3: Commit**

```bash
git add workshop-app/index.html cf-workers/api.js
git commit -m "feat(workshop): simplify to upload + manage only"
```

---

### Task 8: 集成测试

- [ ] **Step 1: 用 csp-gen-pet 生成一只测试精灵**

```bash
cd csp-pet-generator
ZHIPU_API_KEY="xxx" csp-gen-pet "fire dragon" --element fire --tier rare --output ./test-output/
```

- [ ] **Step 2: 上传到工坊**

打开 workshop-app/index.html → 拖拽 test-output/fire-dragon.zip → 确认上传成功。

- [ ] **Step 3: 学生端下载孵化**

打开 App → 工坊商店 → 购买 → 孵化 → 确认显示正常。

---

## 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-14 | 初版：8 个 Task，覆盖 CLI + providers + assemble + skill + workshop |
