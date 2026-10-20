import { invoke } from '@tauri-apps/api/core';

function isTauriAvailable(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';
}

async function bounded<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('数据库响应超时，请稍后重试')), 5000);
    })]);
  } finally { clearTimeout(timer!); }
}

// A caller timing out must not let a late old write overtake newer writes.
let writeQueue: Promise<unknown> = Promise.resolve();
export async function flushSqliteWrites(): Promise<void> { await bounded(writeQueue.then(() => undefined)); }

/** A read failure is not a missing record. */
export async function sqliteGet(key: string): Promise<string | null> {
  if (!isTauriAvailable()) return localStorage.getItem(key);
  return bounded(invoke<string | null>('get_setting', { key }));
}

/** Confirmed writes reject on failure; background mirrors explicitly catch it. */
export async function sqliteSet(key: string, value: string): Promise<void> {
  const task = writeQueue.catch(() => undefined).then(async () => {
    if (!isTauriAvailable()) { localStorage.setItem(key, value); return; }
    await invoke('set_setting', { key, value });
  });
  writeQueue = task.catch(() => undefined);
  await bounded(task);
}

export function sqliteSetFireAndForget(key: string, value: string): void {
  void sqliteSet(key, value).catch(error => console.error('[sqlite] mirror failed for ' + key, error));
}
