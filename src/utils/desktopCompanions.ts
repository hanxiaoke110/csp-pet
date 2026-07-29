import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const LABEL = (slot: 2 | 3) => `pet-${slot}`;

export async function showDesktopCompanion(slot: 2 | 3): Promise<boolean> {
  try {
    const label = LABEL(slot);
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return true;
    }
    const offset = slot === 2 ? 180 : 360;
    const window = new WebviewWindow(label, {
      url: `/pet.html?slot=${slot}`,
      title: `CSP Pet ${slot}`,
      width: 154,
      height: 154,
      x: offset,
      y: 160,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      shadow: false,
    });
    return await new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => resolve(false), 4000);
      window.once('tauri://created', () => { clearTimeout(timeout); resolve(true); });
      window.once('tauri://error', () => { clearTimeout(timeout); resolve(false); });
    });
  } catch {
    return false;
  }
}

export async function hideDesktopCompanion(slot: 2 | 3): Promise<void> {
  try { await (await WebviewWindow.getByLabel(LABEL(slot)))?.hide(); } catch {}
}
