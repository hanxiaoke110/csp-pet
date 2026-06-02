// AES-256-GCM 加密/解密 — 许愿墙隐私保护
// 密钥从本地 localStorage 的 CSP_SECRET 派生

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

async function getKey(): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecretSeed()),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('csp-wish-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

function getSecretSeed(): string {
  // 从 localStorage 取设备唯一标识作为种子
  let seed = localStorage.getItem('csp_wish_device');
  if (!seed) {
    seed = crypto.randomUUID();
    localStorage.setItem('csp_wish_device', seed);
  }
  return seed + '-csp-wish-secret';
}

export async function encrypt(text: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  // Combine IV + ciphertext as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encBase64: string): Promise<string> {
  const key = await getKey();
  const combined = new Uint8Array(
    atob(encBase64).split('').map(c => c.charCodeAt(0))
  );
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export function getDeviceId(): string {
  let id = localStorage.getItem('csp_wish_device');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('csp_wish_device', id);
  }
  return id;
}

export function getTicketCount(): number {
  try {
    return parseInt(localStorage.getItem('csp_wish_tickets') || '0');
  } catch { return 0; }
}

export function useTicket(): boolean {
  const count = getTicketCount();
  if (count <= 0) return false;
  localStorage.setItem('csp_wish_tickets', String(count - 1));
  return true;
}

export function addTickets(count: number): void {
  const current = getTicketCount();
  localStorage.setItem('csp_wish_tickets', String(current + count));
}
