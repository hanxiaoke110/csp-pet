"""
Generate 小玄仔 full evolution line (3 stages) + B-branch preview.
Shows what pure code generation can produce across the evolution spectrum.
"""
import math, os, json
from PIL import Image

FRAME_W, FRAME_H = 64, 64
BLOCK = 4  # px per block unit
TRANSPARENT = (0, 0, 0, 0)

# ─── Palette ───
# Stage 1 - Baby turtle
B1_SKIN      = (232,201,139)
B1_SKIN_DK   = (200,165,100)
B1_SKIN_LT   = (248,225,175)
B1_SHELL     = (90,143,60)
B1_SHELL_DK  = (60,105,40)
B1_SHELL_LT  = (120,175,80)
B1_ORE       = (200,170,70)
B1_ORE_LT    = (230,200,100)

# Stage 2A - 玄甲方块人 (diamond helmet warrior turtle-man)
S2A_SKIN     = (225,195,135)
S2A_SKIN_DK  = (195,160,95)
S2A_SKIN_LT  = (245,220,170)
S2A_ARMOR    = (55,120,140)     # diamond blue-gray
S2A_ARMOR_DK = (30,85,105)
S2A_ARMOR_LT = (85,160,185)
S2A_BOOTS    = (70,70,75)
S2A_WEAPON   = (180,175,170)    # pickaxe head
S2A_WEAPON_DK = (130,125,120)
S2A_STICK    = (160,120,80)     # handle

# Stage 3A - 深暗守卫者 (warden-inspired knight)
S3A_SKIN     = (180,200,210)    # pale blue-gray
S3A_SKIN_DK  = (140,160,175)
S3A_SKIN_LT  = (210,225,235)
S3A_ARMOR    = (25,50,70)       # deep dark blue
S3A_ARMOR_DK = (15,30,45)
S3A_ARMOR_LT = (45,80,110)
S3A_GLOW     = (100,220,255)    # cyan glow (soul core)
S3A_GLOW_LT  = (180,245,255)
S3A_ANTLER   = (60,80,95)       # antenna/sculk
S3A_ANTLER_LT = (120,200,180)   # sculk tip glow
S3A_EYES     = (255,255,255)    # glowing white eyes (no pupil - warden style)

# B-branch colors
S2B_GEAR     = (200,90,40)      # redstone orange
S2B_GEAR_LT  = (240,140,60)
S2B_GEAR_DK  = (140,50,20)
S2B_GOGGLE   = (100,180,200)    # redstone lamp glow

S3B_HAT      = (180,140,100)    # worker hat
S3B_OVERALL  = (60,80,130)      # denim overalls
S3B_OVERALL_DK = (40,55,100)
S3B_HAMMER   = (140,140,150)    # hammer head

# Common
EYE_W        = (255,255,255)
EYE_P        = (50,35,25)
EYE_HL       = (255,255,255)
MOUTH        = (100,60,35)
BLUSH        = (255,170,160)
OUT_DIR = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites"

os.makedirs(OUT_DIR, exist_ok=True)


def px(img, x, y, color):
    if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
        img.putpixel((x, y), color)


def fill(img, bx, by, bw, bh, color):
    for dy in range(bh * BLOCK):
        for dx in range(bw * BLOCK):
            px(img, bx * BLOCK + dx, by * BLOCK + dy, color)


def block(img, bx, by, bw, bh, color, dark=None, light=None):
    """Draw 3D-shaded block."""
    r, g, b = color
    dk = dark or (max(0, r - 30), max(0, g - 30), max(0, b - 30))
    lt = light or (min(255, r + 25), min(255, g + 25), min(255, b + 25))
    for dy in range(bh * BLOCK):
        for dx in range(bw * BLOCK):
            x, y = bx * BLOCK + dx, by * BLOCK + dy
            if dy == 0:
                px(img, x, y, lt)
            elif dy == bh * BLOCK - 1:
                px(img, x, y, dk)
            elif dx == bw * BLOCK - 1:
                px(img, x, y, dk)
            elif dx == 0:
                px(img, x, y, lt)
            else:
                px(img, x, y, color)


