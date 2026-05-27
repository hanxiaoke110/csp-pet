// Pet system types — V3 (simplified, no evolution branches)
export type PetElement = 'earth' | 'fire' | 'wind' | 'water' | 'light';
export type PetAnimation = 'idle' | 'walk' | 'sleep' | 'celebrate' | 'think' | 'eat' | 'unhappy';
export type RenderType = '2d' | '3d';

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

// ─── Starter pets (free, 4 choose 1) ───
export const STARTER_PETS: PetSpecies[] = [
  { speciesId: 'xuanzai',   name: '小赤狐',   element: 'earth', renderType: '3d', modelPath: '/pet-sprites/3d/animal-fox.glb',       description: '3D 方块狐狸，稳重可靠',     price: 0 },
  { speciesId: 'zhuque',    name: '小火龙',   element: 'fire',  renderType: '2d', modelPath: '/pet-sprites/2d/dragon.json',          description: '2D 像素小龙，活泼勇猛',     price: 0 },
  { speciesId: 'qingluan',  name: '小丫鸭',   element: 'wind',  renderType: '2d', modelPath: '/pet-sprites/2d/ducky.json',           description: '2D 像素小鸭，自由好奇',     price: 0 },
  { speciesId: 'kunbao',    name: '小冰企',   element: 'water', renderType: '3d', modelPath: '/pet-sprites/3d/animal-penguin.glb',    description: '3D 方块企鹅，冷静呆萌',     price: 0 },
];

// ─── All pets available in shop ───
// 3D Cube Pets
const ANIMALS_3D = [
  'animal-bee', 'animal-bunny', 'animal-cat', 'animal-caterpillar',
  'animal-cow', 'animal-crab', 'animal-deer', 'animal-dog',
  'animal-elephant', 'animal-fish', 'animal-giraffe', 'animal-hog',
  'animal-koala', 'animal-lion', 'animal-monkey', 'animal-panda',
  'animal-parrot', 'animal-pig', 'animal-polar', 'animal-tiger',
  'animal-beaver', 'animal-chick',
];

// 3D Blocky Characters
const CHARS_3D = Array.from({ length: 18 }, (_, i) => `character-${String.fromCharCode(97 + i)}`);

// 3D Mini Characters
const MINIS_3D = [
  'character-female-a', 'character-female-b', 'character-female-c',
  'character-female-d', 'character-female-e', 'character-female-f',
  'character-male-a', 'character-male-b', 'character-male-c',
  'character-male-d', 'character-male-e', 'character-male-f',
];

// 2D sprites
const SPRITES_2D = ['otter', 'teddy', 'ghost', 'zombie', 'knight', 'dragon', 'ducky', 'penguin', 'char64', 'bomb', 'redgirl', 'capybara'];

function buildShop(): ShopItem[] {
  const items: ShopItem[] = [];

  const cnNames3D: Record<string, [string, string]> = {
    'animal-bee': ['小蜜蜂', '3D'], 'animal-bunny': ['小兔子', '3D'], 'animal-cat': ['小猫咪', '3D'],
    'animal-caterpillar': ['毛毛虫', '3D'], 'animal-chick': ['小鸡仔', '3D'], 'animal-cow': ['小奶牛', '3D'],
    'animal-crab': ['小螃蟹', '3D'], 'animal-deer': ['小鹿', '3D'], 'animal-dog': ['小狗狗', '3D'],
    'animal-elephant': ['小象', '3D'], 'animal-fish': ['小鱼', '3D'], 'animal-fox': ['小赤狐', '3D'],
    'animal-giraffe': ['长颈鹿', '3D'], 'animal-hog': ['小野猪', '3D'], 'animal-koala': ['考拉', '3D'],
    'animal-lion': ['小狮子', '3D'], 'animal-monkey': ['小猴子', '3D'], 'animal-panda': ['熊猫', '3D'],
    'animal-parrot': ['小鹦鹉', '3D'], 'animal-penguin': ['小冰企', '3D'], 'animal-pig': ['小猪', '3D'],
    'animal-polar': ['北极熊', '3D'], 'animal-tiger': ['小老虎', '3D'], 'animal-beaver': ['小河狸', '3D'],
  };

  for (const a of ANIMALS_3D) {
    const [cn] = cnNames3D[a] || [a.replace('animal-', '')];
    items.push({ itemId: `pet-3d-${a}`, itemType: 'pet', name: cn, description: `3D 方块智子`, price: 100, speciesId: a, requiredLevel: 1 });
  }

  const blockyNames = ['小勇','小猛','小刚','小强','小杰','小帅','小酷','小武','小侠','小雷','小风','小云','小阳','小星','小月','小天','小海','小石'];
  for (let i = 0; i < CHARS_3D.length; i++) {
    items.push({ itemId: `pet-3d-${CHARS_3D[i]}`, itemType: 'pet', name: blockyNames[i], description: '3D 方块角色', price: 300, speciesId: CHARS_3D[i], requiredLevel: 5 });
  }

  const miniF = ['小艾','小贝','小茜','小黛','小伊','小菲'];
  const miniM = ['小安','小波','小晨','小迪','小恩','小飞'];
  for (let i = 0; i < 6; i++) {
    items.push({ itemId: `pet-3d-f-${i}`, itemType: 'pet', name: miniF[i], description: '3D Q版女孩', price: 400, speciesId: MINIS_3D[i], requiredLevel: 5 });
    items.push({ itemId: `pet-3d-m-${i}`, itemType: 'pet', name: miniM[i], description: '3D Q版男孩', price: 400, speciesId: MINIS_3D[i+6], requiredLevel: 5 });
  }

  const cnNames2D: Record<string, string> = {
    'otter': '小水獭', 'teddy': '泰迪熊', 'ghost': '小幽灵', 'zombie': '小僵尸',
    'knight': '小骑士', 'dragon': '小火龙', 'ducky': '小丫鸭', 'penguin': '小企鹅',
    'char64': '像素猫咪', 'bomb': '炸弹人', 'redgirl': '小猫头鹰', 'capybara': '卡皮巴拉',
  };
  const prices2D: Record<string, number> = { otter: 200, teddy: 400, ghost: 200, zombie: 200, knight: 200, dragon: 400, ducky: 400, penguin: 400, char64: 200, char60: 400, bomb: 200, redgirl: 200, capybara: 300 };
  for (const s of SPRITES_2D) {
    items.push({ itemId: `pet-2d-${s}`, itemType: 'pet', name: cnNames2D[s] || s, description: '2D 像素智子', price: prices2D[s] || 200, speciesId: s, requiredLevel: 1 });
  }

  return items;
}

