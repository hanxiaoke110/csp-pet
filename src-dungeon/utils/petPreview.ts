// 工坊宠物（workshop-/ws-）的 preview 图不在 public，但 AppData 缓存里有 -thumb.png 缩略图。
// 用 Tauri fs 读取并转 blob URL，供 Phaser load.image 使用。
// 仅桌面端有效（Web 端无工坊宠物）；thumb 不存在时返回 null，PetSprite 用 fallback 灰圆。

/** 判断是否工坊宠物（需要远程/本地 spritesheet，无 public preview） */
export function isWorkshopPet(speciesId: string): boolean {
  return speciesId.startsWith('workshop-') || speciesId.startsWith('ws-');
}

/**
 * 加载工坊宠物的 thumb 缩略图，返回 blob URL。
 * 失败或非 Tauri 环境返回 null（调用方用 fallback）。
 * 用 BaseDirectory.AppData 相对路径读取（与桌面端 PetSprite 一致）。
 */
export async function loadWorkshopThumbUrl(speciesId: string): Promise<string | null> {
  if (!isWorkshopPet(speciesId)) return null;
  try {
    const { readFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const wsId = speciesId.replace(/^(workshop-|ws-)/, '');
    const thumbRel = `pet-sprites/2d/${wsId}-thumb.png`;
    // 先检查存在性，不存在直接返回 null（避免 readFile 抛错）
    const ok = await exists(thumbRel, { baseDir: BaseDirectory.AppData });
    if (!ok) {
      console.warn('[petPreview] thumb not found:', thumbRel);
      return null;
    }
    const bytes = await readFile(thumbRel, { baseDir: BaseDirectory.AppData });
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    console.log('[petPreview] thumb loaded:', thumbRel, '→', url.slice(0, 50));
    return url;
  } catch (e) {
    console.warn('[petPreview] load thumb failed:', e);
    return null;
  }
}
