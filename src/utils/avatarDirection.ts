import type { WardrobeItem } from '../types/profile';

export function getAvatarDirection(x: number, y: number, avatar?: Pick<WardrobeItem, 'id' | 'version' | 'interaction'>) {
  const cell = (value: number) => Math.max(0, Math.min(4, Math.floor((Number.isFinite(value) ? value : .5) * 5)));
  const column = cell(x), row = cell(y);
  // These v2 atlases contain reversed yaw frames. Select the opposite column
  // rather than mirror the artwork (which would also mirror hair/accessories).
  // Horse's neutral/downward rows already have the correct order.
  const legacy = avatar && avatar.version <= 2;
  const reversed = legacy && (avatar.id === 'avatar-zodiac-snake'
    || (avatar.id === 'avatar-zodiac-horse' && row < 2));
  return { column: reversed ? 4 - column : column, row };
}
