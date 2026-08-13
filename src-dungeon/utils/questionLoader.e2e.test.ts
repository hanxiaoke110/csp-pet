// 端到端验证：真实 loadQuestionBank()（V2 会话 + 适配器 + 排除名单）+ 真实抽题函数，
// 逐副本逐技能断言有题可出。数据来自 public/ 实际打包文件（与发布产物一致）。
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// node 环境无 window：excludedQuestions 用到 window.setTimeout，补最小 shim
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = { setTimeout, clearTimeout };
}

import { getQuestionPlanCoverage, loadQuestionBank, pickStagePlanQuestions } from './questionLoader';
import { DUNGEON_QUESTION_PLANS } from '../data/question-plans';

// fetch 映射到 public/ 下的真实文件（模拟生产打包后的 /course-data/ 协议）
beforeAll(() => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input);
    if (url.startsWith('/')) {
      const filePath = join(__dirname, '../../public', url);
      try {
        const text = readFileSync(filePath, 'utf8');
        return new Response(text, { status: 200 });
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    // 远程（Gitee 排除名单 / 教师复核 API 等）：让 V2 优先路径生效即可，远程返回失败走缓存/内置
    return new Response('unavailable', { status: 503 });
  }) as typeof fetch;
  void originalFetch;
});

describe('试炼场题库端到端（真实加载链）', () => {
  it('新赛季每个小关都有独立题池并能抽题', async () => {
    const bank = await loadQuestionBank();
    expect(bank.length).toBeGreaterThan(500);

    for (const plan of DUNGEON_QUESTION_PLANS) {
      const questions = pickStagePlanQuestions(bank, plan.dungeonId, plan.stageId, 5);
      expect(questions.length, `${plan.stageId} 应有完整五题`).toBe(5);
      expect(new Set(questions.map(question => question.id)).size, `${plan.stageId} 单场不得重复`).toBe(5);
      expect(questions.some(question => question.group === 'S'), `${plan.stageId} 不允许 CSP-S`).toBe(false);
    }

    const coverage = getQuestionPlanCoverage(bank);
    expect(coverage.filter(item => item.count === 0).map(item => item.stageId)).toEqual([]);
    // Each lesson must retain a real core pool; layered review supplies variety without changing its focus.
    expect(coverage.filter(item => item.count < 2).map(item => `${item.stageId}:${item.count}`)).toEqual([]);
  }, 30_000);

  it('排除名单远程失败时仍有题（降级内置 8 条）', async () => {
    // 远程 503 已在上面的 fetch mock 里生效，这里只复核池子规模
    const bank = await loadQuestionBank();
    const usable = bank.filter(q => q.type === 'choice' && Array.isArray(q.options) && q.options.length >= 4);
    expect(usable.length).toBeGreaterThan(400);
  }, 30_000);
});
