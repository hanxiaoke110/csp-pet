// 数据备份 / 恢复 — 换电脑迁移用。
// 备份内容：localStorage（csp_*/dungeon_*）+ SQLite settings 表。
// 精灵图片是可恢复缓存，不写入新备份，避免 Windows WebView2 因 Base64 大对象卡死。
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import {
  writeFile, writeTextFile, readTextFile, readDir, remove, mkdir, BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { sqliteSet, sqliteGet, flushSqliteWrites } from './sqlite-storage';
import { beginRestoreBarrier, RESTORE_GENERATION_KEY } from './restoreBarrier';
import { countCompletedProblems, mergeProblemStatusSnapshots } from './problemStatusMerge';
import { localDateKey } from '../utils/localDate';
import { JOURNAL_KEY, recoverEquipmentTransaction } from './equipmentTransactions';
import { commitLocalSnapshots, validateLocalSnapshots, PARTNER_JOURNAL_KEY, recoverPartnerTransaction, withPartnerReadLock } from './partnerTransactions';
import { migrateLegacyGrowth, PARTNER_GROWTH_KEY, validateGrowthSnapshot } from '../utils/partnerGrowth';
import { defaultAccessorySnapshot, PARTNER_ACCESSORY_KEY, validateAccessorySnapshot } from '../data/partnerAccessories';

const FORMAT = 'csp-pet-backup';
const BACKUP_VERSION = 1;
const SPRITE_DIR = 'pet-sprites/2d';
export const AUTO_BACKUP_DIR = 'backups';
export const MAX_BACKUP_FILE_BYTES = 12 * 1024 * 1024;
const MAX_AUTOMATIC_BACKUPS = 3;
const AUTO_BACKUP_DATE_KEY = 'csp_last_automatic_backup_date';
let backupWriteQueue: Promise<void> = Promise.resolve();

// 可从服务器重新下载的内容，不打包进备份（减小文件体积）
const EXCLUDED_LS_KEYS = new Set([
  'dungeon_sync_outbox_v1', // Device-bound transport queue, never migrate it to another student/computer.
  RESTORE_GENERATION_KEY,
  JOURNAL_KEY,
  PARTNER_JOURNAL_KEY,
  'csp_quiz_bank',
  'csp_quiz_bank_version',
  'csp_reviewed_quiz_bank_version',
  'csp_imported_lessons',
  'csp_data_version',
  // Old 1.7.x banks are downloadable content, not a student's answer/progress
  // records. Replaying them in a multi-snapshot journal can exceed WebView quota.
  'csp_exam_bank_v3',
  'csp_exam_bank_v4',
  'dungeon_exam_bank_v1',
  'dungeon_csp_exam_bank_v4',
  'dungeon_exam_bank_version',
  'csp_last_automatic_backup_date',
  'csp_collector_card_catalog_cache_v1',
  'csp_collector_card_cache_v1',
  'csp_wardrobe_catalog_cache_v1',
  'csp_wardrobe_catalog_cache_v2',
  'csp_wardrobe_asset_cache_v1',
  'csp_star_path_catalog_cache_v1',
  'csp_equipment_catalog_cache_v1',
  'csp_partner_accessory_catalog_cache_v1',
  'dungeon_reviewed_exam_bank_v1',
  'dungeon_reviewed_exam_bank_version',
  'dungeon_dungeons_v1',
  'dungeon_leaderboard_rules_v1',
]);

export interface BackupFile {
  format: string;
  version: number;
  appVersion: string;
  exportedAt: string;
  localStorage: Record<string, string>;
  sqlite: Record<string, string>;
  sprites: Record<string, string>;
}

/** 判断一个 localStorage key 是否属于需要迁移的用户数据 */
export function shouldIncludeKey(key: string): boolean {
  if (excludedBackupKey(key)) return false;
  return key.startsWith('csp_') || key.startsWith('dungeon_');
}

function excludedBackupKey(key: string): boolean {
  return EXCLUDED_LS_KEYS.has(key) || key.startsWith('dungeon_cache_');
}

const SQLITE_BACKUP_KEYS = new Set([
  'pet_data',
  'partner_growth',
  'partner_accessories',
  'hatch_eggs',
  'quiz_state',
  'problem_status',
  'collector_cards',
  'profile_data',
  'focus_data',
]);

export function shouldIncludeSqliteKey(key: string): boolean {
  return SQLITE_BACKUP_KEYS.has(key);
}

/** 解析并校验备份文件；不通过时给出孩子能看懂的拒绝原因 */
export function parseBackup(raw: string): { ok: true; data: BackupFile } | { ok: false; error: string } {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: '备份文件已损坏，无法读取' };
  }
  if (!data || data.format !== FORMAT) {
    return { ok: false, error: '这不是 CSP 学习助手的备份文件' };
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return { ok: false, error: `这个备份来自更新版本的 App（格式 v${data.version}），请先把 App 更新到最新版再导入` };
  }
  const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
  if (!record(data.localStorage) || (data.sqlite !== undefined && !record(data.sqlite)) || (data.sprites !== undefined && !record(data.sprites))) {
    return { ok: false, error: '备份文件内容不完整' };
  }
  return { ok: true, data: { ...data, sqlite: data.sqlite || {}, sprites: data.sprites || {} } as BackupFile };
}

