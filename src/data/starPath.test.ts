import { describe, expect, it } from 'vitest';
import catalog from './starPathCatalog.json';
import { isStarPathCatalog } from './starPath';

describe('star path catalog', () => {
  it('ships a valid offline task catalog with stable unique ids', () => {
    expect(isStarPathCatalog(catalog)).toBe(true);
    expect(new Set(catalog.tasks.map(task => task.id)).size).toBe(catalog.tasks.length);
    expect(catalog.tasks.length).toBeGreaterThanOrEqual(10);
  });

  it('rejects unsafe rewards and unsupported metrics from remote config', () => {
    expect(isStarPathCatalog({
      version: 2,
      updatedAt: '',
      tasks: [{
        ...catalog.tasks[0],
        metric: 'serverWrites',
        reward: { coins: 999999, exp: 20 },
      }],
    })).toBe(false);
  });
});

