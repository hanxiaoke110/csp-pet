import type { PartnerGrowthSnapshot } from '../types/partnerGrowth';

export const PARTNER_GROWTH_KEY = 'csp_partner_growth_v1';
export const PARTNER_GROWTH_SQLITE_KEY = 'partner_growth';
/** Match the canonical bank migration, independent of which bank version supplied a question. */
export function canonicalGrowthQuestionId(id: string): string {
  const legacy = id.match(/^csp-([js])-(\d{4})-(\d{3})$/i);
  return legacy ? `csp-${legacy[1].toLowerCase()}-${legacy[2]}-c${Number(legacy[3]).toString().padStart(2, '0')}` : id;
}
export const validGrowthInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export const validGrowthId = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= 200 && !/[\s\u0000-\u001f]/.test(value);
const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200_000
  && value.every(validGrowthId) && new Set(value).size === value.length;
export function validateGrowthSnapshot(value: unknown): value is PartnerGrowthSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as PartnerGrowthSnapshot;
  return s.schemaVersion === 1 && s.migrated === true && validGrowthInteger(s.starSand)
    && validIds(s.firstCorrectIds) && validIds(s.claimedMapIds)
    && typeof s.savedAt === 'string' && Number.isFinite(Date.parse(s.savedAt));
}
export function parseGrowthJson(raw: string | null): any {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function migrateLegacyGrowth(quizRaw: string | null, dungeonRaw: string | null, explorationRaw: string | null): PartnerGrowthSnapshot {
  const quiz = parseGrowthJson(quizRaw);
  const dungeon = parseGrowthJson(dungeonRaw);
  const saved = parseGrowthJson(explorationRaw);
  const maps = saved?.schemaVersion === 2 && saved.maps && typeof saved.maps === 'object'
    ? Object.values(saved.maps) : saved?.schemaVersion === 1 ? [saved] : [];
  const claimedMapIds: string[] = [...new Set(maps.flatMap((entry: any) => entry?.schemaVersion === 1
    && entry.completed === true && validGrowthId(entry.mapId) ? [entry.mapId as string] : []))];
  const dungeonCorrect = dungeon?.totalCorrect ?? dungeon?.total_correct;
  const total = (validGrowthInteger(quiz?.totalCorrect) ? quiz.totalCorrect : 0)
    + (validGrowthInteger(dungeonCorrect) ? dungeonCorrect : 0);
  if (!Number.isSafeInteger(total)) throw new Error('历史答题数量异常');
  const snapshot: PartnerGrowthSnapshot = { schemaVersion: 1, migrated: true,
    starSand: Math.floor(total / 20) + claimedMapIds.length, firstCorrectIds: [], claimedMapIds, savedAt: new Date().toISOString() };
  if (!validateGrowthSnapshot(snapshot)) throw new Error('历史成长资料异常');
  return snapshot;
}
