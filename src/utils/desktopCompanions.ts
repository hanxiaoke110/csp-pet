import { invoke } from '@tauri-apps/api/core';

export async function showDesktopCompanion(slot: 2 | 3): Promise<boolean> {
  try {
    await invoke('show_desktop_companion', { slot });
    return true;
  } catch {
    return false;
  }
}

export async function hideDesktopCompanion(slot: 2 | 3): Promise<void> {
  try { await invoke('hide_desktop_companion', { slot }); } catch {}
}
