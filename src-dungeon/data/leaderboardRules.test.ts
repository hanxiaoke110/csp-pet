import { describe, expect, it } from 'vitest';
import { DEFAULT_LEADERBOARD_RULES, normalizeLeaderboardRules } from './leaderboardRules';

describe('排行榜在线说明客户端兜底', () => {
  it('缺失项目会按固定键补齐，未知项目不会进入页面', () => {
    const result = normalizeLeaderboardRules({
      title: '在线说明',
      rules: [
        { key: 'power', label: '积分', description: '在线积分说明' },
        { key: 'unknown', label: '未知', description: '未知规则' },
      ],
      ssCriteria: [],
    });

    expect(result.title).toBe('在线说明');
    expect(result.rules).toHaveLength(DEFAULT_LEADERBOARD_RULES.rules.length);
    expect(result.rules[0]).toMatchObject({ key: 'power', label: '积分' });
    expect(result.rules.some(rule => (rule.key as string) === 'unknown')).toBe(false);
    expect(result.ssCriteria).toEqual(DEFAULT_LEADERBOARD_RULES.ssCriteria);
  });

  it('空文案不会覆盖内置说明', () => {
    const result = normalizeLeaderboardRules({
      title: '   ',
      rules: [{ key: 'power', label: '', description: '' }],
      footer: '',
    });

    expect(result.title).toBe(DEFAULT_LEADERBOARD_RULES.title);
    expect(result.rules[0]).toEqual(DEFAULT_LEADERBOARD_RULES.rules[0]);
    expect(result.footer).toBe(DEFAULT_LEADERBOARD_RULES.footer);
  });
});
