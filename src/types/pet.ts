// Pet system types — V3 (simplified, no evolution branches)
export type PetElement = 'earth' | 'fire' | 'wind' | 'water' | 'light';
export type PetAnimation = 'idle' | 'walk' | 'sleep' | 'celebrate' | 'think' | 'eat' | 'unhappy';
export type RenderType = '2d';
export type PetTier = 'legendary' | 'rare' | 'common';

export const ELEMENT_EMOJI: Record<PetElement, string> = {
  earth: '🟫', fire: '🔴', wind: '🟢', water: '🔵', light: '🌟',
};

export const TIER_LABELS: Record<PetTier, { icon: string; label: string }> = {
  legendary: { icon: '👑', label: '传说' },
  rare:      { icon: '✨', label: '稀有' },
  common:    { icon: '⭐', label: '普通' },
};

export const TIER_PRICES: Record<PetTier, number> = {
  legendary: 500,
  rare: 260,
  common: 150,
};

export interface PetSpecies {
  speciesId: string;
  name: string;
  element: PetElement;
  renderType: RenderType;
  modelPath: string;    // GLB file for 3D, or sprite sheet dir for 2D
  description: string;
  price: number;        // 0 = free starter
}

export interface OwnedPet {
  petId: string;
  petName: string;
  speciesId: string;
  element: PetElement;
  renderType: RenderType;
  modelPath: string;
  tier?: string;
  level: number;
  exp: number;
  expToNext: number;
  hunger: number;
  mood: number;
  affection: number;
  lastFedAt: string | null;
  obtainedAt: string;
  updatedAt?: string;
}

export interface ShopItem {
  itemId: string;
  itemType: 'pet' | 'food';
  name: string;
  description: string;
  price: number;
  speciesId?: string; // for pet type
  effect?: string;     // JSON for food
  requiredLevel?: number;
}

