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

// ── Weekly ticket purchase limit (3 per week) ──

function getWeekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const adjust = (jan1.getDay() + 6) % 7;
  return `${d.getFullYear()}-W${Math.floor((dayOfYear + adjust) / 7) + 1}`;
}

const WEEKLY_TICKET_MAX = 3;

export function getWeeklyTicketsBought(): number {
  try {
    const data = JSON.parse(localStorage.getItem('csp_wish_tickets_weekly') || '{}');
    const thisWeek = getWeekKey();
    return data.week === thisWeek ? (data.count || 0) : 0;
  } catch { return 0; }
}

export function canBuyTickets(count: number): { allowed: boolean; remaining: number } {
  const bought = getWeeklyTicketsBought();
  const remaining = WEEKLY_TICKET_MAX - bought;
  return { allowed: count <= remaining, remaining };
}

export function addTickets(count: number): boolean {
  if (!Number.isInteger(count) || count <= 0) return false;
  const ticketKey = 'csp_wish_tickets';
  const weeklyKey = 'csp_wish_tickets_weekly';
  const previousTickets = localStorage.getItem(ticketKey);
  const previousWeekly = localStorage.getItem(weeklyKey);
  try {
    const current = getTicketCount();
    const thisWeek = getWeekKey();
    const bought = getWeeklyTicketsBought();
    localStorage.setItem(ticketKey, String(current + count));
    localStorage.setItem(weeklyKey, JSON.stringify({
      week: thisWeek,
      count: bought + count,
    }));
    return true;
  } catch {
    try {
      if (previousTickets === null) localStorage.removeItem(ticketKey);
      else localStorage.setItem(ticketKey, previousTickets);
      if (previousWeekly === null) localStorage.removeItem(weeklyKey);
      else localStorage.setItem(weeklyKey, previousWeekly);
    } catch {}
    return false;
  }
}

/** Rewards use the same ticket wallet but must not consume the weekly purchase quota. */
export function grantTickets(count: number): void {
  const current = getTicketCount();
  localStorage.setItem('csp_wish_tickets', String(current + Math.max(0, count)));
}
