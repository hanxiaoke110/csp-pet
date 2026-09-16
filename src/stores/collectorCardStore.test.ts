import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

import { usePetStore } from './petStore';
import { COLLECTOR_CARD_LS_KEY, useCollectorCardStore } from './collectorCardStore';

describe('collectorCardStore', () => {
  beforeEach(() => {
    values.clear();
    usePetStore.setState({ coins: 1000 });
    useCollectorCardStore.setState({ ownedCards: [], loaded: true });
  });

  it('charges coins once and permanently records ownership', () => {
    expect(useCollectorCardStore.getState().purchase('card-001', 888)).toEqual({ ok: true });
    expect(usePetStore.getState().coins).toBe(112);
    expect(useCollectorCardStore.getState().isOwned('card-001')).toBe(true);
    expect(useCollectorCardStore.getState().purchase('card-001', 888)).toEqual({ ok: false, reason: 'owned' });
    expect(usePetStore.getState().coins).toBe(112);
    expect(JSON.parse(values.get(COLLECTOR_CARD_LS_KEY) || '{}').ownedCards).toHaveLength(1);
  });

  it('does not unlock a card when coins are insufficient', () => {
    usePetStore.setState({ coins: 100 });
    expect(useCollectorCardStore.getState().purchase('card-002', 888)).toEqual({ ok: false, reason: 'coins' });
    expect(useCollectorCardStore.getState().isOwned('card-002')).toBe(false);
    expect(usePetStore.getState().coins).toBe(100);
  });

  it('restores owned ids without duplicate entries', async () => {
    values.set(COLLECTOR_CARD_LS_KEY, JSON.stringify({
      ownedCards: [
        { cardId: 'card-001', acquiredAt: '2026-09-15T00:00:00.000Z' },
        { cardId: 'card-001', acquiredAt: '2026-09-15T00:00:00.000Z' },
      ],
    }));
    useCollectorCardStore.setState({ ownedCards: [], loaded: false });
    await useCollectorCardStore.getState().load();
    expect(useCollectorCardStore.getState().ownedCards).toHaveLength(1);
  });
});