// ─── Starter pets (free, 4 choose 1, all 2D) ───
export const STARTER_PETS: PetSpecies[] = [
  { speciesId: 'capi',   name: '卡皮',   element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/capi.json',   description: '水豚君本君，佛系躺平',     price: 0 },
  { speciesId: 'boba',   name: '啵啵',   element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/boba.json',   description: '珍珠奶茶精灵，Q弹圆润',     price: 0 },
  { speciesId: 'bubu-2', name: '小布布', element: 'fire',  renderType: '2d', modelPath: '/pet-sprites/2d/bubu-2.json', description: '火焰小恐龙，热情活泼',     price: 0 },
  { speciesId: 'miga',   name: '米伽',   element: 'wind',  renderType: '2d', modelPath: '/pet-sprites/2d/miga.json',   description: '魔法小白猫，神秘优雅',     price: 0 },
];

// ─── 2D Pixel Pets (Petdex imports) ───
const PETDEX_PETS: PetSpecies[] = [
  { speciesId: 'peach', name: '桃桃', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/peach.json', description: '粉色小可爱，温柔甜美', price: 200 },
  { speciesId: 'boba', name: '啵啵', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/boba.json', description: '珍珠奶茶精灵，Q弹圆润', price: 200 },
  { speciesId: 'eve', name: '伊芙', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/eve.json', description: '灵动小天使，轻快飘逸', price: 200 },
  { speciesId: 'bubu-2', name: '小布布', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/bubu-2.json', description: '火焰小恐龙，热情活泼', price: 200 },
  { speciesId: 'pixel-panda', name: '像素熊猫', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/pixel-panda.json', description: '像素国宝，憨态可掬', price: 200 },
  { speciesId: 'harry-poptart', name: '哈利泡芙', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/harry-poptart.json', description: '魔法甜点师，甜蜜暴击', price: 200 },
  { speciesId: 'sky-dragon', name: '天空龙', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/sky-dragon.json', description: '翱翔天际，自由之翼', price: 200 },
  { speciesId: 'glitch-bot', name: '故障机器人', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/glitch-bot.json', description: '赛博小故障，酷炫电波', price: 200 },
  { speciesId: 'dino-bubu', name: '恐龙布布', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/dino-bubu.json', description: '史前小恐龙，霸气呆萌', price: 200 },
  { speciesId: 'miga', name: '米伽', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/miga.json', description: '魔法小白猫，神秘优雅', price: 200 },
  { speciesId: 'capi', name: '卡皮', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/capi.json', description: '水豚君本君，佛系躺平', price: 200 },
  { speciesId: 'rio-2', name: '里奥', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/rio-2.json', description: '蓝色小鹦鹉，热带风情', price: 200 },
  { speciesId: 'brassprout', name: '铜芽', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/brassprout.json', description: '铜色小芽苗，生机勃勃', price: 200 },
  { speciesId: 'buswatch', name: '巴士守望', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/buswatch.json', description: '巴士小卫士，守护出行', price: 200 },
  { speciesId: 'rx-78-2-gundam-2', name: '高达RX78', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/rx-78-2-gundam-2.json', description: '经典机甲战士，燃爆全场', price: 200 },
  { speciesId: 'byte-bunny', name: '字节兔', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/byte-bunny.json', description: '数据小兔子，代码精灵', price: 200 },
  { speciesId: 'currypet', name: 'CurryPet', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/currypet.json', description: '库里主题，篮球神射手', price: 200 },
  { speciesId: 'round-maodie', name: '圆头耄耋', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/round-maodie.json', description: '圆头猫咪表情包，呆萌可爱', price: 200 },
  { speciesId: 'gardevoir', name: '沙奈朵', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/gardevoir.json', description: '超能仙女，守护训练师', price: 200 },
  { speciesId: 'capvolt', name: '皮卡丘', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/capvolt.json', description: '电气鼠精灵，戴着训练师帽', price: 200 },
  { speciesId: 'anon', name: '小粉龙', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/anon.json', description: '粉发女孩穿恐龙卫衣，萌趣', price: 200 },
  { speciesId: 'anya', name: '阿尼亚', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/anya.json', description: 'SPYxFAMILY 超能力少女', price: 200 },
  { speciesId: 'cloudy', name: '云朵熊猫', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/cloudy.json', description: '坐在云上的小熊猫，软萌', price: 200 },
  { speciesId: 'samo', name: '萨摩耶', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/samo.json', description: '白色微笑天使萨摩耶', price: 200 },
  { speciesId: 'broom-witch', name: '扫帚女巫', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/broom-witch.json', description: '骑扫帚的小女巫和黑猫', price: 200 },
  { speciesId: 'einstein', name: '小爱因斯坦', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/einstein.json', description: 'Q版科学家，智慧伙伴', price: 200 },
  { speciesId: 'takagi', name: '高木同学', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/takagi.json', description: '擅长捉弄的高木同学', price: 200 },
  { speciesId: 'dimo', name: '迪莫', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/dimo.json', description: '洛克王国001号宠物', price: 200 },
  { speciesId: 'weilong', name: '威龙机甲', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/weilong.json', description: '太空机甲战士，酷炫', price: 200 },
  { speciesId: 'liebao', name: '猎宝', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/liebao.json', description: '骨头面具研究伙伴', price: 200 },
  { speciesId: 'blue-qilin', name: '蓝麒麟', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/blue-qilin.json', description: '国风麒麟少年，守护者', price: 200 },
  { speciesId: 'poncho-chick', name: '雨衣小鸡', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/poncho-chick.json', description: '穿黑卫衣的小黄鸡', price: 200 },
  { speciesId: 'wode-daodun-3d', name: '刀盾守卫', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/wode-daodun-3d.json', description: '狗蛙守卫，码剑科技盾', price: 200 },
  { speciesId: 'puffel', name: '泡芙犬', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/puffel.json', description: '紫色玩具贵宾犬，蓬松', price: 200 },
  { speciesId: 'xiaobai', name: '小白', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/xiaobai.json', description: '白色线稿小狗狗，简约可爱', price: 200 },
  { speciesId: 'little-blue-star', name: '小蓝星', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/little-blue-star.json', description: '蓝色小星星，闪耀夜空', price: 200 },
  { speciesId: 'astra', name: '阿斯特拉', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/astra.json', description: '星空精灵，宇宙来客', price: 200 },
  { speciesId: 'sillycat', name: '呆猫', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/sillycat.json', description: '灰白小猫咪，呆萌大眼', price: 200 },
  { speciesId: 'backpack-forest-spirit', name: '背包森灵', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/backpack-forest-spirit.json', description: '背着行囊的森林精灵', price: 200 },
  { speciesId: 'emilia', name: '艾米莉亚', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/emilia.json', description: '银发精灵使，温柔治愈', price: 200 },
  { speciesId: 'boolet', name: '子弹君', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/boolet.json', description: '子弹头小人，火力全开', price: 200 },
  { speciesId: 'itachi', name: '鼬', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/itachi.json', description: '写轮眼忍者，暗部精英', price: 200 },
  { speciesId: 'nyanko-v2', name: '喵子V2', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/nyanko-v2.json', description: '进化版猫咪，软萌加倍', price: 200 },
  { speciesId: 'yuanshi-tianzun', name: '元始天尊', element: 'light', renderType: '2d', modelPath: '/pet-sprites/2d/yuanshi-tianzun.json', description: '三清之首，大道至尊', price: 200 },
  { speciesId: 'baobao', name: '宝宝', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/baobao.json', description: '可爱小宝贝，纯真无邪', price: 200 },
  { speciesId: 'sukuna', name: '宿傩', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/sukuna.json', description: '诅咒之王，领域展开', price: 200 },
  { speciesId: 'nezukocoder', name: '祢豆子', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/nezukocoder.json', description: '鬼灭少女，竹筒咬咬', price: 200 },
  { speciesId: 'gugugaga', name: '咕咕嘎嘎', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/gugugaga.json', description: '小企鹅精灵，摇摇摆摆', price: 200 },
  { speciesId: 'godzilla-fire', name: '火焰哥斯拉', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/godzilla-fire.json', description: '迷你哥斯拉，原子吐息', price: 200 },
  { speciesId: 'kyojuro-rengoku', name: '炼狱杏寿郎', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/kyojuro-rengoku.json', description: '炎柱大哥，燃尽一切', price: 200 },
  { speciesId: 'forest-spirit-yahaha', name: '呀哈哈', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/forest-spirit-yahaha.json', description: '克格洛森林精灵，呀哈哈！', price: 200 },
  { speciesId: 'kunkunball', name: '坤坤球', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/kunkunball.json', description: '篮球小将，鸡你太美', price: 200 },
  { speciesId: 'nibble', name: '小咬', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/nibble.json', description: '小嘴巴精灵，轻轻咬一口', price: 200 },
  { speciesId: 'wukong', name: '悟空', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/wukong.json', description: '齐天大圣，金箍棒在手', price: 200 },
  { speciesId: 'cow-meme-pet', name: '奶牛表情包', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/cow-meme-pet.json', description: '魔性奶牛，表情包之王', price: 200 },
  { speciesId: 'boo', name: '小幽灵', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/boo.json', description: '白白小幽灵，飘来飘去', price: 200 },
  { speciesId: 'sasuke', name: '佐助', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/sasuke.json', description: '宇智波佐助，千鸟锐枪', price: 200 },
  { speciesId: 'paimo', name: '派蒙', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/paimo.json', description: '应急食品，最好的伙伴', price: 200 },
  { speciesId: 'kunkun-pixel', name: '像素坤坤', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/kunkun-pixel.json', description: '像素风篮球少年', price: 200 },
  { speciesId: 'wall-e', name: '瓦力', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/wall-e.json', description: '小小机器人，地球清道夫', price: 200 },
  { speciesId: 'hanli', name: '韩立', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/hanli.json', description: '凡人修仙传，掌天瓶在手', price: 200 },
  { speciesId: 'mallow', name: '毛毛', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/mallow.json', description: '灰白双色小猫，金色眼眸', price: 200 },
  { speciesId: 'muichiro-tokito', name: '时透无一郎', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/muichiro-tokito.json', description: '霞柱Q版，空灵刀法', price: 200 },
  { speciesId: 'ayaka', name: '神里绫华', element: 'water', renderType: '2d', modelPath: '/pet-sprites/2d/ayaka.json', description: '白鹭公主，冰华绽放', price: 200 },
  { speciesId: 'ziling', name: '紫灵', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/ziling.json', description: '紫眸修仙者，仙气飘飘', price: 200 },
  { speciesId: 'werllyt', name: '薇尔莉特', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/werllyt.json', description: '金发蓝瞳，自动手记人偶', price: 200 },
  { speciesId: 'zhoukeke', name: '周可可', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/zhoukeke.json', description: '软萌可爱，童心陪伴', price: 200 },
  { speciesId: 'jett', name: 'Jett', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/jett.json', description: '风系战术决斗者，快如闪电', price: 200 },
  { speciesId: 'gameboy', name: '电玩小子', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/gameboy.json', description: '王者荣耀电玩小子，像素街机风', price: 200 },
  { speciesId: 'wanglin', name: '王林', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/wanglin.json', description: 'Q版修士，白银长发玄袍，冷静', price: 200 },
  { speciesId: 'nailong', name: '奶龙·星心', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/nailong.json', description: '星光闪闪，爱你心满满', price: 200 },
  { speciesId: 'bellylaugh', name: '奶龙·笑肚', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/bellylaugh.json', description: '圆黄肚皮，眯眼坏笑', price: 200 },
  { speciesId: 'ali', name: '阿离', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/ali.json', description: 'Q版舞姬，白发折扇火蝶', price: 200 },
  { speciesId: 'madara', name: '宇智波斑', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/madara.json', description: '黑发红眼，暗袍红甲', price: 200 },
  { speciesId: 'obito', name: '带土', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/obito.json', description: '六道白袍，黑杖求道玉', price: 200 },
  { speciesId: 'leafspark', name: '鸣人·幼年', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/leafspark.json', description: '金发蓝眼，橙色运动服', price: 200 },
  { speciesId: 'garra', name: '我爱罗', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/garra.json', description: '红发沙葫芦，灰衣忍者', price: 200 },
  { speciesId: 'liudao-ban', name: '六道斑', element: 'light', renderType: '2d', modelPath: '/pet-sprites/2d/liudao-ban.json', description: '银白长发，求道玉环', price: 200 },
  { speciesId: 'naruto', name: '鸣人·疾风传', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/naruto.json', description: '金色尖发，永不放弃', price: 200 },
  { speciesId: 'jotaro', name: '承太郎', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/jotaro.json', description: 'JOJO奇妙冒险，替身使者', price: 200 },
  { speciesId: 'leo-ultraman', name: '雷欧奥特曼', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/leo-ultraman.json', description: '蓝胸灯奥特战士', price: 200 },
  { speciesId: 'steve', name: '史蒂夫', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/steve.json', description: '方块冒险者，像素沙盒风', price: 200 },
  { speciesId: 'steve-mc', name: 'Steve', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/steve-mc.json', description: '经典Minecraft史蒂夫，挖矿打盹骑猪', price: 200 },
  { speciesId: 'akaza', name: '猗窝座', element: 'fire', renderType: '2d', modelPath: '/pet-sprites/2d/akaza.json', description: '鬼灭之刃 Q版武斗风', price: 200 },
  { speciesId: 'tendou-alice', name: '天童爱丽丝', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/tendou-alice.json', description: '蔚蓝档案 萌系女仆光环', price: 200 },
  { speciesId: 'df-maixiaoshu', name: '麦小鼠', element: 'earth', renderType: '2d', modelPath: '/pet-sprites/2d/df-maixiaoshu.json', description: '机械守护鼠，可爱金属伙伴', price: 200 },
  { speciesId: 'gojo-satoru', name: '五条悟', element: 'wind', renderType: '2d', modelPath: '/pet-sprites/2d/gojo-satoru.json', description: '白毛眼罩咒术师，苍蓝能量', price: 200 },
  { speciesId: 'capvolt-electric', name: '皮卡丘·电', element: 'light', renderType: '2d', modelPath: '/pet-sprites/2d/capvolt-electric.json', description: '电气鼠电属性，十万伏特', price: 200 },
];

export const PET_TIERS: Record<string, PetTier> = {
  'poncho-chick': 'legendary',
  'kunkunball': 'legendary',
  'kunkun-pixel': 'legendary',
  'zhoukeke': 'legendary',
  'wode-daodun-3d': 'legendary',
  'little-blue-star': 'legendary',
  'baobao': 'legendary',
  'wukong': 'legendary',
  'round-maodie': 'rare',
  'anon': 'rare',
  'anya': 'rare',
  'backpack-forest-spirit': 'rare',
  'itachi': 'rare',
  'nyanko-v2': 'rare',
  'nezukocoder': 'rare',
  'gugugaga': 'rare',
  'forest-spirit-yahaha': 'rare',
  'cow-meme-pet': 'rare',
  'wall-e': 'rare',
  'dino-bubu': 'rare',
  'rio-2': 'rare',
  'rx-78-2-gundam-2': 'rare',
  'currypet': 'rare',
  'einstein': 'rare',
  'blue-qilin': 'rare',
  'emilia': 'rare',
  'sukuna': 'rare',
  'godzilla-fire': 'rare',
  'kyojuro-rengoku': 'rare',
  'sasuke': 'rare',
  'paimo': 'rare',
  'ziling': 'rare',
  'jett': 'rare',
  'gameboy': 'rare',
  'weilong': 'legendary',
  'wanglin': 'rare',
  'nailong': 'legendary',
  'bellylaugh': 'legendary',
  'ali': 'rare',
  'madara': 'rare',
  'obito': 'legendary',
  'leafspark': 'legendary',
  'garra': 'rare',
  'liudao-ban': 'legendary',
  'naruto': 'rare',
  'jotaro': 'legendary',
  'leo-ultraman': 'rare',
  'steve': 'legendary',
  'steve-mc': 'rare',
  'akaza': 'rare',
  'tendou-alice': 'legendary',
  'df-maixiaoshu': 'legendary',
  'gojo-satoru': 'legendary',
  'capvolt-electric': 'rare',
};

function buildShop(): ShopItem[] {
  const items: ShopItem[] = [];

  // 2D pixel pets from Petdex
  for (const p of PETDEX_PETS) {
    const tier = PET_TIERS[p.speciesId] || 'common';
    items.push({ itemId: `pet-2d-${p.speciesId}`, itemType: 'pet', name: p.name, description: p.description, price: TIER_PRICES[tier], speciesId: p.speciesId, requiredLevel: 1 });
  }

  return items;
}

export const ALL_SHOP_ITEMS: ShopItem[] = buildShop();

// Helper to get pet info from speciesId
export function getPetConfig(speciesId: string): { renderType: RenderType; modelPath: string; element: PetElement } | null {
  const starter = STARTER_PETS.find(s => s.speciesId === speciesId);
  if (starter) return { renderType: starter.renderType, modelPath: starter.modelPath, element: starter.element };

  const petdex = PETDEX_PETS.find(p => p.speciesId === speciesId);
  if (petdex) return { renderType: petdex.renderType, modelPath: petdex.modelPath, element: petdex.element };

  // Workshop pets: speciesId = "workshop-{id}", cached at pet-sprites/2d/{id}.json
  // Note: pet.id from API already has ws- prefix, so wsId = id (no extra ws-)
  if (speciesId.startsWith('workshop-')) {
    const wsId = speciesId.replace('workshop-', '');
    return { renderType: '2d', modelPath: '/pet-sprites/2d/' + wsId + '.json', element: 'fire' };
  }

  return null;
}

// Check if a pet's spritesheet needs remote download (not bundled)
export function isRemotePet(speciesId: string): boolean {
  if (STARTER_PETS.some(s => s.speciesId === speciesId)) return false;
  if (speciesId.startsWith('workshop-') || speciesId.startsWith('ws-')) return true;
  return PET_TIERS[speciesId] === 'rare' || PET_TIERS[speciesId] === 'legendary';
}

export function getPetTier(speciesId: string): PetTier {
  if (STARTER_PETS.some(s => s.speciesId === speciesId)) return 'common';
  if (speciesId.startsWith('workshop-')) return 'rare';
  return PET_TIERS[speciesId] || 'common';
}
