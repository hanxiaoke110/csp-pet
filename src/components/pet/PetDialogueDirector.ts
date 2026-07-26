export interface PetDialogueContext {
  hunger: number;
  mood: number;
  hour: number;
  clickCount?: number;
}

export interface PetDialogue {
  id: string;
  text: string;
  priority: 'normal' | 'urgent';
}

const AMBIENT_COOLDOWN_MS = 5 * 60_000;
const MAX_AMBIENT_PER_DAY = 6;

/**
 * Keeps desktop chatter sparse, kind, and truthful. Learning-result messages
 * are emitted by their source screens; this director owns only ambient/click
 * companionship messages that do not claim unobserved student activity.
 */
export class PetDialogueDirector {
  private recentIds: string[] = [];
  private lastAmbientAt = 0;
  private dailyKey = '';
  private dailyCount = 0;

  nextAmbient(context: PetDialogueContext, now = Date.now()): PetDialogue | null {
    this.resetDayIfNeeded(now);
    if (context.hour >= 22 || context.hour < 8) return null;
    if (now - this.lastAmbientAt < AMBIENT_COOLDOWN_MS || this.dailyCount >= MAX_AMBIENT_PER_DAY) return null;

    const candidates: PetDialogue[] = context.hunger <= 20
      ? [{ id: 'hungry-gentle', text: '肚子咕噜咕噜，路过背包时给我带点零食吧。', priority: 'normal' }]
      : context.mood <= 20
        ? [{ id: 'mood-gentle', text: '今天先慢一点也没关系，智子在旁边待机。', priority: 'normal' }]
        : [
            { id: 'ambient-company', text: '一题一题来，今天的经验条也会悄悄涨。', priority: 'normal' },
            { id: 'ambient-focus', text: '卡住就先拿样例开刀，答案常藏在里面。', priority: 'normal' },
            { id: 'ambient-break', text: '眼睛要开省电模式啦，看看远处再回来。', priority: 'normal' },
          ];

    const available = candidates.filter(item => !this.recentIds.includes(item.id));
    const chosen = (available.length ? available : candidates)[Math.floor(Math.random() * (available.length || candidates.length))];
    this.remember(chosen.id);
    this.lastAmbientAt = now;
    this.dailyCount += 1;
    return chosen;
  }

  nextClick(context: PetDialogueContext): PetDialogue {
    if (context.hunger <= 20) return { id: 'click-hungry', text: '摸摸收到！再来一口零食，能量就齐活啦。', priority: 'normal' };
    if (context.mood <= 20) return { id: 'click-mood', text: '收到摸摸，智子重新开机啦。', priority: 'normal' };
    if (context.clickCount && context.clickCount % 5 === 0) return { id: 'click-playful', text: '第 5 次摸摸打卡！你是戳戳小能手。', priority: 'normal' };
    const candidates = [
      { id: 'click-company', text: '这题我们组队打，先从样例开局！', priority: 'normal' as const },
      { id: 'click-help', text: '卡关别硬扛，召唤 AI 教练来组队。', priority: 'normal' as const },
      { id: 'click-praise', text: '认真敲代码的你，今天自带主角光环。', priority: 'normal' as const },
    ];
    const available = candidates.filter(item => !this.recentIds.includes(item.id));
    const chosen = (available.length ? available : candidates)[Math.floor(Math.random() * (available.length || candidates.length))];
    this.remember(chosen.id);
    return chosen;
  }

  private remember(id: string) {
    this.recentIds = [...this.recentIds.filter(item => item !== id), id].slice(-12);
  }

  private resetDayIfNeeded(now: number) {
    const key = new Date(now).toISOString().slice(0, 10);
    if (key !== this.dailyKey) {
      this.dailyKey = key;
      this.dailyCount = 0;
    }
  }
}
