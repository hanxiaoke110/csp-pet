// 潜龙闭关 — API 客户端

const API_BASE = 'https://api.cspstudy.top';

function getDeviceHash(): string {
  let hash = localStorage.getItem('csp_device_hash');
  if (!hash) {
    hash = 'dh-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('csp_device_hash', hash);
  }
  return hash;
}

export function getStoredHash(): string {
  return getDeviceHash();
}

export function getStoredClassCode(): string {
  return localStorage.getItem('csp_class_code') || '';
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
  StatusResponse, ReportResponse, LeaderboardResponse,
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

export async function getStatus(): Promise<StatusResponse> {
  return apiCall<StatusResponse>('/api/dungeon/status');
}

export async function syncProgress(playerData: Record<string, unknown>): Promise<{ success: boolean }> {
  return apiCall('/api/dungeon/sync', 'POST', playerData);
}

export async function reportAnswer(
  questionId: string, dungeonId: string, wasCorrect: boolean, timeSpentMs: number
): Promise<ReportResponse> {
  return apiCall<ReportResponse>('/api/dungeon/report', 'POST', {
    question_id: questionId,
    dungeon_id: dungeonId,
    was_correct: wasCorrect,
    time_spent_ms: timeSpentMs,
  });
}

export async function getLeaderboard(
  scope: LeaderboardScope, type: LeaderboardType
): Promise<LeaderboardResponse> {
  return apiCall<LeaderboardResponse>(
    `/api/dungeon/leaderboard?scope=${scope}&type=${type}`
  );
}

export async function getDailyTasks(): Promise<{ success: boolean; tasks: Record<string, unknown> }> {
  return apiCall('/api/dungeon/daily-tasks');
}

export async function claimDailyReward(): Promise<{ success: boolean; rewards: Record<string, number> }> {
  return apiCall('/api/dungeon/claim-daily', 'POST');
}

export async function getBroadcasts(): Promise<{ success: boolean; broadcasts: Record<string, unknown>[] }> {
  return apiCall('/api/dungeon/broadcasts');
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
