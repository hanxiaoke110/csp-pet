import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTickets, getTicketCount, getWeeklyTicketsBought } from './crypto';

function makeStorage(failKey?: string) {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failKey) throw new Error('storage unavailable');
      data.set(key, String(value));
    },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('许愿票购买写入保护', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });

  it('三张票与本周购买额度同时到账', () => {
    expect(addTickets(3)).toBe(true);
    expect(getTicketCount()).toBe(3);
    expect(getWeeklyTicketsBought()).toBe(3);
  });

  it('周额度写入失败时回滚已写入的票', () => {
    vi.stubGlobal('localStorage', makeStorage('csp_wish_tickets_weekly'));

    expect(addTickets(3)).toBe(false);
    expect(getTicketCount()).toBe(0);
    expect(getWeeklyTicketsBought()).toBe(0);
  });

  it('拒绝零张、负数和小数票', () => {
    expect(addTickets(0)).toBe(false);
    expect(addTickets(-1)).toBe(false);
    expect(addTickets(1.5)).toBe(false);
    expect(getTicketCount()).toBe(0);
  });
});
