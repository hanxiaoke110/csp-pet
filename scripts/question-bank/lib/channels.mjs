export const CHANNEL_RULES_REVISION = 3;

// These program sets were re-imported from local source copies and then matched
// exactly against the canonical code, children and answers. Other legacy program
// questions stay out of student channels until their source audit is complete.
// The super-20XX ids were recovered from the official papers on 2026-07-24
// (2021-2023: CCF CSP-J official papers + answer sheets; 2024: LUOGU SCP-J
// mock paper + answer key), with per-child answers cross-verified.
// NOTE: super-2021-reading-3 is deliberately NOT whitelisted — it is the same
// program as csp-j-2021-r03 (already verified), publishing both would show
// students a duplicate.
const VERIFIED_PROGRAM_IDS = new Set([
  'csp-j-2019-reading-01',
  'csp-j-2019-r03',
  'csp-j-2020-r02',
  'csp-j-2020-r03',
  'csp-j-2021-r03',
  'super-2021-completion-1',
  'super-2021-reading-1',
  'super-2021-reading-2',
  'super-2022-reading-1',
  'super-2022-reading-2',
  'super-2022-reading-3',
  'super-2023-reading-1',
  'super-2023-reading-2',
  'super-2023-reading-3',
  'super-2024-completion-1',
  'super-2024-completion-2',
  'super-2024-reading-1',
  'super-2024-reading-2',
  'super-2024-reading-3',
]);

// Secondary-provenance CSP choice questions (from reviewed_cloud / legacy_exam) are
// publishable when they have been auto_verified.  The buildChannels caller already
// pre-filters to auto_verified, so relaxing the provenance check here lets through
// questions that passed AI verification but whose paper-source audit is incomplete.
function isPublishableCsp(question) {
  // Choice questions: need verified provenance (local_source_copy or secondary)
  if (question.type === 'choice'
      && (question.provenance?.level === 'local_source_copy' || question.provenance?.level === 'secondary')) {
    return true;
  }
  // Reading / fill-in-the-blank program questions: auto_verified + has children + secondary provenance
  if (['reading', 'fillBlank'].includes(question.type)
      && question.children?.length > 0
      && (question.provenance?.level === 'local_source_copy' || question.provenance?.level === 'secondary')) {
    return true;
  }
  // Explicitly whitelisted program questions (super-challenge recovery, etc.)
  if (VERIFIED_PROGRAM_IDS.has(question.id)) {
    return true;
  }
  return false;
}

export function buildChannels(questions) {
  const verified = questions.filter(question => question.verificationStatus === 'auto_verified');
  // Official-paper super_* program questions (2021-2023 CCF CSP-J papers) are real
  // past-exam content and belong in the exam channel alongside csp_exam questions.
  // super-2024 ids come from a LUOGU mock paper and stay exclusive to super.
  const isOfficialSuperProgram = question => question.source === 'super_challenge'
    && !question.id.startsWith('super-2024-')
    && VERIFIED_PROGRAM_IDS.has(question.id);
  return {
    daily: verified.filter(question => question.source === 'gesp' && question.type === 'choice'),
    super: verified.filter(question => ['csp_exam', 'super_challenge'].includes(question.source)
      && question.exam.group === 'J'
      && ['reading', 'fillBlank'].includes(question.type)
      && question.children.length > 0
      && VERIFIED_PROGRAM_IDS.has(question.id)),
    exam: verified.filter(question => (question.source === 'csp_exam'
      && ['J', 'S'].includes(question.exam.group)
      && isPublishableCsp(question))
      || (isOfficialSuperProgram(question) && ['J', 'S'].includes(question.exam.group))),
    dungeon: verified.filter(question => (
      question.source === 'gesp'
        && question.type === 'choice'
        && question.exam.level >= 1
        && question.exam.level <= 4
    ) || (
      question.source === 'csp_exam'
        && question.exam.group === 'J'
        && isPublishableCsp(question)
    )),
  };
}
