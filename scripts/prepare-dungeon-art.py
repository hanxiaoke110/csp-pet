#!/usr/bin/env python3
# 用《山海算法志》V35 美术生成试炼场横屏背景（960x540）。
# 源：老师成长计划/学习平台/shanhai-algorithm-h5/public/assets-v2
# 输出：csp-desktop-pet/public/dungeon-art-v3/
#
# 处理：1024x1536 竖图 → 960x1440 → 裁中上部 540px（保留异兽识别度）
#      底部 45% 叠加暗色渐变（保证战斗/结算 UI 可读），顶部 20% 轻微压暗（标题可读）。
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/hanliuliu/Desktop/老师成长计划/学习平台/shanhai-algorithm-h5/public/assets-v2"
OUT = os.path.join(ROOT, "public", "dungeon-art-v3")
W, H = 960, 540

# 副本 → 山海章节
DUNGEON_MAP = {
    "dungeon-01": "levels/06-simulation/simulation-tortoise-bg-v1.webp",
    "dungeon-02": "levels/07-counting/counting-sun-crow-bg-v1.webp",
    "dungeon-03": "levels/03-loop/loop-kui-bg-v1.webp",
    "dungeon-04": "levels/04-array/array-nine-tail-bg-v1.webp",
    "dungeon-05": "levels/13-quick/quick-yinglong-bg-v1.webp",
    "dungeon-06": "levels/05-enumeration/enumeration-xiezhi-bg-v1.webp",
    "dungeon-07": "levels/12-binary/binary-taotie-bg-v1.webp",
    "dungeon-08": "levels/01-sequence/sequence-qingniao-bg-v1.webp",
}
GLOBAL = {
    "home": "global/world-home-sunlit-v1.webp",
    "map": "global/volume-01-map-v1.webp",
    "success": "global/result-success-backdrop-v1.webp",
    "failure": "global/result-failure-backdrop-v1.webp",
    "bond": "global/result-bond-backdrop-v1.webp",
}

def process(src_rel: str, out_name: str):
    src = os.path.join(SRC, src_rel)
    im = Image.open(src).convert("RGB")
    # 等比缩到 960 宽
    im = im.resize((W, int(im.height * W / im.width)), Image.LANCZOS)
    # 裁中上部 540px：20%~57% 区域（异兽在竖屏上三分之一）
    top = int(im.height * 0.20)
    im = im.crop((0, top, W, top + H))
    # 底部暗色渐变
    grad = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(grad)
    for y in range(H):
        # 底部 45% 从 0 到 200，顶部 20% 从 0 到 60
        a = 0
        if y > int(H * 0.55):
            a = int(200 * (y - int(H * 0.55)) / (H - int(H * 0.55)))
        elif y < int(H * 0.20):
            a = int(60 * (1 - y / int(H * 0.20)))
        d.line([(0, y), (W, y)], fill=a)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    im = Image.composite(black, im, grad)
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, out_name), "WEBP", quality=82, method=6)
    print(f"{out_name}  <- {src_rel}  ({os.path.getsize(os.path.join(OUT, out_name))//1024} KB)")

for key, rel in DUNGEON_MAP.items():
    process(rel, f"{key}-bg.webp")
for name, rel in GLOBAL.items():
    process(rel, f"{name}.webp")

# 预览页
html = ["<!doctype html><html lang='zh'><meta charset='utf-8'><title>试炼场 V35 背景预览</title>",
        "<style>body{background:#111;color:#eee;font-family:sans-serif;margin:24px}"
        "h2{color:#7fd0b0}.row{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px}"
        ".card{width:420px}.card img{width:420px;border-radius:8px;border:1px solid #333;display:block}"
        ".card span{font-size:12px;color:#aaa}</style><body>"]
all_files = list(DUNGEON_MAP.keys()) + list(GLOBAL.keys())
for i in range(0, len(all_files), 3):
    html.append("<div class='row'>")
    for name in all_files[i:i+3]:
        html.append(f"<div class='card'><img src='{name}.webp'><span>{name}</span></div>")
    html.append("</div>")
html.append("</body></html>")
with open(os.path.join(OUT, "preview.html"), "w", encoding="utf-8") as f:
    f.write("\n".join(html))
print("\n预览页：public/dungeon-art-v3/preview.html")
