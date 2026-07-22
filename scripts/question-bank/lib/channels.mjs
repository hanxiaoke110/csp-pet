export const CHANNEL_RULES_REVISION = 1;

export function buildChannels(questions) {
  const verified = questions.filter(question => question.verificationStatus === 'auto_verified');
  return {
    daily: verified.filter(question => question.source === 'gesp' && question.type === 'choice'),
    super: verified.filter(question => question.source === 'csp_exam'
      && question.exam.group === 'J'
      && ['reading', 'fillBlank'].includes(question.type)
      && question.children.length > 0),
    exam: verified.filter(question => question.source === 'csp_exam'
      && ['J', 'S'].includes(question.exam.group)),
    dungeon: verified.filter(question => (
      question.source === 'gesp'
        && question.type === 'choice'
        && question.exam.level >= 1
        && question.exam.level <= 4
    ) || (
      question.source === 'csp_exam'
        && question.exam.group === 'J'
    )),
  };
}
