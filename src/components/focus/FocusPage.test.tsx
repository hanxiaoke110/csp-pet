import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FocusSession } from '../../types/focus';
import FocusSetup from './FocusSetup';
import FocusTimer from './FocusTimer';

describe('focus page states', () => {
  it('renders a quick setup without reward or attendance language', () => {
    const html = renderToStaticMarkup(
      <FocusSetup
        defaultMinutes={25}
        miniWindowEnabled
        gentleReminderEnabled
        endSoundEnabled
        recentGoals={[]}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(html).toContain('这次想完成什么');
    expect(html).toContain('15');
    expect(html).toContain('25');
    expect(html).toContain('45');
    expect(html).not.toMatch(/金币|经验|奖励|打卡|排行/);
  });

  it('renders the active goal and neutral controls', () => {
    const session: FocusSession = {
      id: 's1', goal: '完成英语阅读', plannedSeconds: 1500,
      startedAt: '2026-10-10T10:00:00Z', pausedSeconds: 0,
      pauseStartedAt: null, status: 'running', reminderShown: false,
    };
    const html = renderToStaticMarkup(
      <FocusTimer
        session={session}
        remainingSeconds={1122}
        progress={0.252}
        onPause={() => {}}
        onResume={() => {}}
        onFinish={() => {}}
      />,
    );
    expect(html).toContain('完成英语阅读');
    expect(html).toContain('18:42');
    expect(html).toContain('暂停');
    expect(html).toContain('提前结束');
    expect(html).not.toContain('失败');
  });
});
