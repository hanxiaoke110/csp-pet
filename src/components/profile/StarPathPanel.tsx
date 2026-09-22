import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, CloudOff, Coins, Gift, Sparkles } from 'lucide-react';
import { loadStarPathCatalog, STAR_PATH_CATALOG_EVENT } from '../../data/starPath';
import { useQuizStore } from '../../stores/quizStore';
import { usePetStore } from '../../stores/petStore';
import {
  collectStarPathMetrics,
  STAR_PATH_WELCOME_REWARD,
  useStarPathStore,
} from '../../stores/starPathStore';
import type { StarPathCatalog, StarPathTask } from '../../types/starPath';

const CATEGORY_LABEL: Record<StarPathTask['category'], string> = {
  learning: '知识积累',
  challenge: '勇气挑战',
  exploration: '迷雾探索',
  trial: '智子试炼',
};

export default function StarPathPanel({ onToast }: { onToast: (text: string) => void }) {
  const petLoaded = usePetStore(state => state.loaded);
  const totalCorrect = useQuizStore(state => state.totalCorrect);
  const totalPractice = useQuizStore(state => state.totalPractice);
  const weeklyCompletions = useQuizStore(state => state.weeklyCompletions);
  const superCompletions = useQuizStore(state => state.superCompletions);
  const claimedTaskIds = useStarPathStore(state => state.claimedTaskIds);
  const welcomeClaimed = useStarPathStore(state => state.welcomeClaimed);
  const claimTask = useStarPathStore(state => state.claimTask);
  const claimWelcomeReward = useStarPathStore(state => state.claimWelcomeReward);
  const [catalog, setCatalog] = useState<StarPathCatalog | null>(null);
  const [externalRevision, setExternalRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void loadStarPathCatalog().then(next => { if (active) setCatalog(next); });
    const refresh = () => setExternalRevision(value => value + 1);
    const acceptCatalog = (event: Event) => {
      const next = (event as CustomEvent<StarPathCatalog>).detail;
      if (active && next) setCatalog(next);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(STAR_PATH_CATALOG_EVENT, acceptCatalog);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(STAR_PATH_CATALOG_EVENT, acceptCatalog);
    };
  }, []);

  const metrics = useMemo(() => collectStarPathMetrics({
    totalCorrect,
    totalPractice,
    weeklyCompletions,
    superCompletions,
  }), [externalRevision, superCompletions, totalCorrect, totalPractice, weeklyCompletions]);

  const tasks = useMemo(() => [...(catalog?.tasks || [])].sort((a, b) => {
    const aClaimed = claimedTaskIds.includes(a.id);
    const bClaimed = claimedTaskIds.includes(b.id);
    if (aClaimed !== bClaimed) return aClaimed ? 1 : -1;
    const aReady = metrics[a.metric] >= a.target;
    const bReady = metrics[b.metric] >= b.target;
    if (aReady !== bReady) return aReady ? -1 : 1;
    return (metrics[b.metric] / b.target) - (metrics[a.metric] / a.target);
  }), [catalog, claimedTaskIds, metrics]);

  const claimedCount = tasks.filter(task => claimedTaskIds.includes(task.id)).length;
  const readyCount = tasks.filter(task => !claimedTaskIds.includes(task.id) && metrics[task.metric] >= task.target).length;

  const receive = (task: StarPathTask) => {
    const result = claimTask(task, metrics[task.metric]);
    onToast(result.message);
  };

  const receiveWelcome = () => {
    const result = claimWelcomeReward();
    onToast(result.message);
  };

  return (
    <div className="star-path-panel">
      <section className="star-path-intro">
        <div className="star-path-compass" aria-hidden="true"><span>✦</span><i /><i /></div>
        <div>
          <span className="section-kicker">A JOURNEY WITHOUT DEADLINES</span>
          <h2>慢慢走，每一步都算数</h2>
          <p>没有每日打卡，也不会过期。做题、迷宫和试炼的旧进度都会自动算进来，有空时再继续。</p>
        </div>
        <div className="star-path-summary">
          <strong>{claimedCount}<small>/{tasks.length || '—'}</small></strong>
          <span>已收下星途奖励</span>
          {readyCount > 0 && <em>{readyCount} 份奖励可领</em>}
        </div>
      </section>

      {!welcomeClaimed && <section className="renewal-gift">
        <div className="gift-seal"><Gift /></div>
        <div>
          <span>学习区焕新礼</span>
          <h3>新旅程不让你少一份收获</h3>
          <p><Coins /> {STAR_PATH_WELCOME_REWARD.coins} 金币 <b>+{STAR_PATH_WELCOME_REWARD.exp} EXP</b> <b>+普通食物×{STAR_PATH_WELCOME_REWARD.basicFoods}</b></p>
        </div>
        <button disabled={!petLoaded} onClick={receiveWelcome}>{petLoaded ? '收下焕新礼' : '正在恢复资料…'}</button>
      </section>}

      <div className="star-path-rules">
        <span><Clock3 /> 永久累计，没有截止日期</span>
        <span><CloudOff /> 本地结算并进入备份，断网也可用</span>
        <span><Sparkles /> 新任务可通过静态目录上新</span>
      </div>

      {!catalog ? <div className="star-path-loading">正在整理你的星途…</div> : <div className="star-path-grid">
        {tasks.map(task => {
          const value = metrics[task.metric];
          const claimed = claimedTaskIds.includes(task.id);
          const ready = value >= task.target;
          const percent = Math.min(100, Math.round((value / task.target) * 100));
          return <article key={task.id} className={`star-path-card ${ready ? 'ready' : ''} ${claimed ? 'claimed' : ''}`}>
            <div className="star-path-card-top">
              <span className="star-path-icon">{task.icon}</span>
              <div><small>{CATEGORY_LABEL[task.category]}</small><h3>{task.title}</h3></div>
              {claimed && <CheckCircle2 className="star-path-claimed-mark" />}
            </div>
            <p>{task.description}</p>
            <div className="star-path-progress-copy"><span>{Math.min(value, task.target)} / {task.target}</span><b>{percent}%</b></div>
            <div className="star-path-progress"><i style={{ width: `${percent}%` }} /></div>
            <footer>
              <span><Coins /> {task.reward.coins}<b>+{task.reward.exp} EXP</b></span>
              <button disabled={!petLoaded || !ready || claimed} onClick={() => receive(task)}>
                {claimed ? '已领取' : !petLoaded ? '正在恢复资料…' : ready ? '领取奖励' : '继续累计'}
              </button>
            </footer>
          </article>;
        })}
      </div>}
    </div>
  );
}
