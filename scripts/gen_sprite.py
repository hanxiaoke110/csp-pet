"""
Improved pixel art sprite generator for 小玄仔 (Baby Turtle, Earth element).
Design principles from Pokémon + Minecraft baby mobs:
- Chibi proportions: big head, small body
- 3-4 color palette + accents
- Large expressive eyes with catchlights
- Clear silhouette, stubby limbs
- Soft rounded block shapes
"""
import math, os, json
from PIL import Image

FRAME_W, FRAME_H = 64, 64
BLOCK = 4  # px per "block unit"
HW, HH = FRAME_W // BLOCK, FRAME_H // BLOCK  # 16x16 grid

ANIMS = {
    "idle": 6,
    "walk": 8,
    "sleep": 4,
    "celebrate": 8,
    "think": 4,
    "eat": 4,
    "unhappy": 4,
}
ANIM_ORDER = ["idle", "walk", "sleep", "celebrate", "think", "eat", "unhappy"]
MAX_COLS = max(ANIMS.values())
NUM_ROWS = len(ANIM_ORDER)

SHEET_W = MAX_COLS * FRAME_W
SHEET_H = NUM_ROWS * FRAME_H

OUT_DIR = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites"
os.makedirs(OUT_DIR, exist_ok=True)

# ─── Color Palette (warm, appealing earth tones) ───
SKIN       = (232, 201, 139)  # warm sand
SKIN_DARK  = (200, 165, 100)  # shadow side
SKIN_LIGHT = (248, 225, 175)  # highlight
SHELL      = (90, 143, 60)    # forest green
SHELL_DARK = (60, 105, 40)    # shell shadow
SHELL_LT   = (120, 175, 80)   # shell highlight
SHELL_RIM  = (75, 120, 50)    # shell edge
ORE        = (200, 170, 70)   # gold ore vein
ORE_LT     = (230, 200, 100)  # ore highlight
EYE_W      = (255, 255, 255)  # eye white
EYE_P      = (50, 35, 25)     # pupil
EYE_HL     = (255, 255, 255)  # eye catchlight
MOUTH      = (100, 60, 35)    # mouth line
BLUSH      = (255, 170, 160, 180)  # blush (semi-transparent)
BELLY      = (245, 235, 210)  # underbelly
TAIL_C     = (210, 180, 130)  # tail
LEG_DARK   = (175, 140, 100)  # leg shadow
OUTLINE    = (40, 30, 20)     # outline (used sparingly)
SHADOW     = (0, 0, 0, 40)    # ground shadow
PARTICLE   = (255, 220, 100)  # sparkle/particle

TRANSPARENT = (0, 0, 0, 0)


def px(img, x, y, color):
    """Set pixel if in bounds. Color can be 3-tuple (RGB) or 4-tuple (RGBA)."""
    if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
        if len(color) == 4:
            r, g, b, a = color
            existing = img.getpixel((x, y))
            ea = existing[3] if len(existing) == 4 else 255
            # Alpha blend
            blend_a = a / 255
            nr = int(r * blend_a + existing[0] * (1 - blend_a))
            ng = int(g * blend_a + existing[1] * (1 - blend_a))
            nb = int(b * blend_a + existing[2] * (1 - blend_a))
            img.putpixel((x, y), (nr, ng, nb, 255))
        else:
            img.putpixel((x, y), (*color, 255))
    # silently ignore out-of-bounds


def fill_rect(img, x, y, w, h, color):
    """Fill a rectangle in block units."""
    for dx in range(w * BLOCK):
        for dy in range(h * BLOCK):
            px(img, x * BLOCK + dx, y * BLOCK + dy, color)


def block_3d(img, bx, by, bw, bh, color, lighten_top=True):
    """Draw a block with 3D shading: lighter top/left, darker bottom/right."""
    r, g, b = color
    dark = (max(0, r - 35), max(0, g - 35), max(0, b - 35))
    light = (min(255, r + 30), min(255, g + 30), min(255, b + 30))
    for dy in range(bh * BLOCK):
        for dx in range(bw * BLOCK):
            px_img = bx * BLOCK + dx
            py_img = by * BLOCK + dy
            if dy == 0 and lighten_top:
                px(img, px_img, py_img, light)
            elif dy == bh * BLOCK - 1:
                px(img, px_img, py_img, dark)
            elif dx == bw * BLOCK - 1:
                px(img, px_img, py_img, dark)
            elif dx == 0:
                px(img, px_img, py_img, light)
            else:
                px(img, px_img, py_img, color)


