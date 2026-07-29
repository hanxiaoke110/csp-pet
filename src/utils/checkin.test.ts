import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeekKey, nextCheckin } from './checkin';

function makeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, String(value)),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', makeLocalStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('每周签到', () => {
  it('使用 ISO 周编号处理跨年周，不会在年初错误回到第一周', () => {
    expect(getWeekKey(new Date(2024, 11, 30, 12))).toBe('2025-W1');
    expect(getWeekKey(new Date(2025, 0, 5, 12))).toBe('2025-W1');
    expect(getWeekKey(new Date(2025, 0, 6, 12))).toBe('2025-W2');
  });

  it('只有紧邻上一周签到才延续连续周数', () => {
    vi.setSystemTime(new Date(2026, 6, 13, 12));
    localStorage.setItem('csp_checkin', JSON.stringify({ week: '2026-W28', streak: 4 }));
    expect(nextCheckin()).toMatchObject({ alreadyChecked: false, week: '2026-W29', streak: 5 });

    localStorage.setItem('csp_checkin', JSON.stringify({ week: '2026-W20', streak: 9 }));
    expect(nextCheckin()).toMatchObject({ alreadyChecked: false, week: '2026-W29', streak: 1 });
  });
});
