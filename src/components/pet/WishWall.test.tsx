import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WishContent } from './WishWall';
import { interpretVoteResponse } from './wishWallLogic';

describe('许愿页面', () => {
  it('失败不扣票，仅明确成功扣票', () => {
    expect(interpretVoteResponse(409, { error: '请求编号冲突' }).spendTicket).toBe(false);
    expect(interpretVoteResponse(500, { success: true }).spendTicket).toBe(false);
    expect(interpretVoteResponse(200, {}).spendTicket).toBe(false);
    expect(interpretVoteResponse(200, { success: true }).spendTicket).toBe(true);
  });
  it('只有自己的愿望显示删除按钮，已实现不能投票', () => {
    const props = { timeAgo: () => '刚刚', votingId: null, handleVote: vi.fn(), handleDelete: vi.fn() };
    const w = { id: 7, content: '新装备', display_name: '同学', votes: 3, created_at: '', is_mine: true };
    expect(renderToStaticMarkup(<WishContent w={w} {...props} />)).toContain('删除我的愿望');
    expect(renderToStaticMarkup(<WishContent w={{ ...w, is_mine: false }} {...props} />)).not.toContain('删除我的愿望');
    expect(renderToStaticMarkup(<WishContent w={{ ...w, status: 'completed' }} {...props} />)).toContain('disabled');
    expect(renderToStaticMarkup(<WishContent w={{ ...w, next_vote_at: '2099-01-01T00:00:00Z' }} {...props} />)).not.toContain('disabled');
  });
});
