import { beforeEach, expect, it, vi } from 'vitest';
import { ensureTrialWalletReady } from './walletReady';
const mocks = vi.hoisted(() => ({ state: { loaded: false, load: vi.fn() } }));
vi.mock('../../src/stores/petStore', () => ({ usePetStore: { getState: () => mocks.state, setState: (patch: { loaded: boolean }) => Object.assign(mocks.state, patch) } }));
beforeEach(() => {
  mocks.state.loaded = false;
  mocks.state.load.mockReset();
  vi.stubGlobal('localStorage', { getItem: () => null });
});
it('进入独立试炼入口时先等待旧钱包载入', async () => {
  let finish!: (ok: boolean) => void;
  mocks.state.load.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  let ready = false;
  const pending = ensureTrialWalletReady().then(() => { ready = true; });
  expect(ready).toBe(false);
  finish(true);
  await pending;
  expect(ready).toBe(true);
});
it('主窗口已载入钱包时不重复覆盖内存余额', async () => {
  mocks.state.loaded = true;
  await ensureTrialWalletReady();
  expect(mocks.state.load).not.toHaveBeenCalled();
});
it('损坏旧钱包不能被默认200金币覆盖', async () => {
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  mocks.state.load.mockResolvedValue(false);
  await expect(ensureTrialWalletReady()).rejects.toThrow('存档');
  await expect(ensureTrialWalletReady()).rejects.toThrow('存档');
});
