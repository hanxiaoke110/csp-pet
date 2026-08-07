import type { CanonicalQuestion } from './types';

export function toLegacyQuestion(question: CanonicalQuestion, source = question.source) {
  const children = (question.children || []).map((child, index) => ({
    label: child.label || `第 ${index + 1} 小问`,
    position: child.position ?? index + 1,
    options: child.options,
    correctIndex: child.correctIndex as number,
    explanation: child.explanation,
  }));
  // 兜底：带代码、没有独立选项、却有 children 的“选择题”，本质是程序阅读题。
  // 按阅读题转换，避免在选择题入口渲染出“有题干没选项”的空白页。
  const hasCode = Boolean(question.code);
  const looksLikeReading = question.type === 'choice'
    && hasCode
    && !(question.options && question.options.length > 0)
    && children.length > 0;
  const effectiveType = looksLikeReading ? 'reading' : question.type;
  // canonical 数据里 GESP 题的 exam.group 为 null（级别在 exam.level 上），
  // 下游（试炼场技能抽题等）按 group === 'GESP' && level <= 4 过滤，
  // 不推断会让全部 GESP 题被滤掉，高难副本无题可出。
  const group = question.exam.group ?? (source === 'gesp' ? 'GESP' : question.exam.group);
  return {
    id: question.id,
    source,
    year: question.exam.year,
    group,
    level: question.exam.level ?? undefined,
    type: effectiveType,
    knowledgePoint: question.knowledgePoint,
    difficulty: question.difficulty,
    question: question.question,
    code: question.code || undefined,
    image: question.assets[0] || null,
    codeImage: null,
    options: question.options,
    correctIndex: question.answer.correctIndex as number,
    explanation: question.explanation,
    subQuestions: effectiveType === 'reading' ? children : undefined,
    blanks: effectiveType === 'fillBlank' ? children : undefined,
    answers: children.map(child => child.correctIndex),
  };
}
