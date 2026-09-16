import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';

const WORKSHOP_API = 'https://api.cspstudy.top';
const WORKSHOP_STATIC = 'https://cards.cspstudy.top/workshop';
const CACHE_SUBDIR = 'pet-sprites/2d';

interface WorkshopPetAsset {
  id: string;
  element?: string;
  pet_json?: string;
  spritesheet_url?: string;
  thumbnail_url?: string;
  spritesheet_static_url?: string;
  thumbnail_static_url?: string;
  spritesheet_bytes?: number;
  spritesheet_sha256?: string;
}

const repairs = new Map<string, Promise<boolean>>();
let catalogPromise: Promise<WorkshopPetAsset[]> | null = null;

async function loadCatalog(): Promise<WorkshopPetAsset[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(`${WORKSHOP_STATIC}/catalog.json`, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`workshop catalog HTTP ${response.status}`);
        return response.json();
      })
      .then(data => (Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : [])).map((pet: WorkshopPetAsset) => ({
        ...pet,
        spritesheet_static_url: pet.spritesheet_static_url ? new URL(pet.spritesheet_static_url, `${WORKSHOP_STATIC}/catalog.json`).href : undefined,
        thumbnail_static_url: pet.thumbnail_static_url ? new URL(pet.thumbnail_static_url, `${WORKSHOP_STATIC}/catalog.json`).href : undefined,
      })))
      .catch(() => fetch(`${WORKSHOP_API}/api/workshop/pets?limit=100&paginated=1`)
        .then(response => {
          if (!response.ok) throw new Error(`workshop catalog HTTP ${response.status}`);
          return response.json();
        })
        .then(data => Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : [])))
      .catch(error => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

async function downloadImage(key: string): Promise<Uint8Array> {
  const url = /^https:\/\//.test(key) ? key : `${WORKSHOP_API}/api/workshop/image?key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`workshop image HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Restore AppData sprite files for an owned workshop pet after an update or cache loss. */
export function repairWorkshopSprite(petId: string): Promise<boolean> {
  const existing = repairs.get(petId);
  if (existing) return existing;

  const repair = (async () => {
    const catalog = await loadCatalog();
    const pet = catalog.find(item => item.id === petId);
    if (!pet?.spritesheet_url) return false;

    if (!await exists(CACHE_SUBDIR, { baseDir: BaseDirectory.AppData })) {
      await mkdir(CACHE_SUBDIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    const sprite = await downloadImage(pet.spritesheet_static_url || pet.spritesheet_url);
    if (pet.spritesheet_bytes && sprite.byteLength !== pet.spritesheet_bytes) return false;
    if (pet.spritesheet_sha256) {
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', sprite))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== pet.spritesheet_sha256.toLowerCase()) return false;
    }
    await writeFile(`${CACHE_SUBDIR}/${petId}.png`, sprite, { baseDir: BaseDirectory.AppData });

    let metadata: Record<string, unknown> = {
      frameWidth: 192,
      frameHeight: 208,
      maxFrames: 8,
      anims: { idle: 6 },
      animOrder: ['idle'],
      durations: { idle: 1100 },
    };
    try {
      if (pet.pet_json) metadata = JSON.parse(pet.pet_json);
    } catch { /* use compatible default metadata */ }
    metadata.element = pet.element || 'fire';
    await writeFile(
      `${CACHE_SUBDIR}/${petId}.json`,
      new TextEncoder().encode(JSON.stringify(metadata)),
      { baseDir: BaseDirectory.AppData },
    );

    if (pet.thumbnail_static_url || pet.thumbnail_url) {
      try {
        const thumbnail = await downloadImage(pet.thumbnail_static_url || pet.thumbnail_url!);
        await writeFile(`${CACHE_SUBDIR}/${petId}-thumb.png`, thumbnail, { baseDir: BaseDirectory.AppData });
      } catch { /* PetStatus can rebuild it from the restored sheet */ }
    }
    return true;
  })().catch(() => false).finally(() => repairs.delete(petId));

  repairs.set(petId, repair);
  return repair;
}
