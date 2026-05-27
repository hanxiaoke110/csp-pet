"""
Process ALL confirmed 2D sprites into standardized sprite sheets.
Output: 200x200 frame sprite sheets + JSON metadata.
"""
import os, json, math
from PIL import Image
from collections import defaultdict

BASE = "/Users/hanliuliu/Desktop/学生成长计划/csp-chrome-ext/2d素材/_extracted"
OUT = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites/2d"
os.makedirs(OUT, exist_ok=True)

ANIM_ORDER = ["idle", "walk", "sleep", "celebrate", "think", "eat", "unhappy"]
FRAME_W, FRAME_H = 200, 200
MAX_FRAMES = 12


def make_sheet(frames_by_anim, name):
    """Standardized sprite sheet: 7 rows x MAX_FRAMES cols x 200x200 frames"""
    sheet = Image.new("RGBA", (MAX_FRAMES * FRAME_W, len(ANIM_ORDER) * FRAME_H), (0, 0, 0, 0))
    used = {}
    for ri, an in enumerate(ANIM_ORDER):
        frames = frames_by_anim.get(an, [])
        if not frames: continue
        used[an] = len(frames)
        for ci, f in enumerate(frames[:MAX_FRAMES]):
            fw, fh = f.size
            if fw != FRAME_W or fh != FRAME_H:
                s = min(FRAME_W / fw, FRAME_H / fh)
                nw, nh = int(fw * s), int(fh * s)
                rf = f.resize((nw, nh), Image.NEAREST)
                c = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
                c.paste(rf, ((FRAME_W - nw) // 2, (FRAME_H - nh) // 2), rf)
                sheet.paste(c, (ci * FRAME_W, ri * FRAME_H))
            else:
                sheet.paste(f, (ci * FRAME_W, ri * FRAME_H))
    path = os.path.join(OUT, f"{name}.png")
    sheet.save(path, "PNG")
    meta = {"name": name, "frameWidth": FRAME_W, "frameHeight": FRAME_H,
            "maxFrames": MAX_FRAMES, "anims": used, "animOrder": ANIM_ORDER}
    jpath = os.path.join(OUT, f"{name}.json")
    with open(jpath, "w") as f: json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"  {name}: {dict(used)}")
    return used


def split_strip(path, frame_h, horizontal=True):
    """Split a sprite strip into individual frames"""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    frames = []
    if horizontal:
        for x in range(0, w, frame_h):
            if x + frame_h <= w:
                frames.append(im.crop((x, 0, x + frame_h, h)))
    else:
        for y in range(0, h, frame_h):
            if y + frame_h <= h:
                frames.append(im.crop((0, y, w, y + frame_h)))
    return frames


# ═══════════════════════════════════════════
# 1. Otter (200x200 individual) — already processed, skip
# ═══════════════════════════════════════════

# ═══════════════════════════════════════════
# 2. 64x64 2D Character (e0653ee45436ea85)
# ═══════════════════════════════════════════
print("=== 64x64 2D Character ===")
d64 = os.path.join(BASE, "e0653ee45436ea85/64x64/2d")
f64 = defaultdict(list)
for fn in sorted(os.listdir(d64)):
    if not fn.endswith('.png') or fn == 'spritesheet.png': continue
    name = fn.replace('.png', '')
    anim = name.replace('attack', 'celebrate')  # attack → celebrate
    frames = split_strip(os.path.join(d64, fn), 64)
    f64[anim].extend(frames)
make_sheet(f64, "char64")


# ═══════════════════════════════════════════
# 3. 60px Character (cefb577a81186489)
# ═══════════════════════════════════════════
print("=== 60px Character ===")
d60 = os.path.join(BASE, "cefb577a81186489")
f60 = defaultdict(list)
mapping = {'idle-Sheet': 'idle', 'run-Sheet': 'walk', 'jump-Sheet': 'celebrate', 'wall_cling-Sheet': 'think'}
for fn in sorted(os.listdir(d60)):
    if not fn.endswith('.png'): continue
    name = fn.replace('.png', '')
    anim = mapping.get(name)
    if anim is None: continue
    frames = split_strip(os.path.join(d60, fn), 60)
    f60[anim].extend(frames)
make_sheet(f60, "char60")


# ═══════════════════════════════════════════
# 4. Ghost (83cb3d063636da46)
# ═══════════════════════════════════════════
print("=== Ghost ===")
gd = os.path.join(BASE, "83cb3d063636da46/Ghost-Character")
fg = defaultdict(list)
gm = {'Idle': 'idle', 'run': 'walk', 'jump': 'celebrate', 'Death': 'sleep'}
for fn in sorted(os.listdir(gd)):
    if not fn.endswith('.png') or fn.startswith('#'): continue
    name = fn.replace('.png', '').split('_')[0]
    anim = gm.get(name)
    if anim is None: continue
    fg[anim].append(Image.open(os.path.join(gd, fn)).convert("RGBA"))
make_sheet(fg, "ghost")


# ═══════════════════════════════════════════
# 5. TEDDY (8b0bdaecbd914f0c) - 450x523 → downscale to 200
# ═══════════════════════════════════════════
print("=== TEDDY ===")
td = os.path.join(BASE, "8b0bdaecbd914f0c")
ft = defaultdict(list)
tm = {
    '01-Idle/01-Idle': 'idle', '01-Idle/02-Idle_Blink': 'idle',
    '03-Walk/01-Walk': 'walk', '03-Walk/02-Walk_Happy': 'walk',
    '04-Run': 'walk', '06-Jump/01-Jump_Up': 'celebrate',
    '07-Hurt/01-Hurt': 'unhappy', '07-Hurt/02-Hurt_Dizzy': 'unhappy',
    '08-Dead': 'sleep',
}
for root, dirs, files in os.walk(td):
    for fn in sorted(files):
        if not fn.endswith('.png'): continue
        rel = os.path.relpath(root, td)
        anim = None
        for key, val in tm.items():
            if rel.endswith(key):
                anim = val; break
        if anim is None: continue
        ft[anim].append(Image.open(os.path.join(root, fn)).convert("RGBA"))
make_sheet(ft, "teddy")


# ═══════════════════════════════════════════
# 6. Zombie (d7aca6f00d03e95c) - 449x531 → downscale
# ═══════════════════════════════════════════
print("=== Zombie ===")
zd = os.path.join(BASE, "d7aca6f00d03e95c")
fz = defaultdict(list)
zm = {'02-Walk': 'walk', '01-Idle': 'idle', '03-Run': 'walk', '05-Attack': 'celebrate',
      '06-Hurt': 'unhappy', '07-Dead': 'sleep', '04-Jump': 'celebrate',
      '05-Jump_Attack': 'celebrate'}
# Find all animation dirs
for root, dirs, files in os.walk(zd):
    for fn in sorted(files):
        if not fn.endswith('.png'): continue
        rel = os.path.relpath(root, zd)
        anim = None
        for key, val in zm.items():
            if key in rel:
                anim = val; break
        if anim is None: continue
        fz[anim].append(Image.open(os.path.join(root, fn)).convert("RGBA"))
make_sheet(fz, "zombie")


# ═══════════════════════════════════════════
# 7. WhiteCat (32px) — already processed, keep existing
# ═══════════════════════════════════════════

# ═══════════════════════════════════════════
# 8. Knight (96px) — already processed, keep existing
# ═══════════════════════════════════════════

# ═══════════════════════════════════════════
# 9. CatPlayer (猫咪2, 32px) — already processed, keep existing
# ═══════════════════════════════════════════

# Regenerate the previously-processed ones from old script
print("\n=== Regenerating existing ===")

# Otter
print("  Otter...")
od = os.path.join(BASE, "52993edd9a3bd9eb")
fo = defaultdict(list)
for fn in sorted(os.listdir(od)):
    if not fn.endswith('.png'): continue
    p = fn.replace('.png','').split('_')
    an = 'idle'
    if 'jump' in fn or 'spin' in fn: an = 'celebrate'
    elif 'run' in fn: an = 'walk'
    elif 'sleep' in fn: an = 'sleep'
    fo[an].append(Image.open(os.path.join(od, fn)).convert("RGBA"))
make_sheet(fo, "otter")

# WhiteCat
print("  WhiteCat...")
wd = os.path.join(BASE, "b144676277e0ff3a")
fw = defaultdict(list)
wm = {'WhiteCatIdle': 'idle', 'WhiteCatRun': 'walk', 'WhiteCatRush': 'walk',
      'WhiteCatDamage': 'unhappy', 'WhiteCatDie': 'sleep'}
for fn in sorted(os.listdir(wd)):
    if not fn.endswith('.png'): continue
    nm = fn.replace('.png','')
    an = wm.get(nm)
    if an is None: continue
    frames = split_strip(os.path.join(wd, fn), 32, horizontal=False)
    fw[an].extend(frames)
make_sheet(fw, "whitecat")

# Knight
print("  Knight...")
kd = os.path.join(BASE, "2c48fcd4d96a0991/Knight")
fk = defaultdict(list)
km = {'idle': 'idle', 'Run': 'walk', 'Jump': 'celebrate', 'Death': 'sleep', 'Hit': 'unhappy'}
for fn in sorted(os.listdir(kd)):
    if not fn.endswith('.png'): continue
    nm = fn.replace('.png','')
    an = km.get(nm)
    if an is None: continue
    im = Image.open(os.path.join(kd, fn)).convert("RGBA")
    fh = im.size[1]
    frames = split_strip(os.path.join(kd, fn), fh)
    fk[an].extend(frames)
make_sheet(fk, "knight")

# CatPlayer
print("  CatPlayer...")
cd = os.path.join(BASE, "猫咪2/Cat_player/Cat_sheets")
fc = defaultdict(list)
cm = {'Cat_idle': 'idle', 'Cat_walk': 'walk', 'Cat_run': 'walk',
      'Cat_asleep': 'sleep', 'Cat_dead': 'sleep', 'Cat_jump': 'celebrate',
      'Cat_win_cheer': 'celebrate', 'Cat_hit': 'unhappy', 'Cat_ducking': 'think',
      'Cat_ducking_idle': 'think', 'Cat_landding': 'idle',
      'Cat_attack': 'celebrate', 'Cat_spining': 'celebrate',
      'Cat_ducking_move': 'walk', 'Cat_ladder': 'walk', 'Cat_fall': 'unhappy',
      'Cat_against_wall': 'think'}
for fn in sorted(os.listdir(cd)):
    if not fn.endswith('.png'): continue
    nm = fn.replace('.png','')
    an = None
    for k, v in cm.items():
        if nm.startswith(k): an = v; break
    if an is None: continue
    im = Image.open(os.path.join(cd, fn)).convert("RGBA")
    w, h_ = im.size
    if w == 32 and h_ == 32:
        fc[an].append(im)
    elif w > h_:
        fc[an].extend(split_strip(os.path.join(cd, fn), h_))
    else:
        fc[an].extend(split_strip(os.path.join(cd, fn), w, horizontal=False))
make_sheet(fc, "catplayer")

print(f"\n=== DONE ===")
print(f"Output: {OUT}/")
for f in sorted(os.listdir(OUT)):
    sz = os.path.getsize(os.path.join(OUT, f))
    print(f"  {f} ({sz/1024:.0f}KB)")

total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f"  Total: {total/1024:.0f}KB")