/** 比较 "1.7.20" 形式的版本号；a > b 返回正数，相等返回 0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isValidPetSnapshot(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data?.ownedPets)
      && Number.isFinite(Number(data?.coins))
      && Number(data.coins) >= 0;
  } catch {
    return false;
  }
}

/** 导出前确认智子与金币至少在一套持久化存储中完整可读。 */
export function validateBackupState(backup: BackupFile): string | null {
  for (const raw of [backup.localStorage?.[PARTNER_ACCESSORY_KEY], backup.sqlite?.partner_accessories]) {
    if (raw) { try { if (!validateAccessorySnapshot(JSON.parse(raw))) return '配饰备份资料异常，无法恢复'; } catch { return '配饰备份资料异常，无法恢复'; } }
  }
  for (const raw of [backup.localStorage?.[PARTNER_GROWTH_KEY], backup.sqlite?.partner_growth]) {
    if (raw) {
      try { if (!validateGrowthSnapshot(JSON.parse(raw))) return '星砂备份资料异常，无法恢复'; }
      catch { return '星砂备份资料异常，无法恢复'; }
    }
  }
  if (
    isValidPetSnapshot(backup.localStorage.csp_pet_data)
    || isValidPetSnapshot(backup.sqlite?.pet_data)
  ) return null;
  return '未读取到完整的智子与金币数据，请先重启应用确认数据正常后再导出';
}

export interface BackupSummary {
  coins: number;
  petCount: number;
  completedCourses: number;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const mergedProgress = mergeProblemStatusSnapshots(
    backup.localStorage.csp_problem_status,
    backup.sqlite?.problem_status,
  );
  const completedCourses = countCompletedProblems(mergedProgress);
  for (const raw of [backup.localStorage.csp_pet_data, backup.sqlite?.pet_data]) {
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.ownedPets) && Number.isFinite(Number(data?.coins))) {
        return { coins: Number(data.coins), petCount: data.ownedPets.length, completedCourses };
      }
    } catch { /* 继续读取另一份快照 */ }
  }
  return { coins: 0, petCount: 0, completedCourses };
}

function reconcileBackupProgress(backup: BackupFile): BackupFile {
  const localStorageData = { ...backup.localStorage };
  const sqliteData = { ...(backup.sqlite || {}) };
  const merged = mergeProblemStatusSnapshots(
    localStorageData.csp_problem_status,
    sqliteData.problem_status,
  );
  if (merged !== null) {
    localStorageData.csp_problem_status = merged;
    sqliteData.problem_status = merged;
  }
  return { ...backup, localStorage: localStorageData, sqlite: sqliteData };
}