# ═══════════════════════════════════════════
# STAGE 1: 小玄仔 (Baby Turtle)
# ═══════════════════════════════════════════
def draw_baby(img, t):
    bounce = int(math.sin(t / 500 * math.pi * 2) * 1)
    base = 2 + bounce

    # Shadow
    for sx in range(12, 52):
        a = 20 - abs(sx - 32) * 2
        if a > 0:
            px(img, sx, 56, (0, 0, 0, a))

    # Tail nub
    fill(img, 2, 10 + base//2, 2, 2, B1_SHELL_DK)

    # Back legs (dark)
    fill(img, 4, 12 + base, 2, 3, B1_SKIN_DK)
    fill(img, 10, 12 + base, 2, 3, B1_SKIN_DK)

    # Shell (rounded green dome)
    fill(img, 3, 8 + base, 1, 1, B1_SHELL_LT)
    fill(img, 12, 8 + base, 1, 1, B1_SHELL_LT)
    fill(img, 2, 9 + base, 14, 1, B1_SHELL_LT)
    fill(img, 1, 10 + base, 14, 1, B1_SHELL)
    fill(img, 1, 11 + base, 14, 1, B1_SHELL)
    fill(img, 1, 12 + base, 14, 1, B1_SHELL_DK)
    # Shell rim
    fill(img, 2, 13 + base, 12, 1, (55, 95, 35))

    # Ore spots on shell
    for ox, oy in [(4, 10), (9, 10), (7, 11)]:
        fill(img, ox, oy + base, 1, 1, B1_ORE_LT)
        fill(img, ox, oy + 1 + base, 1, 1, B1_ORE)

    # Front legs
    fill(img, 4, 13 + base, 2, 3, B1_SKIN)
    fill(img, 10, 13 + base, 2, 3, B1_SKIN)
    fill(img, 4, 15 + base, 2, 1, B1_SKIN_DK)
    fill(img, 10, 15 + base, 2, 1, B1_SKIN_DK)

    # HEAD (big for baby proportion)
    hx, hy = 4, 3 + base
    fill(img, hx + 1, hy, 6, 1, B1_SKIN_LT)
    fill(img, hx, hy + 1, 8, 4, B1_SKIN)
    fill(img, hx + 1, hy + 5, 6, 1, B1_SKIN_DK)

    # Eyes (big for baby - 3x3 whites)
    ey = hy + 1
    fill(img, hx + 1, ey, 3, 3, EYE_W)
    fill(img, hx + 4, ey, 3, 3, EYE_W)
    # Pupils
    fill(img, hx + 2, ey + 1, 2, 2, EYE_P)
    fill(img, hx + 5, ey + 1, 2, 2, EYE_P)
    # Catchlight
    px(img, (hx + 2) * BLOCK, (ey + 1) * BLOCK, EYE_HL)
    px(img, (hx + 5) * BLOCK, (ey + 1) * BLOCK, EYE_HL)

    # Smile
    fill(img, hx + 3, hy + 4, 2, 1, MOUTH)

    # Blush
    fill(img, hx, hy + 3, 1, 1, BLUSH)
    fill(img, hx + 7, hy + 3, 1, 1, BLUSH)


# ═══════════════════════════════════════════
# STAGE 2A: 玄甲方块人 (Diamond Helmet Warrior)
# ═══════════════════════════════════════════
def draw_growth_a(img, t):
    bounce = int(math.sin(t / 500 * math.pi * 2) * 1)
    base = 1 + bounce

    # Shadow
    for sx in range(8, 56):
        a = 25 - abs(sx - 32) * 2
        if a > 0:
            px(img, sx, 58, (0, 0, 0, a))

    # Legs (standing, armored boots)
    fill(img, 5, 12 + base, 2, 4, S2A_SKIN_DK)
    fill(img, 9, 12 + base, 2, 4, S2A_SKIN_DK)
    # Boots
    fill(img, 4, 14 + base, 3, 2, S2A_BOOTS)
    fill(img, 9, 14 + base, 3, 2, S2A_BOOTS)

    # Shell vestige (smaller shell on back, like a backpack)
    fill(img, 2, 8 + base, 2, 4, B1_SHELL)
    fill(img, 12, 8 + base, 2, 4, B1_SHELL)
    fill(img, 3, 7 + base, 10, 1, B1_SHELL)
    fill(img, 3, 8 + base, 10, 1, B1_SHELL_LT)
    fill(img, 3, 11 + base, 10, 1, B1_SHELL_DK)

    # BODY (upright, wearing armor)
    body_x, body_y = 4, 6 + base
    # Torso (skin-tight with armor plates)
    fill(img, body_x, body_y, 1, 6, S2A_SKIN)
    fill(img, body_x + 1, body_y, 6, 1, S2A_ARMOR_LT)  # chestplate top
    fill(img, body_x + 1, body_y + 1, 6, 4, S2A_ARMOR)  # chestplate
    fill(img, body_x + 1, body_y + 5, 6, 1, S2A_ARMOR_DK)  # belt
    fill(img, body_x + 7, body_y, 1, 6, S2A_SKIN)

    # Arms
    arm_y = body_y
    # Left arm (holding pickaxe)
    fill(img, 2, arm_y + 1, 2, 5, S2A_SKIN)
    fill(img, 2, arm_y + 1, 2, 1, S2A_ARMOR_LT)  # shoulder pad
    # Right arm
    fill(img, 12, arm_y + 1, 2, 5, S2A_SKIN)
    fill(img, 12, arm_y + 1, 2, 1, S2A_ARMOR_LT)

    # Pickaxe (held in left hand)
    pick_y = arm_y
    fill(img, 0, pick_y + 1, 2, 1, S2A_WEAPON)
    fill(img, 0, pick_y + 2, 2, 1, S2A_WEAPON_DK)
    fill(img, 1, pick_y + 2, 1, 5, S2A_STICK)  # handle

    # HEAD (bigger, wearing diamond helmet)
    hx, hy = 4, 1 + base
    # Helmet (covers head)
    fill(img, hx - 1, hy, 10, 1, S2A_ARMOR_LT)
    fill(img, hx - 1, hy + 1, 10, 4, S2A_ARMOR)
    fill(img, hx - 1, hy + 5, 10, 1, S2A_ARMOR_DK)
    # Face visible through helmet opening
    fill(img, hx + 1, hy + 2, 6, 3, S2A_SKIN)

    # Eyes (more determined, smaller than baby)
    ey = hy + 2
    fill(img, hx + 2, ey, 2, 2, EYE_W)
    fill(img, hx + 4, ey, 2, 2, EYE_W)
    px(img, (hx + 2) * BLOCK + 2, (ey) * BLOCK + 2, EYE_P)
    px(img, (hx + 4) * BLOCK + 2, (ey) * BLOCK + 2, EYE_P)
    px(img, (hx + 2) * BLOCK + 2, (ey) * BLOCK + 2, EYE_HL)
    px(img, (hx + 4) * BLOCK + 2, (ey) * BLOCK + 2, EYE_HL)

    # Determined mouth
    fill(img, hx + 3, hy + 3, 2, 1, MOUTH)


# ═══════════════════════════════════════════
# STAGE 3A: 深暗守卫者 (Warden Knight - Full Form)
# ═══════════════════════════════════════════
def draw_final_a(img, t):
    bounce = int(math.sin(t / 400 * math.pi * 2) * 0.5)
    base = 0 + bounce

    # Shadow
    for sx in range(8, 56):
        a = 30 - abs(sx - 32) * 2
        if a > 0:
            px(img, sx, 60, (0, 0, 0, a))

    # Legs (armored, taller)
    fill(img, 5, 13 + base, 2, 3, S3A_ARMOR_DK)
    fill(img, 9, 13 + base, 2, 3, S3A_ARMOR_DK)
    # Armored boots
    fill(img, 4, 15 + base, 4, 1, S3A_ARMOR)
    fill(img, 8, 15 + base, 4, 1, S3A_ARMOR)

    # BODY (upright knight, full armor)
    bx, by = 4, 7 + base
    # Dark armor torso
    fill(img, bx, by, 1, 7, S3A_ARMOR_DK)
    fill(img, bx + 1, by, 6, 1, S3A_ARMOR_LT)
    fill(img, bx + 1, by + 1, 6, 5, S3A_ARMOR)
    # Soul core (glowing cyan in chest center)
    fill(img, bx + 3, by + 2, 2, 2, S3A_GLOW)
    fill(img, bx + 3, by + 2, 1, 1, S3A_GLOW_LT)
    # Belt
    fill(img, bx + 1, by + 6, 6, 1, S3A_ARMOR_DK)
    fill(img, bx + 7, by, 1, 7, S3A_ARMOR_DK)

    # Arms (armored)
    ay = by
    fill(img, 2, ay + 1, 2, 5, S3A_ARMOR)
    fill(img, 2, ay + 1, 2, 1, S3A_ARMOR_LT)
    fill(img, 12, ay + 1, 2, 5, S3A_ARMOR)
    fill(img, 12, ay + 1, 2, 1, S3A_ARMOR_LT)
    # Hands (pale skin visible)
    fill(img, 2, ay + 6, 2, 1, S3A_SKIN)
    fill(img, 12, ay + 6, 2, 1, S3A_SKIN)

    # Cloak/cape (behind, dark)
    fill(img, 3, by + 2, 1, 5, (20, 35, 50))
    fill(img, 12, by + 2, 1, 5, (20, 35, 50))

    # Shell vestige (small, on back as pauldron material)
    fill(img, 1, by, 2, 3, B1_SHELL_DK)
    fill(img, 13, by, 2, 3, B1_SHELL_DK)

    # HEAD (humanoid, warden-inspired helmet)
    hx, hy = 4, 0 + base
    # Antenna/sensors (sculk-like, on helmet sides)
    fill(img, hx - 2, hy + 3, 2, 1, S3A_ANTLER)
    fill(img, hx - 2, hy + 2, 1, 1, S3A_ANTLER_LT)
    fill(img, hx + 8, hy + 3, 2, 1, S3A_ANTLER)
    fill(img, hx + 9, hy + 2, 1, 1, S3A_ANTLER_LT)

    # Full helmet
    fill(img, hx - 1, hy, 10, 1, S3A_ARMOR_LT)
    fill(img, hx - 1, hy + 1, 10, 5, S3A_ARMOR)
    fill(img, hx - 1, hy + 6, 10, 1, S3A_ARMOR_DK)

    # Face (pale skin visible in helmet opening)
    fill(img, hx + 1, hy + 2, 6, 3, S3A_SKIN)

    # Eyes (WARDEN STYLE - glowing white, no pupil)
    ey = hy + 3
    fill(img, hx + 2, ey, 2, 1, S3A_GLOW)
    fill(img, hx + 4, ey, 2, 1, S3A_GLOW)

    # Mouth (hidden behind helmet visor)
    fill(img, hx + 3, hy + 5, 2, 1, S3A_ARMOR_DK)

    # Soul particles floating
    for i in range(3):
        sx = 32 + int(math.cos(t / 350 + i * 2.1) * 16)
        sy = by + int(math.sin(t / 350 + i * 2.1) * 12)
        px(img, sx, sy, S3A_GLOW)
        px(img, sx + 1, sy, S3A_GLOW_LT)


# ═══════════════════════════════════════════
# Generate comparison sheet: all 3 stages side by side
# ═══════════════════════════════════════════
def draw_label(img, text, x, y):
    """Simple pixel text - just marks position"""
    pass  # We'll add labels in the composited image

STAGES = [
    ("S1_幼年体_小玄仔", draw_baby, "Baby: Animal form, 4 legs, big head, green shell"),
    ("S2A_成长体_玄甲方块人", draw_growth_a, "Growth: Stands up, diamond helmet, armor, pickaxe"),
    ("S3A_完全体_深暗守卫者", draw_final_a, "Final: Humanoid knight, warden helmet, soul core, cape"),
]

# Single-frame portrait for each stage
portraits = []
for name, draw_fn, desc in STAGES:
    img = Image.new("RGBA", (FRAME_W, FRAME_H), TRANSPARENT)
    draw_fn(img, 0)  # t=0 for neutral idle
    portraits.append(img)
    path = os.path.join(OUT_DIR, f"{name}.png")
    img.save(path)
    print(f"  {name} -> {path}")

# ─── Composite comparison image ───
COMP_W = FRAME_W * 3 + 40
COMP_H = FRAME_H + 80
comp = Image.new("RGBA", (COMP_W, COMP_H), (30, 30, 35, 255))

for i, (name, _, desc) in enumerate(STAGES):
    x = 20 + i * (FRAME_W + 4)
    y = 10
    comp.paste(portraits[i], (x, y), portraits[i])

# Arrow between stages
from PIL import ImageDraw
draw = ImageDraw.Draw(comp)
arrow_y = FRAME_H // 2 + 10
for i in range(2):
    ax = 20 + i * (FRAME_W + 4) + FRAME_W + 2
    draw.polygon([
        (ax, arrow_y), (ax + 10, arrow_y - 8), (ax + 10, arrow_y + 8)
    ], fill=(255, 200, 80))

# Labels
# We'll add labels as pixels since PIL default font is basic
label_texts = ["幼年体 · 小玄仔", "成长体A · 玄甲方块人", "完全体A · 深暗守卫者"]
label_colors = [(120,200,120), (100,180,230), (100,160,255)]

for i, (txt, lc) in enumerate(zip(label_texts, label_colors)):
    lx = 20 + i * (FRAME_W + 4)
    ly = FRAME_H + 20
    # Simple colored bar as label indicator
    for dx in range(FRAME_W):
        for dy in range(4):
            px(comp, lx + dx, ly + dy, lc)
    # Stage number
    fill(comp, lx // BLOCK + 1, ly // BLOCK + 1, 1, 1, (255, 255, 255))

comp_path = os.path.join(OUT_DIR, "xuanzai_evolution_line.png")
comp.save(comp_path)
print(f"\nEvolution line: {comp_path}")

# Also generate individual 8x enlarged previews
for name, _, _ in STAGES:
    img = Image.open(os.path.join(OUT_DIR, f"{name}.png"))
    big = img.resize((FRAME_W * 8, FRAME_H * 8), Image.NEAREST)
    big_path = os.path.join(OUT_DIR, f"{name}_8x.png")
    big.save(big_path)

print("\nDone! Open the comparison:")
print(f"  open {comp_path}")
