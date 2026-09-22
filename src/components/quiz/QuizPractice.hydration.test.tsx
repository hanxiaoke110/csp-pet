import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuizPetGate } from './QuizPractice';

function renderGate(loaded: boolean): string {
  return renderToStaticMarkup(<QuizPetGate loaded={loaded} onAdopt={() => {}} />);
}

describe('选择题智子恢复入口', () => {
  it('旧用户存档尚未恢复时不误报需要重新领养', () => {
    expect(renderGate(false)).toContain('正在恢复智子资料');
    expect(renderGate(false)).not.toContain('请先领养');
  });

  it('恢复完成且确实没有智子时才显示领养入口', () => {
    expect(renderGate(true)).toContain('请先领养一只灵犀智子');
  });
});
