import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts/question-bank/data/original-topic-practice.json'),
  'utf8',
));

const expectedCounts = {
  '组合数学': 20,
  '贪心算法': 18,
  '动态规划': 13,
  '排序与查找': 11,
  '洪水填充与搜索': 20,
};

assert.equal(data.source, 'practice_original');
assert.equal(data.questionCount, 82);
assert.equal(data.questions.length, 82);
assert.equal(new Set(data.questions.map(question => question.id)).size, 82);
assert.equal(new Set(data.questions.map(question => question.question.replace(/\s+/g, ''))).size, 82);

for (const [knowledgePoint, expected] of Object.entries(expectedCounts)) {
  assert.equal(
    data.questions.filter(question => question.knowledgePoint === knowledgePoint).length,
    expected,
    knowledgePoint,
  );
}

for (const question of data.questions) {
  assert.equal(question.source, 'practice_original', question.id);
  assert.equal(question.questionType, 'choice', question.id);
  assert.equal(question.options.length, 4, question.id);
  assert.ok(question.options.every(option => String(option).trim()), question.id);
  assert.equal(new Set(question.options).size, 4, question.id);
  assert.ok(Number.isInteger(question.correctIndex), question.id);
  assert.ok(question.correctIndex >= 0 && question.correctIndex < 4, question.id);
  assert.ok(question.explanation.length >= 12, question.id);
}

const answerDistribution = [0, 0, 0, 0];
for (const question of data.questions) answerDistribution[question.correctIndex] += 1;
assert.ok(Math.max(...answerDistribution) - Math.min(...answerDistribution) <= 8,
  `answer position skew: ${answerDistribution.join('/')}`);

console.log(`Original topic-practice source passed 82-question integrity checks; answers=${answerDistribution.join('/')}.`);
