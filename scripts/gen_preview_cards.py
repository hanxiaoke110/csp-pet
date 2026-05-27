"""Generate Chinese-name preview cards for ALL pets and fix everything."""
from PIL import Image, ImageDraw, ImageFont
import os, json

OUT = "/Users/hanliuliu/Desktop/学生成长计划/csp-desktop-pet/public/pet-sprites/previews"
os.makedirs(OUT, exist_ok=True)

# Try to load a Chinese font
FONT_PATH = None
for fp in ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Light.ttc",
           "/System/Library/Fonts/Hiragino Sans GB.ttc", "/Library/Fonts/Arial Unicode.ttf"]:
    if os.path.exists(fp):
        FONT_PATH = fp; break

def get_font(size):
    try: return ImageFont.truetype(FONT_PATH, size) if FONT_PATH else ImageFont.load_default()
    except: return ImageFont.load_default()

COLORS = {
    'earth': (139, 119, 80), 'fire': (220, 100, 60),
    'wind': (100, 180, 140), 'water': (80, 140, 220),
    'light': (200, 180, 100),
}

def make_card(filename, name, type_label, color=(150,150,200)):
    """Nice preview card with Chinese name"""
    im = Image.new("RGBA", (200, 200), (0,0,0,0))
    draw = ImageDraw.Draw(im)
    # Background with rounded corners
    r, g, b = color
    draw.rounded_rectangle([(8,8), (192,192)], radius=16, fill=(r, g, b, 255))
    lighter = (min(255,r+30), min(255,g+30), min(255,b+30))
    draw.rounded_rectangle([(20,20), (180,130)], radius=12, fill=(*lighter, 255))

    # Type badge
    bg = (255,255,255,200) if type_label == '3D' else (255,255,255,200)
    draw.rounded_rectangle([(65,35), (135,65)], radius=8, fill=bg)
    font_sm = get_font(14)
    draw.text((100, 50), type_label, fill=(80,80,100,255), anchor="mm", font=font_sm)

    # Emoji
    font_emoji = get_font(36)
    draw.text((100, 95), name[0] if len(name) == 1 else '✨', fill=(255,255,255,255), anchor="mm", font=font_emoji)

    # Chinese name
    font_name = get_font(18)
    draw.text((100, 150), name, fill=(255,255,255,255), anchor="mm", font=font_name)
    font_info = get_font(12)
    draw.text((100, 175), type_label, fill=(255,255,255,180), anchor="mm", font=font_info)

    im.save(os.path.join(OUT, filename))
    return filename

# ─── 3D Cube Pets (Chinese names) ───
cube_pets_cn = {
    'animal-bee': ('小蜜蜂', 'fire'),
    'animal-bunny': ('小兔子', 'earth'),
    'animal-cat': ('小猫咪', 'fire'),
    'animal-caterpillar': ('毛毛虫', 'wind'),
    'animal-chick': ('小鸡仔', 'fire'),
    'animal-cow': ('小奶牛', 'earth'),
    'animal-crab': ('小螃蟹', 'water'),
    'animal-deer': ('小鹿', 'earth'),
    'animal-dog': ('小狗狗', 'fire'),
    'animal-elephant': ('小象', 'earth'),
    'animal-fish': ('小鱼', 'water'),
    'animal-fox': ('小赤狐', 'earth'),
    'animal-giraffe': ('长颈鹿', 'earth'),
    'animal-hog': ('小野猪', 'earth'),
    'animal-koala': ('考拉', 'earth'),
    'animal-lion': ('小狮子', 'fire'),
    'animal-monkey': ('小猴子', 'earth'),
    'animal-panda': ('熊猫', 'earth'),
    'animal-parrot': ('小鹦鹉', 'wind'),
    'animal-penguin': ('小冰企', 'water'),
    'animal-pig': ('小猪', 'earth'),
    'animal-polar': ('北极熊', 'water'),
    'animal-tiger': ('小老虎', 'fire'),
    'animal-beaver': ('小河狸', 'water'),
}

for species_id, (cn_name, elem) in cube_pets_cn.items():
    make_card(f"{species_id}.png", cn_name, '3D', COLORS[elem])

# ─── Mini Characters ───
mini_names_f = ['小艾', '小贝', '小茜', '小黛', '小伊', '小菲']
mini_names_m = ['小安', '小波', '小晨', '小迪', '小恩', '小飞']
for i, cn_name in enumerate(mini_names_f):
    make_card(f"character-female-{chr(97+i)}.png", cn_name, '3D', COLORS['light'] if i % 2 == 0 else COLORS['wind'])
for i, cn_name in enumerate(mini_names_m):
    make_card(f"character-male-{chr(97+i)}.png", cn_name, '3D', COLORS['water'] if i % 2 == 0 else COLORS['fire'])

# ─── Blocky Characters ───
blocky_names = ['小勇','小猛','小刚','小强','小杰','小帅','小酷','小武','小侠','小雷','小风','小云','小阳','小星','小月','小天','小海','小石']
for i, cn_name in enumerate(blocky_names):
    c = list(COLORS.values())[i % 5]
    make_card(f"character-{chr(97+i)}.png", cn_name, '3D', c)

print(f"Generated {len(os.listdir(OUT))} preview cards")
