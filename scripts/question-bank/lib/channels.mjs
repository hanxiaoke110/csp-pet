export const CHANNEL_RULES_REVISION = 2;

// These program sets were re-imported from local source copies and then matched
// exactly against the canonical code, children and answers. Other legacy program
// questions stay out of student channels until their source audit is complete.
const VERIFIED_PROGRAM_IDS = new Set([
  'csp-j-2019-reading-01',
  'csp-j-2019-r03',
  'csp-j-2020-r02',
  'csp-j-2020-r03',
  'csp-j-2021-r03',
]);

function isPublishableCsp(question) {
  return (question.type === 'choice' && question.provenance?.level === 'local_source_copy')
    || VERIFIED_PROGRAM_IDS.has(question.id);
}

export function buildChannels(questions) {
  const verified = questions.filter(question => question.verificationStatus === 'auto_verified');
  return {
    daily: verified.filter(question => question.source === 'gesp' && question.type === 'choice'),
    super: verified.filter(question => question.source === 'csp_exam'
      && question.exam.group === 'J'
      && ['reading', 'fillBlank'].includes(question.type)
      && question.children.length > 0
      && VERIFIED_PROGRAM_IDS.has(question.id)),
    exam: verified.filter(question => question.source === 'csp_exam'
      && ['J', 'S'].includes(question.exam.group)
      && isPublishableCsp(question)),
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
