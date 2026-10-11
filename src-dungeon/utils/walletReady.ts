import { usePetStore } from '../../src/stores/petStore';

let loading: Promise<void> | null = null;

/** The standalone trial page does not run the main application's hydration. */
export async function ensureTrialWalletReady(): Promise<void> {
  if (loading) return loading;
  if (usePetStore.getState().loaded) return;
  loading = (async () => {
    const restored = await usePetStore.getState().load();
    if (!restored && localStorage.getItem('csp_pet_data')) {
      usePetStore.setState({ loaded: false });
      // Do not let a failed old-profile load turn into a save of default coins.
      throw new Error('金币与智子存档未能读取，请先恢复备份，原存档未修改。');
    }
  })();
  try { await loading; } finally { loading = null; }
}
