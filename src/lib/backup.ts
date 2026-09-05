// 数据备份 / 恢复 — 换电脑迁移用。
// 备份内容：localStorage（csp_*/dungeon_*）+ SQLite settings 表。
// 精灵图片是可恢复缓存，不写入新备份，避免 Windows WebView2 因 Base64 大对象卡死。
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import {
  writeFile, writeTextFile, readTextFile, readDir, remove, mkdir, BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { sqliteSet } from './sqlite-storage';
import { countCompletedProblems, mergeProblemStatusSnapshots } from './problemStatusMerge';

const FORMAT = 'csp-pet-backup';
const BACKUP_VERSION = 1;
const SPRITE_DIR = 'pet-sprites/2d';
export const AUTO_BACKUP_DIR = 'backups';
export const MAX_BACKUP_FILE_BYTES = 12 * 1024 * 1024;
const MAX_AUTOMATIC_BACKUPS = 3;
const AUTO_BACKUP_DATE_KEY = 'csp_last_automatic_backup_date';

// 可从服务器重新下载的内容，不打包进备份（减小文件体积）
const EXCLUDED_LS_KEYS = new Set([
  'csp_quiz_bank',
  'csp_quiz_bank_version',
  'csp_reviewed_quiz_bank_version',
  'csp_imported_lessons',
  'csp_data_version',
  'csp_last_automatic_backup_date',
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
  if (EXCLUDED_LS_KEYS.has(key)) return false;
  if (key.startsWith('dungeon_cache_')) return false;
  return key.startsWith('csp_') || key.startsWith('dungeon_');
}

const SQLITE_BACKUP_KEYS = new Set([
  'pet_data',
  'hatch_eggs',
  'quiz_state',
  'problem_status',
]);

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
  if (!data.localStorage || typeof data.localStorage !== 'object') {
    return { ok: false, error: '备份文件内容不完整' };
  }
  return { ok: true, data: data as BackupFile };
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
    sqlite = Object.fromEntries(rows.filter(([key]) => SQLITE_BACKUP_KEYS.has(key)));
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

async function rotateAutomaticBackups(): Promise<void> {
  const names = await backupNames();
  for (const name of names.slice(MAX_AUTOMATIC_BACKUPS)) {
    try {
      await remove(`${AUTO_BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    } catch { /* 清理旧备份失败不影响新备份 */ }
  }
}

export interface AutomaticBackupInfo {
  name: string;
  exportedAt: string;
  appVersion: string;
}

export async function ensureAutomaticBackupDirectory(): Promise<void> {
  await mkdir(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

/** 写入 AppData/backups，全程不弹系统文件框，避免 Windows 置顶窗口死锁。 */
export async function createAutomaticBackup(reason: 'startup' | 'manual' | 'before-update' | 'before-restore' = 'manual'): Promise<AutomaticBackupInfo> {
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
  await rotateAutomaticBackups();
  return { name, exportedAt: backup.exportedAt, appVersion: backup.appVersion };
}

/** 每天首次启动后备份一次；只有成功写入后才记录日期。 */
export async function ensureDailyAutomaticBackup(): Promise<AutomaticBackupInfo | null> {
  const today = new Date().toISOString().slice(0, 10);
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
  const raw = await readTextFile(`${AUTO_BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
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
}

/**
 * 应用备份：写 localStorage → await 写 SQLite → 写精灵素材。
 * 调用方必须先完成快照；成功后应尽快刷新页面，避免内存中的旧状态覆盖写入。
 */
export async function applyBackup(data: BackupFile): Promise<ApplyResult> {
  const validationError = validateBackupState(data);
  if (validationError) throw new Error(validationError);
  const reconciled = reconcileBackupProgress(data);
  let localPetSnapshotWritten = false;
  for (const [key, value] of Object.entries(reconciled.localStorage)) {
    try {
      localStorage.setItem(key, value);
      if (key === 'csp_pet_data' && localStorage.getItem(key) === value) {
        localPetSnapshotWritten = true;
      }
    } catch { /* SQLite 快照仍可作为兜底 */ }
  }

  let sqliteCount = 0;
  let sqlitePetSnapshotWritten = false;
  for (const [key, value] of Object.entries(reconciled.sqlite || {})) {
    try {
      await sqliteSet(key, value);
      sqliteCount++;
      if (key === 'pet_data') sqlitePetSnapshotWritten = true;
    } catch { /* 记录并继续 */ }
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

  return { lsCount: Object.keys(reconciled.localStorage).length, sqliteCount, spriteCount };
}
