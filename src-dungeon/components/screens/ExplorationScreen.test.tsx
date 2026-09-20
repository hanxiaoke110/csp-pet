import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EXPLORATION_STAGE_CONFIGS } from '../../data/explorationStages';
import type { Question } from '../../types/dungeon';
import { EventModal } from './ExplorationScreen';

const event = { id: 'seal-test', type: 'seal' as const, position: { x: 1, y: 1 }, questionIndex: 0 };
const handlers = {
  onResolve: vi.fn(),
  onChooseRoute: vi.fn(),
  onClose: vi.fn(),
  onFinish: vi.fn(),
};

function renderQuestion(question: Question) {
  return renderToStaticMarkup(
    <EventModal
      config={EXPLORATION_STAGE_CONFIGS[0]}
      event={event}
      question={question}
      sealsSolved={0}
      {...handlers}
    />,
  );
}

const baseQuestion: Question = {
  id: 'question-test',
  year: 2026,
  group: 'GESP',
  type: 'choice',
  knowledgePoint: '控制结构',
  difficulty: 1,
  question: '下面代码输出什么？',
  options: ['1', '2', '3', '4'],
  correctIndex: 0,
};

describe('迷宫知识封印题目素材', () => {
  it('显示题库已有的结构化代码', () => {
    const html = renderQuestion({ ...baseQuestion, code: 'int x=1;\ncout<<x;' });
    expect(html).toContain('explore-question-code');
    expect(html).toContain('int x=1;');
    expect(html).toContain('cout&lt;&lt;x;');
  });

  it('显示可信题目图片', () => {
    const html = renderQuestion({ ...baseQuestion, image: '/course-data/question-images/example.png' });
    expect(html).toContain('explore-question-image');
    expect(html).toContain('src="/course-data/question-images/example.png"');
    expect(html).toContain('alt="题目配图"');
  });
});
