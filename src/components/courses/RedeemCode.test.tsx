// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RedeemCode from './RedeemCode';
import { usePetStore } from '../../stores/petStore';
import { createTestLockManager } from '../../testSupport/webLocks';

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { locks: createTestLockManager() });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  localStorage.clear();
  const saved = { ownedPets: [], activePetId: null, coins: 200, maxCoinBalance: 200, expPool: 0 };
  localStorage.setItem('csp_pet_data', JSON.stringify(saved));
  usePetStore.setState({ ...saved, loaded: true });
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<RedeemCode onClose={() => {}} />));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function enter(code: string) {
  const input = document.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}
function redeemButton() { return [...document.querySelectorAll('button')].find(b => b.textContent === '兑换')!; }

it('repeated click and Enter redeem EXC once offline without overwriting success', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  const input = await enter('  exc-1-1016-g6th-7s2x  ');
  const button = redeemButton();
  await act(async () => {
    button.click(); button.click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('优秀学生奖励');
  expect(document.body.textContent).not.toContain('已被使用');
  expect(usePetStore.getState().coins).toBe(260);
});

it('CMP still sends one online request, blocks in-flight clicks, and permits retry after failure', async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn((_url: string, _options: RequestInit) => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', request);
  await enter('cmp-test');
  const button = redeemButton();
  await act(async () => { button.click(); button.click(); });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe('https://api.cspstudy.top/api/codes/redeem-v2');
  expect(document.querySelector('input')!.disabled).toBe(true);
  await act(async () => finish(new Response(JSON.stringify({ error: '测试：未兑换' }), { status: 400 })));
  expect(document.body.textContent).toContain('测试：未兑换');
  expect(usePetStore.getState().coins).toBe(200);
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === '重新输入')!.click());
  await enter('cmp-test');
  await act(async () => redeemButton().click());
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => finish(new Response(JSON.stringify({ success: true, receipt_id: 'cmp-v2:CMP-TEST', coins: 20, exp: 30 }), { status: 200 })));
  expect(document.body.textContent).toContain('补偿到账');
  expect(usePetStore.getState().coins).toBe(220);
  expect(usePetStore.getState().expPool).toBe(30);
});

it('does not accept a compensation code offline or fall back to local rewards', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  await enter('CMP-TEST');
  await act(async () => redeemButton().click());
  expect(document.body.textContent).toContain('网络连接失败');
  expect(usePetStore.getState().coins).toBe(200);
  expect(localStorage.getItem('csp_used_comp_codes')).toBeNull();
});
