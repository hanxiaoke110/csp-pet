import { create } from 'zustand';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { OwnedPet } from '../types/pet';
import { STARTER_PETS, getPetConfig, ALL_SHOP_ITEMS } from '../types/pet';
import type { ShopItem } from '../types/pet';

interface PetState {
  activePetId: string | null;
  ownedPets: OwnedPet[];
  coins: number;
  foods: Record<string, number>;

  // Pet management
  selectStarter: (speciesId: string, petName: string) => void;
  setActivePet: (petId: string) => boolean;
  getActivePet: () => OwnedPet | null;
  hasStarter: () => boolean;
  buyPet: (speciesId: string, petName: string) => boolean;
  isOwned: (speciesId: string) => boolean;

  // Rename
  renameCards: number;
  buyRenameCard: () => boolean;
  renamePet: (petId: string, newName: string) => string;

  // Gacha
  gachaDailyPulls: number;
  gachaDate: string;
  gachaPity: number;
  doGacha: () => { item: ShopItem; rarity: string; pityBreak: boolean } | null;

  // Attributes
  addExp: (petId: string, amount: number) => void;
  addCoins: (amount: number) => void;
  addAffection: (petId: string, amount: number) => void;
  spendCoins: (amount: number) => boolean;
  feedPet: (petId: string, foodId: string) => boolean;
  tickHunger: () => void;

  // Pending rewards
  pendingExp: number;
  pendingCoins: number;
  addPendingRewards: (exp: number, coins: number) => void;
  claimPendingRewards: () => void;

  // Persistence
  save: () => void;
  load: () => void;
}

export const FOODS: Record<string, { name: string; price: number; hunger: number; icon: string }> = {
  basic:   { name: '普通食物', price: 30,  hunger: 30, icon: '🌾' },
  premium: { name: '营养食物', price: 80,  hunger: 60, icon: '🍪' },
  deluxe:  { name: '豪华食物', price: 150, hunger: 100, icon: '🍖' },
};

// Level milestones — cosmetic only (size + particles)
export function getLevelMilestone(level: number): { size: number; glow: boolean; particles: boolean; title: string } {
  if (level >= 15) return { size: 1.5, glow: true,  particles: true,  title: '传说' };
  if (level >= 10) return { size: 1.25, glow: true,  particles: false, title: '精英' };
  if (level >= 5)  return { size: 1.1, glow: false, particles: true,  title: '成长' };
  return { size: 1.0, glow: false, particles: false, title: '新手' };
}

