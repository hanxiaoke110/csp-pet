/// <reference types="vite/client" />

declare global {
  interface Window {
    __TAURI__?: {
      event?: { listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void> };
      core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    };
    __petSM__?: { current: string; queue: unknown[]; sleeping: boolean; lastEvent: number };
    __petWake__?: () => void;
    __petUpdate__?: () => void;
    __petTrigger__?: (anim: string, duration?: number) => void;
  }
}

export {};
