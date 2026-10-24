import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTickets, getTicketCount, getWeeklyTicketsBought, useTicket } from './crypto';

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

  it('每次成功扣一张，票不足不扣且不影响本周限购', () => {
    expect(addTickets(3)).toBe(true);
    for(const remaining of [2,1,0]) { expect(useTicket()).toBe(true); expect(getTicketCount()).toBe(remaining); }
    expect(useTicket()).toBe(false);
    expect(getWeeklyTicketsBought()).toBe(3);
  });

  it('损坏的票数不能作为可用票，存储失败不会报告扣票成功', () => {
    for(const value of ['NaN','-1','1.5','2bad','Infinity']) {
      localStorage.setItem('csp_wish_tickets',value);
      expect(getTicketCount()).toBe(0);
      expect(useTicket()).toBe(false);
    }
    const storage=makeStorage();
    storage.setItem('csp_wish_tickets','2');
    vi.stubGlobal('localStorage',{...storage,setItem(){throw new Error('disk full');}});
    expect(useTicket()).toBe(false);
    expect(getTicketCount()).toBe(2);
  });
});
