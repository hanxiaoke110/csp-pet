import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WishContent } from './WishWall';
import { formatVoteCooldown, interpretVoteResponse } from './wishWallLogic';

describe('许愿页面', () => {
  it('冷却或失败不扣票，仅明确成功扣票', () => {
    expect(interpretVoteResponse(409, { error: '满14天后可再次投票' }).spendTicket).toBe(false);
    expect(interpretVoteResponse(500, { success: true }).spendTicket).toBe(false);
    expect(interpretVoteResponse(200, {}).spendTicket).toBe(false);
    expect(interpretVoteResponse(200, { success: true }).spendTicket).toBe(true);
  });
  it('准确显示冷却时间且到期开放', () => {
    const now = Date.parse('2026-10-11T00:00:00Z');
    expect(formatVoteCooldown('2026-10-25 00:00:00', now)).toContain('14 天');
    expect(formatVoteCooldown('2026-10-10T00:00:00Z', now)).toBe('');
    expect(formatVoteCooldown('bad', now)).toBe('');
  });
  it('只有自己的愿望显示删除按钮，已实现不能投票', () => {
    const props = { timeAgo: () => '刚刚', votingId: null, handleVote: vi.fn(), handleDelete: vi.fn() };
    const w = { id: 7, content: '新装备', display_name: '同学', votes: 3, created_at: '', is_mine: true };
    expect(renderToStaticMarkup(<WishContent w={w} {...props} />)).toContain('删除我的愿望');
    expect(renderToStaticMarkup(<WishContent w={{ ...w, is_mine: false }} {...props} />)).not.toContain('删除我的愿望');
    expect(renderToStaticMarkup(<WishContent w={{ ...w, status: 'completed' }} {...props} />)).toContain('disabled');
  });
});
