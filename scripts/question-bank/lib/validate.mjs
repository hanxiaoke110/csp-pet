const EXTERNAL_CODE_REFERENCE = /(?:阅读|观察|分析)?(?:下面|下列|以下|上面)(?:的)?(?:C\+\+)?(?:代码|程序)|横线处|空白处|代码如下/;
const INLINE_CODE = /(?:cout|cin|printf|scanf|for\s*\(|while\s*\(|if\s*\(|#include|int\s+main|[;{}])/;
const OPTION_PREFIX = /^[A-DＡ-Ｄ][.、．:\s)]*/i;

function optionPayload(option) {
  return String(option || '').trim().replace(OPTION_PREFIX, '').trim();
}

function hasPlaceholderOptions(options) {
  return options.length > 0 && options.every(option => !optionPayload(option) || /^[A-DＡ-Ｄ]$/i.test(optionPayload(option)));
}

function validateAnswer(options, correctIndex) {
  return Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length;
}

export function validateQuestion(question) {
  const blockers = [];
  const warnings = [];

  if (!question.id) blockers.push('missing_id');
  if (!question.question) blockers.push('missing_question');
  if (!['choice', 'boolean', 'reading', 'fillBlank'].includes(question.type)) blockers.push('unsupported_type');

  if (['choice', 'boolean'].includes(question.type)) {
    const minimum = question.type === 'boolean' ? 2 : 4;
    if (question.options.length < minimum) blockers.push('insufficient_options');
    if (!validateAnswer(question.options, question.answer.correctIndex)) blockers.push('answer_out_of_range');
    if (hasPlaceholderOptions(question.options)) blockers.push('placeholder_options');
    const normalized = question.options.map(optionPayload);
    if (new Set(normalized).size !== normalized.length) blockers.push('duplicate_options');
  }

  if (EXTERNAL_CODE_REFERENCE.test(question.question)
      && !question.code
      && question.assets.length === 0
      && !INLINE_CODE.test(question.question)) {
    blockers.push('missing_code_context');
  }

  if (question.assets.some(source => /\/gesp-code-images\//.test(source))) {
    if (question.code) warnings.push('drop_untrusted_answer_sheet_image');
    else blockers.push('untrusted_answer_sheet_image');
  }

  if (['reading', 'fillBlank'].includes(question.type)) {
    if (question.children.length === 0) blockers.push('missing_children');
    for (const child of question.children) {
      if (child.options.length > 0 && !validateAnswer(child.options, child.correctIndex)) {
        blockers.push('child_answer_out_of_range');
        break;
      }
    }
  }

  if (!question.explanation) warnings.push('missing_explanation');
  if (!question.knowledgePoint || question.knowledgePoint === '未分类') warnings.push('missing_knowledge_point');
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export function decideVerdict(question, evidence = {}) {
  const structural = validateQuestion(question);
  if (structural.blockers.length > 0) {
    return { status: 'broken', blockers: structural.blockers, warnings: structural.warnings, evidence };
  }

  const expected = question.answer.correctIndex;
  const modelAnswers = Array.isArray(evidence.modelAnswers)
    ? evidence.modelAnswers.filter(Number.isInteger)
    : [];
  if (evidence.textSimilarity >= 0.92
      && Number.isInteger(evidence.extractedAnswerIndex)
      && evidence.extractedAnswerIndex !== expected) {
    return { status: 'disputed', blockers: ['official_answer_conflict'], warnings: structural.warnings, evidence };
  }
  if (Number.isInteger(evidence.deterministicAnswer) && evidence.deterministicAnswer !== expected) {
    return { status: 'disputed', blockers: ['deterministic_conflict'], warnings: structural.warnings, evidence };
  }
  if (modelAnswers.length >= 2 && new Set(modelAnswers).size > 1) {
    return { status: 'disputed', blockers: ['model_conflict'], warnings: structural.warnings, evidence };
  }
  if (!evidence.explanationVerified) {
    return { status: 'auto_probable', blockers: ['explanation_unverified'], warnings: structural.warnings, evidence };
  }
  if (evidence.officialMatch) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }

  const modelsAgree = evidence.modelComplete
    && modelAnswers.length >= 2
    && modelAnswers.every(answer => answer === expected);
  if (modelsAgree && evidence.deterministicAnswer === expected) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }
  if (modelsAgree && Array.isArray(evidence.knowledgeSources) && evidence.knowledgeSources.length >= 2) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }
  return { status: 'auto_probable', blockers: ['insufficient_evidence'], warnings: structural.warnings, evidence };
}
