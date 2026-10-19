import { BaseDirectory, mkdir, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';

const DIR = 'question-bank-cache-v2';
const POINTER = 'question_bank_v2_file_slots';
const desktop = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
type Slot = 'current' | 'previous';
type Pointer = { file: string; hash: string };
async function hash(raw: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function pointers(): Partial<Record<Slot, Pointer>> {
  try {
    const value = JSON.parse(localStorage.getItem(POINTER) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function validPointer(value: Pointer | undefined): value is Pointer {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value.hash) && value.file === `${value.hash}.json`);
}
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('题库缓存不可用');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('csp-question-bank-v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('题库缓存被其他页面占用'));
  });
}

export async function readQuestionCache(slot: Slot): Promise<unknown | null> {
  try {
    if (desktop()) {
      const pointer = pointers()[slot];
      if (!validPointer(pointer)) return null;
      const raw = await readTextFile(`${DIR}/${pointer.file}`, { baseDir: BaseDirectory.AppData });
      if (await hash(raw) !== pointer.hash) return null;
      return JSON.parse(raw);
    }
    const db = await database();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').get(slot);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    }); } finally { db.close(); }
  } catch { return null; }
}

/** Payloads never enter localStorage. Publish a tiny pointer only after a
 * read-back checksum; IndexedDB publishes both slots in one transaction. */
export async function writeQuestionCache(current: unknown, previous: unknown | null): Promise<void> {
  if (desktop()) {
    await mkdir(DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    const old = pointers();
    const save = async (value: unknown): Promise<Pointer> => {
      const raw = JSON.stringify(value);
      if (raw.length > 32 * 1024 * 1024) throw new Error('题库缓存超过大小限制');
      const digest = await hash(raw);
      const file = `${digest}.json`;
      await writeTextFile(`${DIR}/${file}`, raw, { baseDir: BaseDirectory.AppData });
      if (await hash(await readTextFile(`${DIR}/${file}`, { baseDir: BaseDirectory.AppData })) !== digest) throw new Error('题库缓存写入校验失败');
      return { file, hash: digest };
    };
    const next = { current: await save(current), ...(previous ? { previous: await save(previous) } : {}) };
    localStorage.setItem(POINTER, JSON.stringify(next));
    for (const pointer of Object.values(old)) {
      if (validPointer(pointer) && !Object.values(next).some(p => p.file === pointer.file)) {
        await remove(`${DIR}/${pointer.file}`, { baseDir: BaseDirectory.AppData }).catch(() => {});
      }
    }
    return;
  }
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put(current, 'current');
    if (previous) tx.objectStore('snapshots').put(previous, 'previous');
    else tx.objectStore('snapshots').delete('previous');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('题库缓存保存中断'));
  }); } finally { db.close(); }
}
