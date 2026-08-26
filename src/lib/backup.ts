// 数据备份 / 恢复 — 换电脑迁移用。
// 备份内容：localStorage（csp_*/dungeon_*）+ SQLite settings 表。
// 精灵图片是可恢复缓存，不写入新备份，避免 Windows WebView2 因 Base64 大对象卡死。
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { writeFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { sqliteSet } from './sqlite-storage';

const FORMAT = 'csp-pet-backup';
const BACKUP_VERSION = 1;
const SPRITE_DIR = 'pet-sprites/2d';

// 可从服务器重新下载的内容，不打包进备份（减小文件体积）
const EXCLUDED_LS_KEYS = new Set([
  'csp_quiz_bank',
  'csp_quiz_bank_version',
  'csp_reviewed_quiz_bank_version',
  'csp_imported_lessons',
  'csp_data_version',
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
  return key.startsWith('csp_') || key.startsWith('dungeon_');
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
    || isValidPetSnapshot(backup.sqlite.pet_data)
  ) return null;
  return '未读取到完整的智子与金币数据，请先重启应用确认数据正常后再导出';
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
    sqlite = Object.fromEntries(rows);
  } catch { /* SQLite 不可用时只导出 localStorage */ }

  let appVersion = 'unknown';
  try { appVersion = await getVersion(); } catch {}

  return {
    format: FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    localStorage: ls,
    sqlite,
    // 保留字段用于兼容旧备份导入；新备份不再复制可重新获取的图片缓存。
    sprites: {},
  };
}

/** 导出：弹系统另存为对话框，返回保存路径；取消时抛 'cancelled' */
export async function exportBackup(): Promise<string> {
  const backup = await buildBackup();
  const validationError = validateBackupState(backup);
  if (validationError) throw new Error(validationError);
  const date = backup.exportedAt.slice(0, 10);
  return await invoke<string>('export_backup', {
    contents: JSON.stringify(backup),
    defaultName: `CSP备份-${date}.json`,
  });
}

/** 导入前兜底：把当前数据快照存到 AppData，返回快照文件名 */
export async function snapshotCurrentToAppData(): Promise<string> {
  const backup = await buildBackup();
  const validationError = validateBackupState(backup);
  if (validationError) throw new Error(validationError);
  const name = `backup-before-import-${Date.now()}.json`;
  await writeTextFile(name, JSON.stringify(backup), { baseDir: BaseDirectory.AppData });
  return name;
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
  for (const [key, value] of Object.entries(data.localStorage)) {
    try { localStorage.setItem(key, value); } catch { /* 忽略单项失败 */ }
  }

  let sqliteCount = 0;
  for (const [key, value] of Object.entries(data.sqlite || {})) {
    try {
      await sqliteSet(key, value);
      sqliteCount++;
    } catch { /* 记录并继续 */ }
  }

  let spriteCount = 0;
  const sprites = data.sprites || {};
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

  return { lsCount: Object.keys(data.localStorage).length, sqliteCount, spriteCount };
}

/** 导入第一步：弹打开对话框读入文件原文；取消时抛 'cancelled' */
export async function pickBackupFile(): Promise<string> {
  return await invoke<string>('import_backup');
}
