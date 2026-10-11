import type { EquipmentElement } from '../types/exploration';
import { ELEMENT_COUNTERS } from '../data/equipmentCatalog';

export interface CombatEquipment { element: EquipmentElement; level: number }
export function clampUpgradeLevel(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.min(5, Math.floor(level))) : 0;
}
export function weaponDamageMultiplier(weapon: CombatEquipment | undefined, enemy: EquipmentElement): number {
  if (!weapon) return 1;
  return (105 + clampUpgradeLevel(weapon.level) * 5) / 100 * (ELEMENT_COUNTERS[weapon.element] === enemy ? 1.2 : 1);
}
export function armorDamageMultiplier(armor: CombatEquipment | undefined, enemy: EquipmentElement): number {
  if (!armor || ELEMENT_COUNTERS[armor.element] !== enemy) return 1;
  return (90 - clampUpgradeLevel(armor.level) * 4) / 100;
}
export function applyWeaponDamage(base: number, weapon: CombatEquipment | undefined, enemy: EquipmentElement): number {
  return Math.max(1, Math.floor(base * weaponDamageMultiplier(weapon, enemy) + 1e-9));
}
export function applyArmorReduction(base: number, armor: CombatEquipment | undefined, enemy: EquipmentElement): number {
  return Math.max(1, Math.floor(base * armorDamageMultiplier(armor, enemy) + 1e-9));
}
