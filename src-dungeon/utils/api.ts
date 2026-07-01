// 潜龙闭关 — API 客户端

const API_BASE = 'https://api.cspstudy.top';

function getDeviceHash(): string {
  try {
    let hash = localStorage.getItem('csp_device_hash');
    if (!hash) {
      hash = 'dh-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('csp_device_hash', hash);
    }
    return hash;
  } catch {
    // 隐私模式等 localStorage 不可用时，回退到内存随机值
    return 'dh-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
  LeaderboardType, LeaderboardScope, RegisterResponse,
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
export async function reportBattle(payload: {
  dungeon_id: string;
  stage_id: string;
  is_win: boolean;
  rating: string;
  questions_answered: number;
  correct_count: number;
}): Promise<{ success: boolean; gold_added: number }> {
  return apiCall('/api/dungeon/report-battle', 'POST', {
    dungeon_id: payload.dungeon_id,
    stage_id: payload.stage_id,
    is_win: payload.is_win ? 1 : 0,
    rating: payload.rating,
    questions_answered: payload.questions_answered,
    correct_count: payload.correct_count,
  });
}

export async function getLeaderboard(
  scope: LeaderboardScope, type: LeaderboardType
): Promise<LeaderboardResponse> {
  return apiCall<LeaderboardResponse>(
    `/api/dungeon/leaderboard?scope=${scope}&type=${type}`
  );
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