/** 收集当前全部可迁移数据，组装成备份对象 */
export async function buildBackup(): Promise<BackupFile> {
  return withPartnerReadLock(async () => {
  // Export only a consistent committed wallet/equipment pair, never a replayable journal.
  recoverEquipmentTransaction();
  recoverPartnerTransaction();
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !shouldIncludeKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) ls[key] = value;
  }

  let sqlite: Record<string, string> = {};
  try {
    const rows = await invoke<[string, string][]>('get_all_settings');
    sqlite = Object.fromEntries(rows.filter(([key]) => shouldIncludeSqliteKey(key)));
  } catch { /* SQLite 不可用时只导出 localStorage */ }

  let appVersion = 'unknown';
  try { appVersion = await getVersion(); } catch {}

  return reconcileBackupProgress({
    format: FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    localStorage: ls,
    sqlite,
    // 保留字段用于兼容旧备份导入；新备份不再复制可重新获取的图片缓存。
    sprites: {},
  });
  });
}

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function backupNames(): Promise<string[]> {
  try {
    const entries = await readDir(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData });
    return entries
      .filter(entry => entry.isFile && entry.name.toLowerCase().endsWith('.json'))
      .map(entry => entry.name)
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

export function selectBackupsToRemove(names: string[], protectedName?: string): string[] {
  const sorted = [...new Set(names)].sort((a, b) => b.localeCompare(a));
  const keep = new Set<string>();
  if (protectedName && sorted.includes(protectedName)) keep.add(protectedName);
  for (const name of sorted) {
    if (keep.size >= MAX_AUTOMATIC_BACKUPS) break;
    keep.add(name);
  }
  return sorted.filter(name => !keep.has(name));
}

async function rotateAutomaticBackups(protectedName?: string): Promise<void> {
  const names = await backupNames();
  for (const name of selectBackupsToRemove(names, protectedName)) {
    try {
      await remove(`${AUTO_BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    } catch { /* 清理旧备份失败不影响新备份 */ }
  }
}

export interface AutomaticBackupInfo {
  name: string;
  exportedAt: string;
  appVersion: string;
  /** 新建备份时直接返回摘要，避免写完后为展示结果再次读取文件。 */
  summary?: BackupSummary;
}

export async function ensureAutomaticBackupDirectory(): Promise<void> {
  await mkdir(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

/** 写入 AppData/backups，全程不弹系统文件框，避免 Windows 置顶窗口死锁。 */
export async function createAutomaticBackup(reason: 'startup' | 'manual' | 'before-update' | 'before-restore' = 'manual'): Promise<AutomaticBackupInfo> {
  let resolveResult!: (value: AutomaticBackupInfo) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<AutomaticBackupInfo>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  backupWriteQueue = backupWriteQueue.then(async () => {
    try {
      const backup = await buildBackup();
      const validationError = validateBackupState(backup);
      if (validationError) throw new Error(validationError);
      const contents = JSON.stringify(backup);
      if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_FILE_BYTES) {
        throw new Error('备份数据异常过大，已停止写入');
      }
      await ensureAutomaticBackupDirectory();
      const name = `CSP-${timestampForFilename(new Date(backup.exportedAt))}-${reason}.json`;
      await writeTextFile(`${AUTO_BACKUP_DIR}/${name}`, contents, { baseDir: BaseDirectory.AppData });
      await rotateAutomaticBackups(name);
      resolveResult({
        name,
        exportedAt: backup.exportedAt,
        appVersion: backup.appVersion,
        summary: summarizeBackup(backup),
      });
    } catch (error) {
      rejectResult(error);
    }
  });
  backupWriteQueue = backupWriteQueue.catch(() => undefined);
  return result;
}

/** 每天首次启动后备份一次；只有成功写入后才记录日期。 */
export async function ensureDailyAutomaticBackup(): Promise<AutomaticBackupInfo | null> {
  const today = localDateKey();
  if (localStorage.getItem(AUTO_BACKUP_DATE_KEY) === today) return null;
  const info = await createAutomaticBackup('startup');
  localStorage.setItem(AUTO_BACKUP_DATE_KEY, today);
  return info;
}

export async function listAutomaticBackups(): Promise<AutomaticBackupInfo[]> {
  const result: AutomaticBackupInfo[] = [];
  for (const name of await backupNames()) {
    try {
      const raw = await readTextFile(`${AUTO_BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
      const parsed = parseBackup(raw);
      if (!parsed.ok || validateBackupState(parsed.data)) continue;
      result.push({ name, exportedAt: parsed.data.exportedAt, appVersion: parsed.data.appVersion });
    } catch { /* 忽略损坏或不可读文件 */ }
  }
  return result;
}

export async function readAutomaticBackup(name: string): Promise<BackupFile> {
  if (!name || /[/\\]/.test(name) || !name.toLowerCase().endsWith('.json')) {
    throw new Error('备份文件名无效');
  }
  let raw: string;
  try {
    raw = await readTextFile(`${AUTO_BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
  } catch {
    throw new Error('备份文件已不存在或已被清理，请刷新备份列表后重试');
  }
  const parsed = parseBackup(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const validationError = validateBackupState(parsed.data);
  if (validationError) throw new Error(validationError);
  return parsed.data;
}

export interface ApplyResult {
  lsCount: number;
  sqliteCount: number;
  spriteCount: number;
  sqliteFailures: number;
}

/**
 * 应用备份：完整写 localStorage → await 写 SQLite → 写精灵素材。
 * 调用方必须先完成快照；成功后应尽快刷新页面，避免内存中的旧状态覆盖写入。
 */
export async function applyBackup(data: BackupFile, options: { preserveMissing?: boolean } = {}): Promise<ApplyResult> {
  return withPartnerReadLock(async () => {
  recoverEquipmentTransaction();
  recoverPartnerTransaction();
  const validationError = validateBackupState(data);
  if (validationError) throw new Error(validationError);
  const reconciled = reconcileBackupProgress(data);
  // Old backups predate these optional modules. Do not silently mix a different
  // local profile/journal into the restored student, or silently delete it.
  const optionalUserData: Record<string, string> = {
    csp_profile_data: 'profile_data', csp_focus_data: 'focus_data', csp_collector_cards_v1: 'collector_cards',
  };
  for (const [localKey, sqlKey] of Object.entries(optionalUserData)) {
    if (reconciled.localStorage[localKey] || reconciled.sqlite[sqlKey]) {
      const raw = reconciled.localStorage[localKey] || reconciled.sqlite[sqlKey];
      reconciled.localStorage[localKey] = raw;
      reconciled.sqlite[sqlKey] = raw;
    } else if (!options.preserveMissing && (localStorage.getItem(localKey) || await sqliteGet(sqlKey))) {
      throw new Error('此备份不包含本机已有的个人档案、专注记录或典藏卡。请确认保留这些额外数据后再恢复；不会自动删除日记。');
    }
  }
  if (!isValidPetSnapshot(reconciled.localStorage.csp_pet_data) && isValidPetSnapshot(reconciled.sqlite?.pet_data)) {
    reconciled.localStorage.csp_pet_data = reconciled.sqlite.pet_data;
  }
  const originalLsCount = Object.keys(reconciled.localStorage).filter(key => !excludedBackupKey(key)).length;
  // Restore a consistent growth/wallet pair even when the source only had SQLite.
  const growth = reconciled.localStorage[PARTNER_GROWTH_KEY] || reconciled.sqlite?.partner_growth;
  const restoredAt = new Date().toISOString();
  const restoredGrowth = JSON.stringify({ ...(growth ? JSON.parse(growth) : migrateLegacyGrowth(
    reconciled.localStorage.csp_quiz_state || reconciled.sqlite?.quiz_state || null,
    reconciled.localStorage.dungeon_player || null, reconciled.localStorage.csp_dungeon_exploration_v1 || null)), savedAt: restoredAt });
  reconciled.localStorage[PARTNER_GROWTH_KEY] = restoredGrowth;
  reconciled.sqlite.partner_growth = restoredGrowth;
  const accessory = reconciled.localStorage[PARTNER_ACCESSORY_KEY] || reconciled.sqlite?.partner_accessories;
  const restoredAccessory = JSON.stringify({ ...(accessory ? JSON.parse(accessory) : defaultAccessorySnapshot()), savedAt: restoredAt });
  reconciled.localStorage[PARTNER_ACCESSORY_KEY] = restoredAccessory;
  reconciled.sqlite.partner_accessories = restoredAccessory;
  const restoredPet = JSON.stringify({ ...JSON.parse(reconciled.localStorage.csp_pet_data), savedAt: restoredAt });
  reconciled.localStorage.csp_pet_data = restoredPet;
  // Matching stamps prevent an old SQLite wallet or growth ledger from winning hydration.
  reconciled.sqlite.pet_data = restoredPet;
  // These dual-store records select the latest savedAt during hydration. Stamp
  // both restored copies now so an older target copy cannot win after a failed
  // SQL mirror. Arrays and problem-status maps must not gain schema fields.
  for (const [localKey, sqlKey] of Object.entries({ ...optionalUserData, csp_quiz_state: 'quiz_state' })) {
    const raw = reconciled.localStorage[localKey] || reconciled.sqlite[sqlKey];
    if (!raw) continue;
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const stamped = JSON.stringify({ ...value, savedAt: restoredAt });
        reconciled.localStorage[localKey] = stamped;
        reconciled.sqlite[sqlKey] = stamped;
      }
    } catch { /* Legacy optional data is handled by its module's loader. */ }
  }
  // Apply the same cache exclusions to old imports as to new exports. Keep the
  // healing histories and all user progress; do not delete the current caches.
  const entries = Object.entries(reconciled.localStorage).filter(([key]) => !excludedBackupKey(key));
  const snapshots = Object.fromEntries(entries);
  const snapshotError = validateLocalSnapshots(snapshots);
  if (snapshotError) throw new Error(`备份校验失败：${snapshotError}。尚未写入，请保留原备份并联系老师。`);
  let localPetSnapshotWritten = false;
  const barrier = beginRestoreBarrier();
  try { await flushSqliteWrites(); } catch (error) { barrier.cancel(); throw error; }
  if (commitLocalSnapshots(snapshots, {}, true)) {
    localPetSnapshotWritten = true;
    // Never replay a transaction from the previous session over the restored profile.
    localStorage.removeItem(JOURNAL_KEY);
    localStorage.removeItem(PARTNER_JOURNAL_KEY);
  } else { barrier.cancel(); throw new Error('备份恢复失败：应用本地存储无法完整写入，可能是存储配额不足或权限限制。请保留原备份，勿清空数据。'); }

  try {
  let sqliteCount = 0;
  let sqliteFailures = 0;
  let sqlitePetSnapshotWritten = false;
  for (const [key, value] of Object.entries(reconciled.sqlite || {})) {
    if (!SQLITE_BACKUP_KEYS.has(key)) continue;
    try {
      await sqliteSet(key, value);
      if ((key !== 'partner_growth' || Boolean(growth)) && (key !== 'partner_accessories' || Boolean(accessory))) sqliteCount++;
      if (key === 'pet_data') sqlitePetSnapshotWritten = true;
    } catch { sqliteFailures++; }
  }

  if (!localPetSnapshotWritten && !sqlitePetSnapshotWritten) {
    throw new Error('智子与金币数据无法写入，请检查应用数据目录权限后重试');
  }

  let spriteCount = 0;
  const sprites = reconciled.sprites || {};
  const names = Object.keys(sprites);
  if (names.length > 0) {
    try { await mkdir(SPRITE_DIR, { baseDir: BaseDirectory.AppData, recursive: true }); } catch {}
    for (const name of names) {
      // 只接受纯文件名，杜绝路径穿越
      if (/[/\\]/.test(name)) continue;
      try {
        await writeFile(`${SPRITE_DIR}/${name}`, base64ToBytes(sprites[name]), { baseDir: BaseDirectory.AppData });
        spriteCount++;
      } catch { /* 单个素材失败不阻塞 */ }
    }
  }

  const result = { lsCount: originalLsCount, sqliteCount, spriteCount, sqliteFailures };
  // The safety overlay sits above Settings; carry the truthful result there too.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('backup-restore-completed', { detail: result }));
  }
  return result;
  } finally { barrier.complete(); }
  });
}
