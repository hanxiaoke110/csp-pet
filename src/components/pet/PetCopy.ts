/** Shared, factual voice for messages that originate from learning events. */
export const petCopy = {
  checkinAlready: () => '本周的打卡章已经盖好啦，稳稳的！',
  checkinSuccess: (streak: number, coins: number) => `打卡成功！连续 ${streak} 周，${coins}g 已塞进小金库。`,
  checkinFallback: () => '打卡成功！本周学习进度条 +1 格。',
  quizWrong: (knowledgePoint?: string) => knowledgePoint
    ? `这题先放进「${knowledgePoint}」小书包，去解析里找线索！`
    : '这题先不急，去解析里抓一抓关键条件。',
  quizComplete: (mode: string | null) => ({
    weekly: '本周任务通关！奖励已到账，错题小怪还要不要顺手收拾？',
    extra: '额外挑战拿下！今天的加练 buff 已叠满。',
    super: '超级挑战完成！去看看哪块知识点还藏着小 Boss。',
    review: '错题复盘完成！这只小怪已经被你收服啦。',
    free: '这一组刷完啦！再来一题，还是去喝口水回蓝？',
  })[mode || 'free'] || '这一轮完成啦，智子举爪！',
  courseUnderstood: () => '这题通关！试着用自己的话把思路讲给智子听？',
  examWrong: () => '先别急着翻页，去解析里找找那个“捣蛋条件”。',
  examResult: (correct: number, total: number, passed: boolean) => passed
    ? `答对 ${correct}/${total}！这波思路抓得很牢。`
    : `答对 ${correct}/${total}，去解析里捡个提示，再战下一题。`,
  examReward: (exp: number, coins: number, bonus = '') => `今日任务通关！+${exp} EXP、+${coins} 金币${bonus ? `，${bonus}` : ''}。`,
  levelUp: (level: number, title: string) => ({
    5: `叮！智子升级到 ${title}，抽卡大门打开啦。`,
    10: `叮！智子升级到 ${title}，每周自动领 20g 小零花。`,
    15: `叮！智子升级到 ${title}，保底缩到 50 抽，欧气加载中！`,
  })[level] || `叮！智子升级到 ${title}。`,
  maxLevel: () => '满级达成！智子已经是传说中的学习搭子啦。',
  hunger: (level: 'low' | 'veryLow' | 'empty') => ({
    low: '肚子咕噜咕噜，路过背包时给我带点零食吧。',
    veryLow: '智子能量条有点见底，投喂一下就能满血复活！',
    empty: '智子饿到打不出小火花啦，方便时来一口食物？',
  })[level],
};
