// 潜龙闭关 — API 客户端

const API_BASE = 'https://api.cspstudy.top';

function getDeviceHash(): string {
  try {
    // Existing dungeon students must retain their original identity. Switching a
    // legacy player to the desktop UUID would orphan server-side progress.
    const legacy = localStorage.getItem('csp_device_hash');
    if (legacy) return legacy;
    const rawPlayer = localStorage.getItem('dungeon_player');
    if (rawPlayer) {
      try {
        const saved = JSON.parse(rawPlayer);
        if (typeof saved?.deviceHash === 'string' && saved.deviceHash) return saved.deviceHash;
      } catch { /* fall through to the shared identity */ }
    }

    // New dungeon students share the main app identity used for class binding.
    let hash = localStorage.getItem('csp_wish_device');
    if (!hash) {
      hash = crypto.randomUUID();
      localStorage.setItem('csp_wish_device', hash);
    }
    return hash;
  } catch {
    return crypto.randomUUID();
  }
}

export function getStoredHash(): string {
  return getDeviceHash();
}

export function getStoredClassCode(): string {
  try {
    return localStorage.getItem('csp_class_code') || '';
  } catch {
    return '';
  }
}

async function apiCall<T>(
  path: string,
  method: string = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const dh = getDeviceHash();
  const cc = getStoredClassCode();

  const url = new URL(path, API_BASE);
  if (method === 'GET') {
    url.searchParams.set('device_hash', dh);
    if (cc) url.searchParams.set('class_code', cc);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const options: RequestInit = { method, headers };

  if (body && method !== 'GET') {
    options.body = JSON.stringify({ ...body, device_hash: dh, class_code: cc });
  }

  const resp = await fetch(url.toString(), options);
  const data = await resp.json();

  if (!resp.ok || data.error) {
    throw new Error(data.error || `API error: ${resp.status}`);
  }

  return data as T;
}

// ── API functions ──
import type {
  LeaderboardResponse,
  LeaderboardType, LeaderboardScope, LeaderboardEntry, RegisterResponse,
} from '../types/dungeon';

export async function registerPlayer(
  classCode: string, displayName: string, realName: string, phone: string, school: string
): Promise<RegisterResponse> {
  return apiCall<RegisterResponse>('/api/dungeon/register', 'POST', {
    class_code: classCode,
    display_name: displayName,
    real_name: realName,
    phone,
    school,
  });
}

export async function syncProgress(playerData: Record<string, unknown>): Promise<{ success: boolean }> {
  return apiCall('/api/dungeon/sync', 'POST', playerData);
}

// 战斗结束上报：服务端校验、写 dungeon_attempts、按固定规则发金币。前端不传 earned_reward（服务端自算）。
// 同时同步客户端权威的等级/段位/连胜字段到服务端（供跨设备登录恢复）。
export async function reportBattle(payload: {
  dungeon_id: string;
  stage_id: string;
  is_win: boolean;
  rating: string;
  questions_answered: number;
  correct_count: number;
  player_level?: number;
  exp?: number;
  rank_tier?: number;
  rank_points?: number;
  current_streak?: number;
  max_streak?: number;
}): Promise<{ success: boolean; gold_added: number }> {
  return apiCall('/api/dungeon/report-battle', 'POST', {
    dungeon_id: payload.dungeon_id,
    stage_id: payload.stage_id,
    is_win: payload.is_win ? 1 : 0,
    rating: payload.rating,
    questions_answered: payload.questions_answered,
    correct_count: payload.correct_count,
    player_level: payload.player_level,
    exp: payload.exp,
    rank_tier: payload.rank_tier,
    rank_points: payload.rank_points,
    current_streak: payload.current_streak,
    max_streak: payload.max_streak,
  });
}

export async function getLeaderboard(
  scope: LeaderboardScope, type: LeaderboardType
): Promise<LeaderboardResponse> {
  const resp = await apiCall<LeaderboardResponse>(
    `/api/dungeon/leaderboard?scope=${scope}&type=${type}`
  );
  // 后端返回 snake_case（display_name/rank_tier），前端用 camelCase，这里做转换
  const convert = (e: any): LeaderboardEntry => ({
    rank: e.rank,
    displayName: e.display_name ?? e.displayName ?? '',
    school: e.school,
    rankTier: e.rank_tier ?? e.rankTier ?? 1,
    rankPoints: e.rank_points ?? e.rankPoints ?? e.value ?? 0,
    classCode: e.class_code ?? e.classCode ?? '',
    value: e.value ?? 0,
  });
  return {
    ...resp,
    entries: (resp.entries || []).map(convert),
    playerEntry: resp.playerEntry ? convert(resp.playerEntry) : null,
  };
}

export async function loginPlayer(realName: string, phone: string): Promise<{
  success: boolean;
  error?: string;
  player: Record<string, unknown>;
  dungeons: Record<string, unknown>[];
  badges: string[];
  dailyTasks: Record<string, unknown>;
}> {
  return apiCall('/api/dungeon/login', 'POST', { real_name: realName, phone });
}
