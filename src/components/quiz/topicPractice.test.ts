import { describe, expect, it } from 'vitest';

import {
  availableSessionSizes,
  findPracticeTopic,
  PRACTICE_TOPICS,
  questionsForTopic,
} from './topicPractice';

describe('topic practice catalog', () => {
  it('has unique topic ids and covers requested student topics', () => {
    expect(new Set(PRACTICE_TOPICS.map(topic => topic.id)).size).toBe(PRACTICE_TOPICS.length);
    expect(findPracticeTopic('control')?.name).toBe('分支与循环');
    expect(findPracticeTopic('combinatorics')?.name).toBe('排列组合与概率');
    expect(findPracticeTopic('computer-basics')?.name).toBe('计算机常识');
  });

  it('selects questions only from the requested topic mapping', () => {
    const topic = findPracticeTopic('data-structure')!;
    const questions = [
      { id: 'a', topicId: 'tree' },
      { id: 'b', topicId: 'graph' },
      { id: 'c', topicId: 'control-structures' },
    ];
    expect(questionsForTopic(questions, topic).map(question => question.id)).toEqual(['a', 'b']);
  });

  it('only offers session sizes supported by the available pool', () => {
    expect(availableSessionSizes(4)).toEqual([]);
    expect(availableSessionSizes(5)).toEqual([5]);
    expect(availableSessionSizes(12)).toEqual([5, 10]);
    expect(availableSessionSizes(25)).toEqual([5, 10, 20]);
  });
});