export const usePetStore = create<PetState>((set, get) => ({
  activePetId: null,
  ownedPets: [],
  coins: 100000, // TODO: reset to 200 for production
  foods: { basic: 3 },
  pendingExp: 0,
  pendingCoins: 0,
  renameCards: 0,
  gachaDailyPulls: 0,
  gachaDate: '',
  gachaPity: 0,

  selectStarter: (speciesId, petName) => {
    const species = STARTER_PETS.find(s => s.speciesId === speciesId);
    if (!species) return;
    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId: species.speciesId, element: species.element,
      renderType: species.renderType, modelPath: species.modelPath,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet], activePetId: pet.petId }));
    get().save();
  },

  setActivePet: (petId) => {
    set({ activePetId: petId }); get().save();
    return true;
  },

  getActivePet: () => {
    const { ownedPets, activePetId } = get();
    return ownedPets.find(p => p.petId === activePetId) || null;
  },

  hasStarter: () => get().ownedPets.length > 0,

  // Check if a shop speciesId is effectively owned (starters use different speciesIds)
  isOwned: (shopSpeciesId: string) => {
    const config = getPetConfig(shopSpeciesId);
    if (!config) return false;
    return get().ownedPets.some(p => p.modelPath === config.modelPath || p.speciesId === shopSpeciesId);
  },

  buyPet: (speciesId, petName) => {
    const shopItem = ALL_SHOP_ITEMS.find(i => i.speciesId === speciesId);
    if (!shopItem) return false;
    if (get().coins < shopItem.price) return false;
    if (get().isOwned(speciesId)) return false;

    const config = getPetConfig(speciesId);
    if (!config) return false;

    const pet: OwnedPet = {
      petId: crypto.randomUUID(), petName,
      speciesId, element: config.element,
      renderType: config.renderType, modelPath: config.modelPath,
      level: 1, exp: 0, expToNext: 100,
      hunger: 100, mood: 80, affection: 50,
      lastFedAt: null, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set(s => ({ ownedPets: [...s.ownedPets, pet], coins: s.coins - shopItem.price }));
    get().save();
    return true;
  },

  addExp: (petId, amount) => {
    set(s => ({
      ownedPets: s.ownedPets.map(p => {
        if (p.petId !== petId) return p;
        let { exp, expToNext, level } = p;
        exp += amount;
        while (exp >= expToNext) {
          exp -= expToNext;
          level++;
          expToNext = Math.floor(expToNext * 1.3);
        }
        return { ...p, exp, expToNext, level, mood: Math.min(100, p.mood + 3), updatedAt: new Date().toISOString() };
      }),
    }));
    get().save();
  },

  addCoins: (amount) => { set(s => ({ coins: s.coins + amount })); get().save(); },
  addAffection: (petId, amount) => {
    set(s => ({
      ownedPets: s.ownedPets.map(p =>
        p.petId === petId
          ? { ...p, affection: Math.min(100, (p.affection || 0) + amount) }
          : p
      ),
    }));
    get().save();
  },

  spendCoins: (amount) => {
    if (get().coins < amount) return false;
    set(s => ({ coins: s.coins - amount }));
    get().save();
    return true;
  },

  feedPet: (petId, foodId) => {
    const food = FOODS[foodId];
    if (!food) return false;
    const foods = get().foods;
    if ((foods[foodId] || 0) <= 0) return false;

    // Track feed count for achievements
    try {
      const count = parseInt(localStorage.getItem('csp_feed_count') || '0') + 1;
      localStorage.setItem('csp_feed_count', String(count));
    } catch {}

    set(s => ({
      foods: { ...s.foods, [foodId]: (s.foods[foodId] || 0) - 1 },
      ownedPets: s.ownedPets.map(p => {
        if (p.petId !== petId) return p;
        return {
          ...p, hunger: Math.min(100, p.hunger + food.hunger),
          mood: Math.min(100, p.mood + 5),
          affection: Math.min(100, p.affection + 3),
          lastFedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    get().save();
    return true;
  },

  tickHunger: () => {
    const { activePetId } = get();
    if (!activePetId) return;
    set(s => ({
      ownedPets: s.ownedPets.map(p =>
        p.petId === activePetId
          ? { ...p, hunger: Math.max(0, p.hunger - 2), mood: p.hunger <= 20 ? Math.max(0, p.mood - 1) : p.mood }
          : p
      ),
    }));
  },

  addPendingRewards: (exp, coins) => {
    set(s => ({ pendingExp: s.pendingExp + exp, pendingCoins: s.pendingCoins + coins }));
    get().save();
  },

  claimPendingRewards: () => {
    const { pendingExp, pendingCoins, activePetId } = get();
    if (pendingExp === 0 && pendingCoins === 0) return;
    if (activePetId) get().addExp(activePetId, pendingExp);
    get().addCoins(pendingCoins);
    set({ pendingExp: 0, pendingCoins: 0 });
    get().save();
  },

  buyRenameCard: () => {
    if (get().coins < 200) return false;
    set(s => ({ coins: s.coins - 200, renameCards: s.renameCards + 1 }));
    get().save();
    return true;
  },

  renamePet: (petId: string, newName: string): string => {
    if (get().renameCards <= 0) return '没有改名卡';
    const n = newName.trim();
    if (!n) return '名字不能为空';
    if (n.length < 2) return '名字至少 2 个字';
    if (n.length > 8) return '名字最多 8 个字';
    if (!/^[一-龥a-zA-Z0-9]+$/.test(n)) return '只能使用中文、英文和数字';
    const banned = [
      '管理员', 'admin', 'root', '测试', 'test', '老师',
      '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛', '温家宝', '李克强',
      '反动', '颠覆', '煽动', '分裂', '叛乱',
      'nigger', 'spic', 'kike', 'chink', 'paki', 'negro',
      'fag', 'faggot', 'dyke', 'queer',
      '回回', '靴子', '高丽棒子', '老毛子', '黑鬼', '杂种', '东亚病夫', '蛮夷',
      '洋鬼子', '小日本', '大汉族主义', '印度阿三', '乡巴佬',
      '大男人', '小女人', '男尊女卑', '重男轻女', '血统',
      '臭婆娘', '死老娘们儿', '娘娘腔', '伪娘',
      'fuck', 'shit', 'bitch', 'cunt', 'piss', 'asshole', 'cock', 'dick', 'tits', 'balls', 'ass',
      'damn', 'hell', 'bastard', 'jerk', 'moron', 'idiot', 'retard', 'motherfucker',
      'sb', '傻逼', '操', '他妈', '你妈', '你妹', '日了狗', '日你妈', '草泥马', '特么的', '妈蛋',
      '装逼', '撕逼', '呆逼', '逗比', '傻逼',
      '玛拉戈壁', '爆菊', 'JB', '本屌', '齐B短裙', '法克鱿', '丢你老母', '达菲鸡',
      '装13', '逼格', '蛋疼', '绿茶婊', '表砸', '屌爆了', '买了个婊', '已撸', '吉跋猫',
      '碧莲', '碧池', '然并卵', '屁民', '吃翔', 'XX狗', '淫家', '浮尸国', '滚粗', '我靠',
      '笨蛋', '傻瓜', '废物', '垃圾', '脑残', '神经病', '变态',
      '王八蛋', '龟儿子', '狗东西', '猪头', '驴脸',
      '去死吧', '见鬼去', '滚开',
      '杀人', '放火', '爆炸', '自残', '虐待',
      '性交', '做爱', '勃起', '乳房', '阴道',
      '吸毒', '贩毒', '赌博', '赌场', '博彩',
      '亵渎神灵', '侮辱佛祖', '诋毁耶稣', '邪教组织',
    ];
    if (banned.some(w => n.toLowerCase().includes(w.toLowerCase()))) return '名字包含敏感词';
    if (get().ownedPets.some(p => p.petId !== petId && p.petName === n)) return '名字已被其他智子使用';
    set(s => ({
      renameCards: s.renameCards - 1,
      ownedPets: s.ownedPets.map(p =>
        p.petId === petId ? { ...p, petName: n, updatedAt: new Date().toISOString() } : p
      ),
    }));
    get().save();
    return '';
  },

  doGacha: () => {
    const s = get();
    const today = new Date().toISOString().slice(0, 10);
    let { gachaDailyPulls, gachaDate, gachaPity } = s;
    if (gachaDate !== today) { gachaDailyPulls = 0; gachaDate = today; }
    if (gachaDailyPulls >= 5) return null;
    if (s.coins < 100) return null;
    gachaDailyPulls++; gachaPity++;

    let rarity: string;
    const roll = Math.random() * 100;
    if (gachaPity >= 100 || roll < 1) { rarity = 'legendary'; gachaPity = 0; }
    else if (roll < 11) { rarity = 'rare'; }
    else { rarity = 'common'; }

    const allPets = ALL_SHOP_ITEMS.filter(i => i.itemType === 'pet');
    const commons = allPets.filter(i => i.price === 100);
    const rares = allPets.filter(i => i.price >= 200 && i.price <= 300);
    const legends = allPets.filter(i => i.price > 300);
    const pool = rarity === 'legendary' ? legends.length ? legends : rares :
                 rarity === 'rare' ? rares.length ? rares : commons : commons;

    // Filter out already-owned pets
    const available = pool.filter(i => !get().isOwned(i.speciesId!));
    if (available.length === 0) {
      // All pets in this pool are owned — refund
      set({ gachaDailyPulls, gachaDate: today, gachaPity: s.gachaPity, coins: s.coins });
      return { item: pool[0], rarity: 'refund', pityBreak: false };
    }

    const item = available[Math.floor(Math.random() * available.length)];
    if (!item?.speciesId) return null;

    const ownedNames = s.ownedPets.map(p => p.petName);
    const autoName = item.name + (ownedNames.includes(item.name) ? Math.floor(Math.random()*100).toString() : '');
    if (!get().buyPet(item.speciesId!, autoName)) return null;

    set({ gachaDailyPulls, gachaDate: today, gachaPity, coins: s.coins - 100 });
    get().save();
    return { item, rarity, pityBreak: gachaPity === 0 && rarity !== 'common' };
  },

  save: () => {
    const { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, renameCards, gachaDailyPulls, gachaDate, gachaPity } = get();
    const data = { ownedPets, activePetId, coins, foods, pendingExp, pendingCoins, renameCards, gachaDailyPulls, gachaDate, gachaPity };
    localStorage.setItem('csp_pet_data', JSON.stringify(data));
    emit('pet-data-sync', data).catch(() => {});
    // Auto show/hide pet window based on whether pets exist
    if (activePetId) {
      invoke('show_pet_window').catch(() => {});
    } else {
      invoke('hide_pet_window').catch(() => {});
    }
  },

  load: () => {
    try {
      const data = JSON.parse(localStorage.getItem('csp_pet_data') || '{}');
      if (data.ownedPets) {
        // Migrate old pets without renderType/modelPath
        const migrated = data.ownedPets.map((p: any) => {
          if (p.renderType) return p;
          const config = getPetConfig(p.speciesId);
          return { ...p, renderType: config?.renderType || '3d', modelPath: config?.modelPath || '' };
        });
        set({
          ownedPets: migrated,
          activePetId: data.activePetId || null,
          coins: data.coins || 100000, // TODO: reset to 200 for production
          foods: data.foods || { basic: 3 },
          pendingExp: data.pendingExp || 0,
          pendingCoins: data.pendingCoins || 0,
        });
      }
    } catch { /* ignore */ }
  },
}));
