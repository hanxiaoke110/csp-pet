import { describe, expect, it } from 'vitest';
import { isTrueFalseItem, type SubItem } from './ExamMultiPart';

function makeItem(options: string[], label = '判断题16：程序不会越界。'): SubItem {
  return { label, options, correctIndex: 1 };
}

describe('ExamMultiPart 判断题识别', () => {
  it('带空 C/D 的判断题仍只按二选一处理', () => {
    expect(isTrueFalseItem(makeItem(['正确', '错误', '', '']))).toBe(true);
  });

  it('兼容 A/B 前缀和对错符号', () => {
    expect(isTrueFalseItem(makeItem(['A. √ 正确', 'B. × 错误', 'C.', 'D.']))).toBe(true);
  });

  it('普通四选一不会被误判', () => {
    expect(isTrueFalseItem(makeItem(['1', '2', '3', '4'], '第1问：输出是多少？'))).toBe(false);
  });
});
