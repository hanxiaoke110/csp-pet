export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'course' | 'quiz' | 'super' | 'pet' | 'hidden';
  icon: string;
  hidden?: boolean;
  check: () => { unlocked: boolean; progress?: number; total?: number };
}

// Helper: count completed course problems from localStorage
function getCompletedCount(): number {
  try {
    const saved = localStorage.getItem('csp_problem_status');
    if (!saved) return 0;
    const all = JSON.parse(saved);
    return Object.values(all).filter((s: unknown) => s === 'completed').length;
  } catch { return 0; }
}

function getWeeklyTaskCount(): number {
  try {
    const saved = localStorage.getItem('csp_quiz_state');
    if (!saved) return 0;
    return JSON.parse(saved).weeklyCompletions || 0;
  } catch { return 0; }
}

function getWeeklyPerfectCount(): number {
  try {
    const saved = localStorage.getItem('csp_quiz_state');
    if (!saved) return 0;
    return JSON.parse(saved).weeklyPerfects || 0;
  } catch { return 0; }
}

function getFreeStreak(): number {
  try {
    return parseInt(localStorage.getItem('csp_free_streak') || '0');
  } catch { return 0; }
}

export function createAchievements(
  petCount: number,
  activePetLevel: number,
  activePetAffection: number,
  totalCoins: number,
  feedCount: number,
  _hasAllElements: boolean,
  superCompletions: number,
  superBestScore: number,
  superBestTotal: number,
  weeklyPerfects: number,
  extraChallengeCount: number,
  lastReviewCorrect: number,
  lastReviewTotal: number,
  ownedPets: { petName?: string; hunger?: number }[],
): Achievement[] {
  return [
    // === 📚 学海无涯 ===
    { id: 'course-1', name: '初出茅庐', description: '完成第 1 道课程验证', category: 'course', icon: '🌱',
      check: () => ({ unlocked: getCompletedCount() >= 1 }) },
    { id: 'course-10', name: '小试牛刀', description: '完成 10 道课程验证', category: 'course', icon: '📝',
      check: () => ({ unlocked: getCompletedCount() >= 10, progress: Math.min(getCompletedCount(), 10), total: 10 }) },
    { id: 'course-30', name: '渐入佳境', description: '完成 30 道课程验证', category: 'course', icon: '📚',
      check: () => ({ unlocked: getCompletedCount() >= 30, progress: Math.min(getCompletedCount(), 30), total: 30 }) },
    { id: 'course-60', name: '题海战术', description: '完成 60 道课程验证', category: 'course', icon: '💪',
      check: () => ({ unlocked: getCompletedCount() >= 60, progress: Math.min(getCompletedCount(), 60), total: 60 }) },
    { id: 'course-100', name: '百炼成钢', description: '完成 100 道课程验证', category: 'course', icon: '🏆',
      check: () => ({ unlocked: getCompletedCount() >= 100, progress: Math.min(getCompletedCount(), 100), total: 100 }) },
    { id: 'stage-c1', name: 'C1 毕业', description: '完成 10 道课程验证', category: 'course', icon: '🎓',
      check: () => ({ unlocked: getCompletedCount() >= 10, progress: Math.min(getCompletedCount(), 10), total: 10 }) },
    { id: 'stage-c2', name: 'C2 毕业', description: '完成 30 道课程验证', category: 'course', icon: '🎓',
      check: () => ({ unlocked: getCompletedCount() >= 30, progress: Math.min(getCompletedCount(), 30), total: 30 }) },
    { id: 'stage-c3', name: 'C3 毕业', description: '完成 60 道课程验证', category: 'course', icon: '🎓',
      check: () => ({ unlocked: getCompletedCount() >= 60, progress: Math.min(getCompletedCount(), 60), total: 60 }) },
    { id: 'stage-c4', name: 'C4 毕业', description: '完成 100 道课程验证', category: 'course', icon: '🎓',
      check: () => ({ unlocked: getCompletedCount() >= 100, progress: Math.min(getCompletedCount(), 100), total: 100 }) },

    // === 🧠 头脑风暴 ===
    { id: 'quiz-weekly-1', name: '周常首胜', description: '完成 1 次每周任务', category: 'quiz', icon: '📋',
      check: () => ({ unlocked: getWeeklyTaskCount() >= 1 }) },
    { id: 'quiz-weekly-5', name: '周常熟手', description: '完成 5 次每周任务', category: 'quiz', icon: '📅',
      check: () => ({ unlocked: getWeeklyTaskCount() >= 5, progress: Math.min(getWeeklyTaskCount(), 5), total: 5 }) },
    { id: 'quiz-weekly-20', name: '周常老将', description: '完成 20 次每周任务', category: 'quiz', icon: '🎖️',
      check: () => ({ unlocked: getWeeklyTaskCount() >= 20, progress: Math.min(getWeeklyTaskCount(), 20), total: 20 }) },
    { id: 'quiz-perfect-1', name: '完美首秀', description: '每周任务 5/5 全对 1 次', category: 'quiz', icon: '⭐',
      check: () => ({ unlocked: getWeeklyPerfectCount() >= 1 }) },
    { id: 'quiz-perfect-5', name: '完美主义', description: '每周任务 5/5 全对 5 次', category: 'quiz', icon: '🌟',
      check: () => ({ unlocked: getWeeklyPerfectCount() >= 5, progress: Math.min(getWeeklyPerfectCount(), 5), total: 5 }) },
    { id: 'quiz-streak', name: '学霸时刻', description: '自由练习连续答对 10 题', category: 'quiz', icon: '🔥',
      check: () => ({ unlocked: getFreeStreak() >= 10, progress: Math.min(getFreeStreak(), 10), total: 10 }) },
    { id: 'quiz-extra-10', name: '额外加练', description: '完成额外挑战 10 次', category: 'quiz', icon: '💪',
      check: () => {
        try {
          const saved = JSON.parse(localStorage.getItem('csp_quiz_state') || '{}');
          const count = saved.extraChallengeCount || 0;
          return { unlocked: count >= 10, progress: Math.min(count, 10), total: 10 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'quiz-total-100', name: '选题如流', description: '累计答对 100 道选择题', category: 'quiz', icon: '🧠',
      check: () => {
        try {
          const saved = localStorage.getItem('csp_quiz_state');
          const total = saved ? (JSON.parse(saved).totalCorrect || 0) : 0;
          return { unlocked: total >= 100, progress: Math.min(total, 100), total: 100 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'quiz-review-1', name: '复盘首战', description: '完成 1 次月度复盘', category: 'quiz', icon: '📋',
      check: () => {
        try {
          const saved = localStorage.getItem('csp_quiz_state');
          return { unlocked: !!(saved && JSON.parse(saved).lastReviewDate) };
        } catch { return { unlocked: false }; }
      }},
    { id: 'quiz-review-80', name: '查漏补缺', description: '月度复盘答对 80% 以上', category: 'quiz', icon: '🎯',
      check: () => {
        try {
          const saved = JSON.parse(localStorage.getItem('csp_quiz_state') || '{}');
          const correct = saved.lastReviewCorrect || 0;
          const total = saved.lastReviewTotal || 1;
          return { unlocked: total > 0 && correct / total >= 0.8, progress: correct, total };
        } catch { return { unlocked: false }; }
      }},

    // === ⚡ 极限挑战 ===
    { id: 'super-1', name: '首闯极限', description: '完成 1 次超级挑战', category: 'super', icon: '⚡',
      check: () => ({ unlocked: superCompletions >= 1 }) },
    { id: 'super-5', name: '极限斗士', description: '完成 5 次超级挑战', category: 'super', icon: '⚔️',
      check: () => ({ unlocked: superCompletions >= 5, progress: Math.min(superCompletions, 5), total: 5 }) },
    { id: 'super-3of5', name: '进阶选手', description: '超级挑战答对 3/5 以上', category: 'super', icon: '📈',
      check: () => ({ unlocked: superBestScore >= 3 }) },
    { id: 'super-4of5', name: '差一步完美', description: '超级挑战答对 4/5', category: 'super', icon: '💎',
      check: () => ({ unlocked: superBestScore >= 4 }) },
    { id: 'super-5of5', name: '完美通关', description: '超级挑战 5/5 全对', category: 'super', icon: '👑',
      check: () => ({ unlocked: superBestScore >= 5 && superBestScore === superBestTotal }) },
    { id: 'super-double', name: '双料冠军', description: '超级完美 + 周常完美各 1 次', category: 'super', icon: '🏅',
      check: () => ({ unlocked: superBestScore >= 5 && superBestScore === superBestTotal && getWeeklyPerfectCount() >= 1 }) },

    // === 🐾 灵犀智子 ===
    { id: 'pet-first', name: '初次相遇', description: '领养第一只灵犀智子', category: 'pet', icon: '🐣',
      check: () => ({ unlocked: petCount >= 1 }) },
    { id: 'pet-2', name: '第二伙伴', description: '拥有 2 只灵犀智子', category: 'pet', icon: '🐾',
      check: () => ({ unlocked: petCount >= 2, progress: Math.min(petCount, 2), total: 2 }) },
    { id: 'pet-3', name: '小小动物园', description: '拥有 3 只灵犀智子', category: 'pet', icon: '🏠',
      check: () => ({ unlocked: petCount >= 3, progress: Math.min(petCount, 3), total: 3 }) },
    { id: 'pet-5', name: '小小收藏家', description: '拥有 5 只灵犀智子', category: 'pet', icon: '🦄',
      check: () => ({ unlocked: petCount >= 5, progress: Math.min(petCount, 5), total: 5 }) },
    { id: 'pet-lv5', name: '初露锋芒', description: '智子伙伴达到 Lv.5', category: 'pet', icon: '⬆️',
      check: () => ({ unlocked: activePetLevel >= 5, progress: Math.min(activePetLevel, 5), total: 5 }) },
    { id: 'pet-lv10', name: '渐入佳境', description: '智子伙伴达到 Lv.10', category: 'pet', icon: '📈',
      check: () => ({ unlocked: activePetLevel >= 10, progress: Math.min(activePetLevel, 10), total: 10 }) },
    { id: 'pet-lv15', name: '炉火纯青', description: '智子伙伴达到 Lv.15', category: 'pet', icon: '💪',
      check: () => ({ unlocked: activePetLevel >= 15, progress: Math.min(activePetLevel, 15), total: 15 }) },
    { id: 'pet-lv20', name: '登峰造极', description: '智子伙伴达到 Lv.20', category: 'pet', icon: '👑',
      check: () => ({ unlocked: activePetLevel >= 20, progress: Math.min(activePetLevel, 20), total: 20 }) },
    { id: 'pet-8', name: '智子收藏家', description: '拥有 8 只灵犀智子', category: 'pet', icon: '🎖️',
      check: () => ({ unlocked: petCount >= 8, progress: Math.min(petCount, 8), total: 8 }) },
    { id: 'pet-feed-20', name: '饱食无忧', description: '累计喂食 20 次', category: 'pet', icon: '🍖',
      check: () => ({ unlocked: feedCount >= 20, progress: Math.min(feedCount, 20), total: 20 }) },
    { id: 'pet-coins-500', name: '小有积蓄', description: '金币达到 500', category: 'pet', icon: '🪙',
      check: () => ({ unlocked: totalCoins >= 500, progress: Math.min(totalCoins, 500), total: 500 }) },
    { id: 'pet-coins-2000', name: '财富自由', description: '金币达到 2000', category: 'pet', icon: '💰',
      check: () => ({ unlocked: totalCoins >= 2000, progress: Math.min(totalCoins, 2000), total: 2000 }) },
    { id: 'pet-affection', name: '心有灵犀', description: '任意智子好感度达到 100', category: 'pet', icon: '💕',
      check: () => ({ unlocked: activePetAffection >= 100, progress: Math.min(activePetAffection, 100), total: 100 }) },
    // === 💻 OJ 训练 ===
    { id: 'oj-cm-1', name: '初涉编程猫', description: '完成第 1 个编程猫题单', category: 'quiz', icon: '🐱',
      check: () => {
        try { return { unlocked: JSON.parse(localStorage.getItem('csp_cm_done') || '[]').length >= 1 }; }
        catch { return { unlocked: false }; }
      }},
    { id: 'oj-cm-all', name: '编程猫毕业', description: '完成全部 9 个编程猫题单', category: 'quiz', icon: '🎓',
      check: () => {
        try { return { unlocked: JSON.parse(localStorage.getItem('csp_cm_done') || '[]').length >= 9 }; }
        catch { return { unlocked: false }; }
      }},
    { id: 'oj-lg-10', name: '洛谷新秀', description: '洛谷通过 10 题', category: 'quiz', icon: '🔗',
      check: () => {
        try {
          const s = JSON.parse(localStorage.getItem('csp_oj_status') || '{}');
          return { unlocked: Object.values(s).filter(v => v === 'passed').length >= 10,
            progress: Math.min(Object.values(s).filter(v => v === 'passed').length, 10), total: 10 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'oj-lg-50', name: '洛谷达人', description: '洛谷通过 50 题', category: 'quiz', icon: '💻',
      check: () => {
        try {
          const s = JSON.parse(localStorage.getItem('csp_oj_status') || '{}');
          return { unlocked: Object.values(s).filter(v => v === 'passed').length >= 50,
            progress: Math.min(Object.values(s).filter(v => v === 'passed').length, 50), total: 50 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'checkin-7', name: '周周不落', description: '连续签到 7 周', category: 'pet', icon: '🔥',
      check: () => {
        try {
          const d = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
          return { unlocked: (d.streak || 0) >= 7, progress: Math.min(d.streak || 0, 7), total: 7 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'checkin-12', name: '坚持不懈', description: '连续签到 12 周', category: 'pet', icon: '🌟',
      check: () => {
        try {
          const d = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
          return { unlocked: (d.streak || 0) >= 12, progress: Math.min(d.streak || 0, 12), total: 12 };
        } catch { return { unlocked: false }; }
      }},

    // === 🌟 隐藏成就 ===
    { id: 'hidden-triple', name: '三位一体', description: '签到、超级完美、额外挑战各完成 1 次', category: 'hidden', icon: '🎯', hidden: true,
      check: () => {
        try {
          const ci = JSON.parse(localStorage.getItem('csp_checkin') || '{}');
          return { unlocked: (ci.streak || 0) >= 1 && superCompletions >= 1 && extraChallengeCount >= 1 };
        } catch { return { unlocked: false }; }
      }},
    { id: 'hidden-name', name: '代码之魂', description: '给智子起名包含「C++」「编程」或「代码」', category: 'hidden', icon: '💻', hidden: true,
      check: () => ({
        unlocked: ownedPets.some(p =>
          (p.petName || '').includes('C++') || (p.petName || '').includes('编程') || (p.petName || '').includes('代码')
        ),
      })},
    { id: 'hidden-3perfect', name: '三连完美', description: '一周内 3 次完美通关', category: 'hidden', icon: '🏅', hidden: true,
      check: () => ({ unlocked: weeklyPerfects >= 3 }) },
    { id: 'hidden-starve', name: '饿坏了', description: '让智子的饱食度降到 0', category: 'hidden', icon: '🤤', hidden: true,
      check: () => ({ unlocked: ownedPets.some(p => (p.hunger ?? 100) <= 0) }) },
    { id: 'hidden-ai-csp', name: '勤学好问', description: '向 AI 提问 CSP-J 相关问题', category: 'hidden', icon: '🤔', hidden: true,
      check: () => {
        try { return { unlocked: localStorage.getItem('csp_asked_cspj') === 'true' }; }
        catch { return { unlocked: false }; }
      }},
    { id: 'hidden-perfect-review', name: '复盘满分', description: '月度复盘全对', category: 'hidden', icon: '💯', hidden: true,
      check: () => ({ unlocked: lastReviewTotal > 0 && lastReviewCorrect === lastReviewTotal }) },
  ];
}
