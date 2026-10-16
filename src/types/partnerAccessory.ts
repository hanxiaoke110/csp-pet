export type PartnerAccessorySlot = 'halo' | 'orbit' | 'trail';
export type PartnerAccessoryPrimitive = 'ring' | 'prism' | 'star' | 'lantern' | 'comet' | 'pixel';
export interface PartnerAccessory {
  id: string; name: string; description: string; slot: PartnerAccessorySlot; price: number;
  minRendererVersion: number;
  visual: { primitive: PartnerAccessoryPrimitive; color: string; accent: string; count: number; durationMs: number; size?: number };
}
export interface PartnerAccessoryCatalog { version: number; minRendererVersion: number; items: PartnerAccessory[] }
export type PartnerAccessoryLoadout = Partial<Record<PartnerAccessorySlot, string>>;
export interface PartnerAccessorySnapshot { version: 1; ownedIds: string[]; equippedByPet: Record<string, PartnerAccessoryLoadout>; savedAt: string }
