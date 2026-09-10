import { describe, expect, it } from 'vitest';
import { formatChoiceOption } from './questionDisplay';

describe('formatChoiceOption', () => {
  it('removes a duplicated option label', () => {
    expect(formatChoiceOption('A. cin可以从键盘读取数据')).toBe('cin可以从键盘读取数据');
  });

  it('unwraps markdown code without removing C++ character quotes', () => {
    expect(formatChoiceOption("C. `for(char c='A';c<'z';c++);`")).toBe("for(char c='A';c<'z';c++);");
  });

  it('does not change ordinary option content', () => {
    expect(formatChoiceOption('标准输入流')).toBe('标准输入流');
  });
});
