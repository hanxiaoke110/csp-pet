const EXTERNAL_CODE_REFERENCE = /(?:阅读|观察|分析)?(?:下面|下列|以下|上面)(?:的)?(?:C\+\+)?(?:代码|程序)|横线处|空白处|代码如下/;
const EXTERNAL_VISUAL_REFERENCE = /(?:右边|左边|下方|上方|下图|上图|图中)(?:的)?(?:无向图|有向图|示意图|图|表格|图片)/;
const INLINE_CODE = /(?:cout|cin|printf|scanf|for\s*\(|while\s*\(|if\s*\(|#include|int\s+main|[;{}])/;
const OPTION_PREFIX = /^[A-DＡ-Ｄ](?:[.、．:)]|\s)+/i;

function optionPayload(option) {
  return String(option || '').trim().replace(OPTION_PREFIX, '').trim();
}

function hasPlaceholderOptions(options) {
  return options.length > 0 && options.every(option => !optionPayload(option) || /^[A-DＡ-Ｄ]$/.test(optionPayload(option)));
}

// Single-letter options are genuinely meaningful when the question stem treats
// the letters as entities (e.g. logic puzzles "有ABCD4个人…A说：…").
function stemReferencesLetterEntities(questionText) {
  return /[A-DＡ-Ｄ]{4}/.test(questionText) || /[A-DＡ-Ｄ]\s*(?:说|问|答|猜)/.test(questionText);
}

function validateAnswer(options, correctIndex) {
  return Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length;
}

function answerVector(question) {
  return question.children.length > 0
    ? question.children.map(child => child.correctIndex)
    : [question.answer.correctIndex];
}

function vectorsEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
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
    // Placeholder options signal a failed options recovery — but single-letter
    // options are legitimate when the program prints a letter (code present)
    // or when the stem references lettered entities (logic puzzles).
    if (hasPlaceholderOptions(question.options)
        && !question.code
        && question.assets.length === 0
        && !stemReferencesLetterEntities(question.question)) {
      blockers.push('placeholder_options');
    }
    const normalized = question.options.map(optionPayload);
    if (new Set(normalized).size !== normalized.length) blockers.push('duplicate_options');
  }

  // Code referenced by the stem may legitimately live inside the options
  // (e.g. "下列程序能够正确执行的是" with code in each option).
  const optionsHaveCode = question.options.some(option => INLINE_CODE.test(String(option)));
  if (EXTERNAL_CODE_REFERENCE.test(question.question)
      && !question.code
      && question.assets.length === 0
      && !optionsHaveCode
      && !INLINE_CODE.test(question.question)) {
    blockers.push('missing_code_context');
  }
  if (EXTERNAL_VISUAL_REFERENCE.test(question.question) && question.assets.length === 0) {
    blockers.push('missing_visual_context');
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

  // Human adjudication wins over every automated conflict check below. Only
  // honored when the reviewer recorded an explicit approval with provenance
  // (who/when/why) — used after a documented multi-source review resolves a
  // dispute in favor of the canonical answer.
  if (evidence.manualVerified?.approved === true) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }

  const expected = question.answer.correctIndex;
  const expectedVector = answerVector(question);
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
  // Models unanimously agree with each other but contradict the canonical
  // answer: this is how the 16 mis-keyed canonical answers were found. Treat
  // it as disputed (needs human adjudication), not merely auto_probable.
  if (modelAnswers.length >= 3
      && modelAnswers.every(answer => answer === modelAnswers[0])
      && modelAnswers[0] !== expected) {
    return { status: 'disputed', blockers: ['model_canonical_conflict'], warnings: structural.warnings, evidence };
  }
  const cspVectors = Array.isArray(evidence.multipartModelAnswers)
    ? evidence.multipartModelAnswers.filter(Array.isArray)
    : [];
  const cspModelsAgree = evidence.modelComplete
    && cspVectors.length >= 4
    && cspVectors.every(vector => vectorsEqual(vector, expectedVector));
  if (cspVectors.length >= 2
      && cspVectors.every(vector => vector.every(Number.isInteger))
      && cspVectors.every(vector => vectorsEqual(vector, cspVectors[0]))
      && !vectorsEqual(cspVectors[0], expectedVector)) {
    return { status: 'disputed', blockers: ['csp_model_answer_conflict'], warnings: structural.warnings, evidence };
  }
  if (evidence.modelAmbiguous) {
    return { status: 'disputed', blockers: ['model_reports_ambiguity'], warnings: structural.warnings, evidence };
  }
  const fiveJuryConsensus = evidence._5juryConsensus
    && modelAnswers.length >= 5
    && modelAnswers.every(answer => answer === expected);

  if (!evidence.explanationVerified && !fiveJuryConsensus) {
    return { status: 'auto_probable', blockers: ['explanation_unverified'], warnings: structural.warnings, evidence };
  }
  if (evidence.officialMatch) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }
  if (question.source === 'csp_exam' && cspModelsAgree) {
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
  if (fiveJuryConsensus) {
    return { status: 'auto_verified', blockers: [], warnings: structural.warnings, evidence };
  }
  return { status: 'auto_probable', blockers: ['insufficient_evidence'], warnings: structural.warnings, evidence };
}
