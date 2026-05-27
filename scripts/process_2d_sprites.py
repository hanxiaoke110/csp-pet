"""
Process all 2D sprites into standardized sprite sheets for PetSprite.
Each output: {name}.png (7-row sprite sheet) + {name}.json (metadata)
"""
import os, json, math
from PIL import Image

BASE = "/Users/hanliuliu/Desktop/学生成长计划/csp-chrome-ext/2d素材/_extracted"
OUT = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites/2d"
os.makedirs(OUT, exist_ok=True)

# Standard animation rows (matching our 7 states)
ANIM_ORDER = ["idle", "walk", "sleep", "celebrate", "think", "eat", "unhappy"]
FRAME_W, FRAME_H = 200, 200  # Standard output frame size
MAX_FRAMES = 12  # Max frames per animation row


def make_sheet(frames_by_anim, name):
    """Create standardized sprite sheet from {anim_name: [PIL.Image]}"""
    num_rows = len(ANIM_ORDER)
    num_cols = MAX_FRAMES
    sheet = Image.new("RGBA", (num_cols * FRAME_W, num_rows * FRAME_H), (0, 0, 0, 0))

    used_anims = {}
    for row_idx, anim_name in enumerate(ANIM_ORDER):
        frames = frames_by_anim.get(anim_name, [])
        if not frames:
            continue
        used_anims[anim_name] = len(frames)
        for col_idx, frame in enumerate(frames[:MAX_FRAMES]):
            # Resize to standard frame size
            fw, fh = frame.size
            if fw != FRAME_W or fh != FRAME_H:
                # Center in frame
                scale = min(FRAME_W / fw, FRAME_H / fh)
                new_w, new_h = int(fw * scale), int(fh * scale)
                resized = frame.resize((new_w, new_h), Image.NEAREST)
                x = (FRAME_W - new_w) // 2
                y = (FRAME_H - new_h) // 2
                canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
                canvas.paste(resized, (x, y), resized)
                sheet.paste(canvas, (col_idx * FRAME_W, row_idx * FRAME_H))
            else:
                sheet.paste(frame, (col_idx * FRAME_W, row_idx * FRAME_H))

    path = os.path.join(OUT, f"{name}.png")
    sheet.save(path, "PNG")
    meta = {"name": name, "frameWidth": FRAME_W, "frameHeight": FRAME_H,
            "maxFrames": MAX_FRAMES, "anims": used_anims, "animOrder": ANIM_ORDER}
    with open(os.path.join(OUT, f"{name}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"  {name}: {used_anims} → {path}")
    return used_anims


def load_frames_from_dir(dirpath, prefix_filter=""):
    """Load all PNG frames from a directory, sorted by name."""
    frames = []
    for fn in sorted(os.listdir(dirpath)):
        if fn.endswith('.png') and fn.startswith(prefix_filter):
            frames.append(Image.open(os.path.join(dirpath, fn)).convert("RGBA"))
    return frames


def load_sprite_sheet(path, frame_w, horizontal=True):
    """Split a sprite sheet into individual frames."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    frames = []
    if horizontal:
        for x in range(0, w, frame_w):
            if x + frame_w <= w:
                frames.append(im.crop((x, 0, x + frame_w, h)))
    else:
        for y in range(0, h, frame_w):
            if y + frame_w <= h:
                frames.append(im.crop((0, y, w, y + frame_w)))
    return frames


# ═══════════════════════════════════════════
# 1. Otter (200×200 individual frames)
# ═══════════════════════════════════════════
print("\n=== 1. Otter (水獭) ===")
otter_dir = os.path.join(BASE, "52993edd9a3bd9eb")
otter_frames = {}
for fn in sorted(os.listdir(otter_dir)):
    if not fn.endswith('.png'): continue
    # Extract animation name: otter_idle_1.png → idle
    parts = fn.replace('.png', '').split('_')
    if parts[0] == 'otter':
        anim = '_'.join(parts[1:-1]) if len(parts) > 2 else parts[1]
    else:
        anim = parts[0]
    # Normalize: idle_alt → idle, land → idle, spin → celebrate
    if 'idle' in anim:
        anim = 'idle'
    elif anim in ('jump',):
        anim = 'celebrate'
    elif anim in ('run',):
        anim = 'walk'
    elif anim in ('land',):
        anim = 'idle'
    elif anim in ('sleep',):
        anim = 'sleep'
    elif anim in ('spin',):
        anim = 'celebrate'
    else:
        anim = 'idle'

    if anim not in otter_frames:
        otter_frames[anim] = []
    im = Image.open(os.path.join(otter_dir, fn)).convert("RGBA")
    otter_frames[anim].append(im)

make_sheet(otter_frames, "otter")


# ═══════════════════════════════════════════
# 2. White Cat (32px vertical sprite sheets)
# ═══════════════════════════════════════════
print("\n=== 2. White Cat ===")
cat_dir = os.path.join(BASE, "b144676277e0ff3a")
cat_frames = {}
mapping = {
    'WhiteCatIdle': 'idle', 'WhiteCatRun': 'walk', 'WhiteCatRush': 'walk',
    'WhiteCatDamage': 'unhappy', 'WhiteCatDie': 'sleep',
}
for fn in sorted(os.listdir(cat_dir)):
    if not fn.endswith('.png'): continue
    name = fn.replace('.png', '')
    anim = mapping.get(name, None)
    if anim is None: continue
    frames = load_sprite_sheet(os.path.join(cat_dir, fn), 32, horizontal=False)
    # Upscale 32→128 (4x) with NEAREST for pixel art
    frames = [f.resize((128, 128), Image.NEAREST) for f in frames]
    if anim not in cat_frames:
        cat_frames[anim] = []
    cat_frames[anim].extend(frames)

make_sheet(cat_frames, "whitecat")


# ═══════════════════════════════════════════
# 3. Cute Chicken (32px horizontal strips)
# ═══════════════════════════════════════════
print("\n=== 3. Cute Chicken ===")
chicken_dir = os.path.join(BASE, "627e48151e7ca58b")
chicken_frames = {}
for fn in sorted(os.listdir(chicken_dir)):
    if not fn.endswith('.png'): continue
    name = fn.replace('.png', '').strip()
    if 'idle' in name.lower():
        anim = 'idle'
    elif 'walk' in name.lower():
        anim = 'walk'
    else:
        continue
    # Determine frame width: total_w / num_frames
    im = Image.open(os.path.join(chicken_dir, fn)).convert("RGBA")
    w, h = im.size
    # These are 32px strips, frame_h = 32
    num_frames = w // h if h > 0 else 1
    frames = load_sprite_sheet(os.path.join(chicken_dir, fn), h, horizontal=True)
    frames = [f.resize((128, 128), Image.NEAREST) for f in frames]
    chicken_frames[anim] = frames

make_sheet(chicken_frames, "chicken")


# ═══════════════════════════════════════════
# 4. Knight (96px horizontal strips)
# ═══════════════════════════════════════════
print("\n=== 4. Knight ===")
knight_dir = os.path.join(BASE, "2c48fcd4d96a0991/Knight")
knight_frames = {}
knight_map = {'idle': 'idle', 'Run': 'walk', 'Jump': 'celebrate', 'Hit': 'unhappy', 'Death': 'sleep'}
for fn in sorted(os.listdir(knight_dir)):
    if not fn.endswith('.png'): continue
    name = fn.replace('.png', '')
    anim = knight_map.get(name, None)
    if anim is None: continue
    im = Image.open(os.path.join(knight_dir, fn)).convert("RGBA")
    w, h = im.size
    frame_h = h  # The strip is horizontal, each frame is h×h
    frames = load_sprite_sheet(os.path.join(knight_dir, fn), frame_h, horizontal=True)
    # 96px → 192px (2x)
    frames = [f.resize((FRAME_W, FRAME_H), Image.NEAREST) for f in frames]
    if anim not in knight_frames:
        knight_frames[anim] = []
    knight_frames[anim].extend(frames)

make_sheet(knight_frames, "knight")


# ═══════════════════════════════════════════
# 5. Valkyrie (96×96 individual frames, walk only)
# ═══════════════════════════════════════════
print("\n=== 5. Valkyrie ===")
valk_dir = os.path.join(BASE, "ef5674197b75ac9c")
valk_frames_list = load_frames_from_dir(valk_dir)
valk_frames_list = [f.resize((FRAME_W, FRAME_H), Image.NEAREST) for f in valk_frames_list]
make_sheet({'walk': valk_frames_list, 'idle': [valk_frames_list[0]] * 4}, "valkyrie")


# ═══════════════════════════════════════════
# 6. Cat Player 猫咪2 (32px)
# ═══════════════════════════════════════════
print("\n=== 6. Cat Player ===")
cat2_dir = os.path.join(BASE, "猫咪2/Cat_player/Cat_sheets")
cat2_frames = {}
cat2_map = {
    'Cat_idle': 'idle', 'Cat_walk': 'walk', 'Cat_run': 'walk',
    'Cat_asleep': 'sleep', 'Cat_jump': 'celebrate', 'Cat_win_cheer': 'celebrate',
    'Cat_dead': 'sleep', 'Cat_hit': 'unhappy', 'Cat_ducking': 'think',
    'Cat_ducking_idle': 'think', 'Cat_ducking_move': 'walk',
    'Cat_attack': 'celebrate', 'Cat_landding': 'idle',
    'Cat_ladder': 'walk', 'Cat_fall': 'unhappy',
    'Cat_spining': 'celebrate', 'Cat_against_wall': 'think',
}
for fn in sorted(os.listdir(cat2_dir)):
    if not fn.endswith('.png'): continue
    name = fn.replace('.png', '')
    # Find matching animation
    anim = None
    for key, val in cat2_map.items():
        if name.startswith(key):
            anim = val
            break
    if anim is None: continue

    im = Image.open(os.path.join(cat2_dir, fn)).convert("RGBA")
    w, h = im.size
    if w == 32 and h == 32:
        frames = [im.resize((128, 128), Image.NEAREST)]
    elif w > h:
        frame_w = h
        frames = load_sprite_sheet(os.path.join(cat2_dir, fn), frame_w, horizontal=True)
        frames = [f.resize((128, 128), Image.NEAREST) for f in frames]
    else:
        frame_h = w
        frames = load_sprite_sheet(os.path.join(cat2_dir, fn), frame_h, horizontal=False)
        frames = [f.resize((128, 128), Image.NEAREST) for f in frames]

    if anim not in cat2_frames:
        cat2_frames[anim] = []
    cat2_frames[anim].extend(frames)

make_sheet(cat2_frames, "catplayer")


# ═══════════════════════════════════════════
# 7. girl-64x64 (320×520)
# ═══════════════════════════════════════════
print("\n=== 7. girl-64x64 ===")
girl_path = os.path.join(BASE, "8012320109f7a86b/girl-64x64.png")
girl_im = Image.open(girl_path).convert("RGBA")
gw, gh = girl_im.size
print(f"  Size: {gw}x{gh}")

# Try to auto-detect frame layout
# Common patterns: grid of equal-sized frames
best_layout = None
for fw in [32, 40, 48, 56, 64, 80, 96, 128]:
    for fh in [32, 40, 48, 56, 64, 80, 96, 128]:
        if gw % fw == 0 and gh % fh == 0:
            cols = gw // fw
            rows = gh // fh
            if 1 < cols * rows <= 50:
                best_layout = (fw, fh, cols, rows)
                break

if best_layout:
    fw, fh, cols, rows = best_layout
    print(f"  Detected: {cols}×{rows} grid of {fw}×{fh} frames")
    girl_frames = {}
    for row in range(rows):
        anim_name = ANIM_ORDER[row] if row < len(ANIM_ORDER) else f"row{row}"
        frames = []
        for col in range(cols):
            x, y = col * fw, row * fh
            frame = girl_im.crop((x, y, x + fw, y + fh))
            frames.append(frame.resize((FRAME_W, FRAME_H), Image.NEAREST))
        girl_frames[anim_name] = frames
    make_sheet(girl_frames, "girl")
else:
    print("  Could not detect frame layout, treating as single image")
    make_sheet({'idle': [girl_im.resize((FRAME_W, FRAME_H), Image.NEAREST)]}, "girl")

print("\n=== ALL DONE ===")
print(f"Output: {OUT}/")
for f in sorted(os.listdir(OUT)):
    print(f"  {f}")