export const ALL_SHOP_ITEMS: ShopItem[] = buildShop();

// Helper to get pet info from speciesId
export function getPetConfig(speciesId: string): { renderType: RenderType; modelPath: string; element: PetElement } | null {
  const starter = STARTER_PETS.find(s => s.speciesId === speciesId);
  if (starter) return { renderType: starter.renderType, modelPath: starter.modelPath, element: starter.element };

  // 3D animal
  if (speciesId.startsWith('animal-')) {
    const elem = ANIMAL_ELEMENTS[speciesId] || 'earth';
    return { renderType: '3d', modelPath: `/pet-sprites/3d/${speciesId}.glb`, element: elem };
  }
  // 3D blocky character
  if (speciesId.startsWith('character-') && speciesId.length <= 13) {
    const idx = speciesId.charCodeAt(speciesId.length - 1) - 97;
    const elements: PetElement[] = ['fire','wind','earth','water','fire','wind'];
    return { renderType: '3d', modelPath: `/pet-sprites/3d/blocky/${speciesId}.glb`, element: elements[idx % 6] };
  }
  // 3D mini character
  if (speciesId.startsWith('character-')) {
    return { renderType: '3d', modelPath: `/pet-sprites/3d/mini/${speciesId}.glb`, element: speciesId.includes('female') ? 'wind' : 'water' };
  }
  // 2D sprite
  const elem2D = SPRITE_ELEMENTS[speciesId] || 'earth';
  return { renderType: '2d', modelPath: `/pet-sprites/2d/${speciesId}.json`, element: elem2D };
}

// Element mappings
const ANIMAL_ELEMENTS: Record<string, PetElement> = {
  'animal-bee': 'wind', 'animal-bunny': 'earth', 'animal-cat': 'fire', 'animal-caterpillar': 'wind',
  'animal-chick': 'fire', 'animal-cow': 'earth', 'animal-crab': 'water', 'animal-deer': 'earth',
  'animal-dog': 'fire', 'animal-elephant': 'earth', 'animal-fish': 'water', 'animal-fox': 'earth',
  'animal-giraffe': 'earth', 'animal-hog': 'earth', 'animal-koala': 'earth', 'animal-lion': 'fire',
  'animal-monkey': 'earth', 'animal-panda': 'earth', 'animal-parrot': 'wind', 'animal-penguin': 'water',
  'animal-pig': 'earth', 'animal-polar': 'water', 'animal-tiger': 'fire', 'animal-beaver': 'water',
};

const SPRITE_ELEMENTS: Record<string, PetElement> = {
  'otter': 'water', 'teddy': 'earth', 'ghost': 'wind', 'zombie': 'earth',
  'knight': 'fire', 'dragon': 'fire', 'ducky': 'wind', 'penguin': 'water',
  'char64': 'earth', 'char60': 'wind', 'bomb': 'fire', 'redgirl': 'wind', 'capybara': 'water',
};
