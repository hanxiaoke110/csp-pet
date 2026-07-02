// Web 端专属宠物管理（localStorage 存储，零后端写入）
// Web 端没有桌宠 App 的 csp_pet_data，故注册时送一只固定宠物存浏览器本地，
// 让 Web 端战斗也能用到真实宠物属性（HP/攻击/升级），而非 fallback 默认值。
// 与桌面 App 数据隔离，各玩各的。

import type { OwnedPet } from '../../src/types/pet';

const WEB_PET_KEY = 'csp_web_pet';

// 4 选 1 的 Web 初始宠物（与桌面 App 初始宠物一致，元素各异）
const WEB_STARTERS: OwnedPet[] = [
  {
    petId: 'web-capi', petName: '卡皮', speciesId: 'capi', element: 'earth',
    renderType: '2d', modelPath: '/pet-sprites/2d/capi.json',
    level: 1, exp: 0, expToNext: 100, hunger: 100, mood: 80, affection: 50,
    lastFedAt: null, obtainedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  },
  {
    petId: 'web-boba', petName: '啵啵', speciesId: 'boba', element: 'water',
    renderType: '2d', modelPath: '/pet-sprites/2d/boba.json',
    level: 1, exp: 0, expToNext: 100, hunger: 100, mood: 80, affection: 50,
    lastFedAt: null, obtainedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  },
  {
    petId: 'web-bubu', petName: '小布布', speciesId: 'bubu-2', element: 'fire',
    renderType: '2d', modelPath: '/pet-sprites/2d/bubu-2.json',
    level: 1, exp: 0, expToNext: 100, hunger: 100, mood: 80, affection: 50,
    lastFedAt: null, obtainedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  },
  {
    petId: 'web-miga', petName: '米伽', speciesId: 'miga', element: 'wind',
    renderType: '2d', modelPath: '/pet-sprites/2d/miga.json',
    level: 1, exp: 0, expToNext: 100, hunger: 100, mood: 80, affection: 50,
    lastFedAt: null, obtainedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  },
];

// 注册时由用户选择一只初始宠物并写入 localStorage
export function initWebPet(speciesId: string): OwnedPet | null {
  const pet = WEB_STARTERS.find(p => p.speciesId === speciesId);
  if (!pet) return null;
  const withTime: OwnedPet = { ...pet, obtainedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(WEB_PET_KEY, JSON.stringify(withTime));
  } catch { /* ignore */ }
  return withTime;
}

// 读取 Web 宠物（不存在返回 null）
export function loadWebPet(): OwnedPet | null {
  try {
    const raw = localStorage.getItem(WEB_PET_KEY);
    if (raw) return JSON.parse(raw) as OwnedPet;
  } catch { /* ignore */ }
  return null;
}

// 升级后写回 Web 宠物（让 Web 端宠物也能成长）
export function saveWebPet(pet: OwnedPet): void {
  try {
    localStorage.setItem(WEB_PET_KEY, JSON.stringify({ ...pet, updatedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export const WEB_STARTER_OPTIONS = WEB_STARTERS;
