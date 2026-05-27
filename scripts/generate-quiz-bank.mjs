/**
 * Batch generate CSP-style quiz questions for all problems.
 * Run: cd scripts && node generate-quiz-bank.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.DEEPSEEK_KEY || '';
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

const lessons = JSON.parse(readFileSync('../public/course-data/lessons.json', 'utf-8'));
const quizBank = {};
let totalProblems = 0;

// Collect all problems that need verification
const problems = [];
for (const stage of lessons.stages) {
  for (const lesson of stage.lessons) {
    for (const section of ['homework', 'inClassCodes', 'extended']) {
      for (const p of lesson[section] || []) {
        problems.push({ lesson, section, problem: p });
        totalProblems++;
      }
    }
  }
}

console.log(`Total problems to generate: ${totalProblems}`);

// Check existing
let existing = {};
try {
  existing = JSON.parse(readFileSync('../public/course-data/quiz-bank.json', 'utf-8'));
  console.log(`Already have ${Object.keys(existing).length} questions cached`);
} catch { /* none yet */ }

async function generateOne(prob) {
  const key = prob.problem.id;
  if (existing[key]) return existing[key];

  const codeSnippet = (prob.problem.code || prob.problem.answerCode || '').slice(0, 400);
  const mistakes = (prob.problem.commonMistakes || []).map(m => m.mistake).join('、');

  const prompt = `你是CSP-J/S和GESP出题专家。根据下面题目生成1道选择题（4选项），风格接近CSP-J/S第一轮真题。

【原题】
标题：${prob.problem.title}
描述：${(prob.problem.description || '').slice(0, 200)}
${mistakes ? '常见错误：' + mistakes : ''}
${codeSnippet ? '参考代码：\n\`\`\`cpp\n' + codeSnippet + '\n\`\`\`' : ''}

【规则】1.有代码优先出代码阅读题（问输出/功能）2.选项有迷惑性 3.适合CSP-J入门组难度

【仅输出JSON】{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"correctIndex":0}`;

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, max_tokens: 500,
      }),
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const q = JSON.parse(match[0]);
      if (q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctIndex === 'number') {
        return q;
      }
    }
    console.log(`  Failed to parse for ${prob.problem.title.slice(0, 30)}`);
    return null;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return null;
  }
}

// Generate in batches with delay
const BATCH_SIZE = 5;
let done = 0;

for (let i = 0; i < problems.length; i += BATCH_SIZE) {
  const batch = problems.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(batch.map(generateOne));

  for (let j = 0; j < batch.length; j++) {
    if (results[j]) {
      existing[batch[j].problem.id] = results[j];
    }
  }

  done += batch.length;
  console.log(`Progress: ${done}/${totalProblems}`);

  // Save progress every batch
  writeFileSync('../public/course-data/quiz-bank.json', JSON.stringify(existing, null, 2));

  // Rate limit
  if (i + BATCH_SIZE < problems.length) {
    await new Promise(r => setTimeout(r, 1000));
  }
}

console.log(`Done! Generated ${Object.keys(existing).length} questions`);