def round_block_3d(img, bx, by, bw, bh, color):
    """3D block with rounded corners (omit corner pixels)."""
    r, g, b = color
    dark = (max(0, r - 35), max(0, g - 35), max(0, b - 35))
    light = (min(255, r + 30), min(255, g + 30), min(255, b + 30))
    for dy in range(bh * BLOCK):
        for dx in range(bw * BLOCK):
            px_img = bx * BLOCK + dx
            py_img = by * BLOCK + dy
            # Skip extreme corners for rounded look
            corner_dist = (1 if dx < BLOCK//2 else 0) + (1 if dy < BLOCK//2 else 0) + \
                          (1 if dx >= bw*BLOCK - BLOCK//2 else 0) + (1 if dy >= bh*BLOCK - BLOCK//2 else 0)
            if corner_dist >= 3:
                continue  # skip far corners
            if dy == 0:
                px(img, px_img, py_img, light)
            elif dy == bh * BLOCK - 1:
                px(img, px_img, py_img, dark)
            elif dx == bw * BLOCK - 1:
                px(img, px_img, py_img, dark)
            elif dx == 0:
                px(img, px_img, py_img, light)
            else:
                px(img, px_img, py_img, color)


# ─── Character: 小玄仔 (Baby Turtle) ───
def draw_xuanzai(img, frame_idx, anim, t):
    """
    Grid layout (16x16 blocks):

    Row 0-1:  (empty / sparkles)
    Row 2-5:  HEAD (big, 6w x 5h, centered)
    Row 6-7:  neck / body transition
    Row 8-12: SHELL (8w x 5h, wider than head)
    Row 13:   underbelly
    Row 14-15: LEGS + TAIL
    """
    # Animation base position
    bounce = 0
    head_tilt = 0
    if anim == "idle":
        bounce = int(math.sin(t / 500 * math.pi * 2) * 1.0)
    elif anim == "walk":
        bounce = int(abs(math.sin(t / 180 * math.pi * 2)) * 2.5)
    elif anim == "celebrate":
        bounce = int(abs(math.sin(t / 220 * math.pi * 2)) * 4)

    # ─── Shadow ───
    shadow_y = 14 * BLOCK
    for sx in range(3 * BLOCK, 13 * BLOCK):
        alpha = 30 - abs(sx - 8 * BLOCK) * 3
        if alpha > 0:
            for sy in range(shadow_y, shadow_y + 2):
                px(img, sx, sy, (0, 0, 0, alpha))

    # Base Y position
    base_y = BLOCK + bounce

    # ─── TAIL (tiny nub behind) ───
    tail_x, tail_y = 1, 10
    fill_rect(img, tail_x, tail_y + bounce//2, 2, 2, TAIL_C)
    # tail tip darker
    fill_rect(img, tail_x, tail_y + 1 + bounce//2, 1, 1, SKIN_DARK)

    # ─── BACK LEGS (darker, behind body) ───
    leg_bottom = 13 * BLOCK + bounce
    fill_rect(img, 3, 13, 2, 2, LEG_DARK)
    fill_rect(img, 11, 13, 2, 2, LEG_DARK)

    # ─── SHELL (main body, green dome) ───
    # Shell is the turtle's iconic feature - rounded green dome
    shell_top = 8 * BLOCK + bounce
    # Rounded top of shell
    fill_rect(img, 3, 8, 1, 1, SHELL_LT)
    fill_rect(img, 12, 8, 1, 1, SHELL_LT)
    fill_rect(img, 2, 9, 1, 1, SHELL_LT)
    fill_rect(img, 13, 9, 1, 1, SHELL_LT)

    # Main shell body
    fill_rect(img, 1, 9, 14, 1, SHELL_LT)  # top highlight row
    fill_rect(img, 1, 10, 14, 2, SHELL)     # middle rows
    fill_rect(img, 1, 12, 14, 1, SHELL_DARK) # bottom shadow row

    # Shell rim (bottom edge border)
    fill_rect(img, 2, 13, 12, 1, SHELL_RIM)

    # Gold ore veins on shell (3 small spots)
    ore_patterns = [(4, 10), (9, 10), (7, 11)]
    for ox, oy in ore_patterns:
        fill_rect(img, ox, oy, 1, 1, ORE_LT)
        fill_rect(img, ox, oy + 1, 1, 1, ORE)

    # Shell scute lines (hexagonal pattern lines)
    for lx in [5, 8, 11]:
        fill_rect(img, lx, 10, 1, 1, SHELL_DARK)

    # ─── FRONT LEGS ───
    # Left front leg
    l_leg_x = 3
    if anim == "walk":
        l_leg_x += int(math.sin(t / 180 * math.pi * 2) * 1.5)
    fill_rect(img, l_leg_x, 13, 2, 3, SKIN)
    fill_rect(img, l_leg_x, 15, 2, 1, SKIN_DARK)  # darker feet

    # Right front leg
    r_leg_x = 11
    if anim == "walk":
        r_leg_x -= int(math.sin(t / 180 * math.pi * 2) * 1.5)
    fill_rect(img, r_leg_x, 13, 2, 3, SKIN)
    fill_rect(img, r_leg_x, 15, 2, 1, SKIN_DARK)

    # ─── HEAD (big cute head, the focal point) ───
    # Head: 7w x 6h block, positioned above shell, centered
    head_x, head_y = 4, 3 * BLOCK + bounce + head_tilt
    head_w, head_h = 8, 5  # in blocks

    # Head base (rounded top corners)
    fill_rect(img, head_x + 1, head_y, head_w - 2, 1, SKIN_LIGHT)  # top (flat part)
    fill_rect(img, head_x, head_y + 1, head_w, head_h - 1, SKIN)   # main head

    # Head top round corners
    for cx, cy in [(head_x, head_y), (head_x + head_w - 1, head_y)]:
        fill_rect(img, cx, cy, 1, 1, SKIN_LIGHT)

    # Head bottom chin (slightly narrower for roundness)
    fill_rect(img, head_x + 1, head_y + head_h, head_w - 2, 1, SKIN_DARK)

    # ─── EYES (large, expressive - MOST IMPORTANT) ───
    eye_y = head_y + BLOCK + BLOCK//2  # 1 block down from head top

    # Left eye: 3w x 3h white + 2x2 pupil + catchlight
    l_eye_x = head_x + BLOCK
    eye_w, eye_h = 3, 3  # blocks for each eye

    # Eye whites
    fill_rect(img, l_eye_x // BLOCK, eye_y // BLOCK, eye_w, eye_h, EYE_W)
    # Right eye
    r_eye_x = head_x + 4 * BLOCK
    fill_rect(img, r_eye_x // BLOCK, eye_y // BLOCK, eye_w, eye_h, EYE_W)

    # Pupils (2x2 blocks, dark)
    pupil_ox = BLOCK // 2  # offset within eye block
    px(img, l_eye_x + pupil_ox, eye_y + pupil_ox, EYE_P)
    px(img, l_eye_x + pupil_ox + BLOCK, eye_y + pupil_ox, EYE_P)
    px(img, l_eye_x + pupil_ox, eye_y + pupil_ox + BLOCK, EYE_P)
    px(img, l_eye_x + pupil_ox + BLOCK, eye_y + pupil_ox + BLOCK, EYE_P)

    px(img, r_eye_x + pupil_ox, eye_y + pupil_ox, EYE_P)
    px(img, r_eye_x + pupil_ox + BLOCK, eye_y + pupil_ox, EYE_P)
    px(img, r_eye_x + pupil_ox, eye_y + pupil_ox + BLOCK, EYE_P)
    px(img, r_eye_x + pupil_ox + BLOCK, eye_y + pupil_ox + BLOCK, EYE_P)

    # Catchlights (1px white dot in upper-left of pupil)
    px(img, l_eye_x + pupil_ox, eye_y + pupil_ox, EYE_HL)
    px(img, r_eye_x + pupil_ox, eye_y + pupil_ox, EYE_HL)

    # ─── ANIMATION-SPECIFIC EYE/MOUTH MODS ───

    if anim == "sleep":
        # Closed eyes = horizontal lines over eye area
        l_ex = l_eye_x // BLOCK
        r_ex = r_eye_x // BLOCK
        ey = eye_y // BLOCK + 1
        fill_rect(img, l_ex, ey, eye_w, 1, EYE_P)
        fill_rect(img, r_ex, ey, eye_w, 1, EYE_P)

    elif anim == "unhappy":
        # Droopy eyebrows
        fill_rect(img, l_eye_x // BLOCK, eye_y // BLOCK - 1, eye_w, 1, EYE_P)
        fill_rect(img, r_eye_x // BLOCK, eye_y // BLOCK - 1, eye_w, 1, EYE_P)
        # Sad mouth
        fill_rect(img, head_x + 3, head_y + head_h - 1, 3, 1, MOUTH)

    elif anim == "celebrate":
        # Bigger, sparklier eyes - star-shaped catchlights
        # (keep normal eyes but add sparkles around)
        for i in range(3):
            sx = head_x * BLOCK + int(math.cos(t / 300 + i * 2) * 18) + 30
            sy = head_y - 8 + int(math.sin(t / 300 + i * 2) * 12)
            px(img, sx, sy, PARTICLE)
            px(img, sx + 1, sy, PARTICLE)
            px(img, sx, sy + 1, PARTICLE)
            px(img, sx - 1, sy, PARTICLE)
            px(img, sx, sy - 1, PARTICLE)

    # ─── MOUTH ───
    if anim not in ("sleep", "unhappy"):
        mouth_y = head_y + head_h * BLOCK - BLOCK - BLOCK//2
        if anim == "celebrate":
            # Wide happy smile
            for mx in range(head_x * BLOCK + 2 * BLOCK, head_x * BLOCK + 6 * BLOCK):
                px(img, mx, mouth_y, MOUTH)
            px(img, head_x * BLOCK + BLOCK + BLOCK//2, mouth_y - BLOCK//2, MOUTH)
            px(img, head_x * BLOCK + 6 * BLOCK - BLOCK//2, mouth_y - BLOCK//2, MOUTH)
        else:
            # Small cute smile
            for mx in range(head_x * BLOCK + 3 * BLOCK, head_x * BLOCK + 5 * BLOCK):
                px(img, mx, mouth_y, MOUTH)

    # ─── BLUSH (cute pink cheeks under eyes) ───
    if anim not in ("unhappy",):
        blush_y = eye_y + 3 * BLOCK
        for bx in range(2):
            for by in range(2):
                px(img, l_eye_x + BLOCK//2 + bx, blush_y + by, BLUSH)
                px(img, r_eye_x + 2*BLOCK + BLOCK//2 + bx, blush_y + by, BLUSH)

    # ─── THINK BUBBLE ───
    if anim == "think":
        bx = head_x * BLOCK + 9 * BLOCK
        by = head_y - BLOCK + int(math.sin(t / 700 * math.pi * 2) * 2)
        for bi, (ox, oy, r) in enumerate([(0, 0, 2), (5, -6, 3), (10, -14, 4)]):
            cx_b = bx + ox
            cy_b = by + oy
            for dx in range(-r * BLOCK, (r + 1) * BLOCK):
                for dy in range(-r * BLOCK, (r + 1) * BLOCK):
                    if dx*dx + dy*dy < r*r * BLOCK * BLOCK // 2:
                        px(img, cx_b + dx, cy_b + dy, (210, 220, 235))

    # ─── Zzz ───
    if anim == "sleep":
        zx = head_x * BLOCK + 8 * BLOCK + int(math.sin(t / 800 * math.pi * 2) * 3)
        zy = head_y - 2 * BLOCK + int(math.sin(t / 800 * math.pi * 2) * 3)
        for zi, (dzx, dzy, size) in enumerate([(0, 0, 6), (5, -6, 8), (12, -14, 10)]):
            for dx in range(-size, size + 1):
                for dy in range(-size, size + 1):
                    if dx*dx + dy*dy < size*size // 2:
                        px(img, zx + dzx + dx, zy + dzy + dy, (140, 180, 210))

    # ─── FOOD (eating) ───
    if anim == "eat":
        food_x = head_x * BLOCK + 2 * BLOCK
        food_y = head_y + head_h * BLOCK + int(math.sin(t / 120 * math.pi * 2) * 3)
        # Green leaf
        for fx in range(4):
            for fy in range(4):
                if fx + fy >= 2:
                    px(img, food_x + fx, food_y + fy, (80, 180, 60))
        # Leaf stem
        px(img, food_x + 4, food_y + 1, (60, 140, 40))
        px(img, food_x + 4, food_y + 2, (60, 140, 40))


# ─── Generate sheet ───
sheet = Image.new("RGBA", (SHEET_W, SHEET_H), TRANSPARENT)

for row_idx, anim_name in enumerate(ANIM_ORDER):
    num_frames = ANIMS[anim_name]
    for f in range(num_frames):
        frame = Image.new("RGBA", (FRAME_W, FRAME_H), TRANSPARENT)
        t = f * 120
        draw_xuanzai(frame, f, anim_name, t)
        sheet.paste(frame, (f * FRAME_W, row_idx * FRAME_H))

# Save
path = os.path.join(OUT_DIR, "xuanzai_stage1.png")
sheet.save(path, "PNG")
print(f"Saved: {path} ({SHEET_W}x{SHEET_H})")

# Preview
preview = sheet.crop((0, 0, FRAME_W, FRAME_H))
preview = preview.resize((FRAME_W * 8, FRAME_H * 8), Image.NEAREST)
preview_path = os.path.join(OUT_DIR, "xuanzai_stage1_preview.png")
preview.save(preview_path)
print(f"Preview: {preview_path}")

# JSON metadata
json_path = os.path.join(OUT_DIR, "xuanzai_stage1.json")
with open(json_path, "w") as f:
    json.dump({
        "formId": "xuanzai_stage1",
        "name": "小玄仔",
        "frameWidth": FRAME_W, "frameHeight": FRAME_H,
        "anims": ANIMS, "animOrder": ANIM_ORDER,
    }, f, ensure_ascii=False, indent=2)
print("Done!")
