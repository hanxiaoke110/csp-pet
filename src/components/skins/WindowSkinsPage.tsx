import { useEffect, useMemo, useState } from 'react';
import { useQuizStore } from '../../stores/quizStore';
import {
  collectUnlockedWindowSkins,
  getWindowSkin,
  getWindowSkinProgress,
  loadUnlockedWindowSkins,
  saveUnlockedWindowSkins,
  setWindowSkin,
  WINDOW_SKINS,
  type WindowSkin,
  type WindowSkinCategory,
  type WindowSkinMetrics,
} from '../../utils/windowSkin';

type DungeonProgressRecord = {
  dungeonId?: string;
  status?: string;
  bossDefeated?: boolean;
};

const CATEGORY_LABELS: Record<'all' | WindowSkinCategory, string> = {
  all: '全部',
  basic: '基础',
  learning: '学习成长',
  trial: '试炼秘境',
};

function readCompletedCourses() {
  try {
    const saved = JSON.parse(localStorage.getItem('csp_problem_status') || '{}');
    return Object.values(saved).filter(status => status === 'completed').length;
  } catch {
    return 0;
  }
}

function readFreeStreak() {
  try {
    return Math.max(0, Number(localStorage.getItem('csp_free_streak')) || 0);
  } catch {
    return 0;
  }
}

function readDefeatedDungeons() {
  const defeated = new Set<string>();
  try {
    const progress = JSON.parse(localStorage.getItem('dungeon_progress') || '[]') as DungeonProgressRecord[];
    progress.forEach(item => {
      if (item.dungeonId && (item.bossDefeated || item.status === 'cleared')) defeated.add(item.dungeonId);
    });
  } catch {}
  return defeated;
}

export default function WindowSkinsPage() {
  const weeklyCompletions = useQuizStore(state => state.weeklyCompletions);
  const totalCorrect = useQuizStore(state => state.totalCorrect);
  const lastReviewDate = useQuizStore(state => state.lastReviewDate);
  const [activeSkin, setActiveSkinState] = useState<WindowSkin>(getWindowSkin);
  const [previewSkin, setPreviewSkin] = useState<WindowSkin>(getWindowSkin);
  const [category, setCategory] = useState<'all' | WindowSkinCategory>('all');
  const [storedUnlocked, setStoredUnlocked] = useState<WindowSkin[]>(loadUnlockedWindowSkins);

  const metrics = useMemo<WindowSkinMetrics>(() => ({
    weeklyCompletions,
    totalCorrect,
    completedCourses: readCompletedCourses(),
    freeStreak: readFreeStreak(),
    monthlyReviews: lastReviewDate ? 1 : 0,
    defeatedDungeons: readDefeatedDungeons(),
  }), [lastReviewDate, totalCorrect, weeklyCompletions]);

  const unlocked = useMemo(
    () => collectUnlockedWindowSkins(storedUnlocked, metrics),
    [metrics, storedUnlocked],
  );
  const unlockedSet = useMemo(() => new Set(unlocked), [unlocked]);

  useEffect(() => {
    const previous = new Set(storedUnlocked);
    if (unlocked.length === storedUnlocked.length && unlocked.every(id => previous.has(id))) return;
    saveUnlockedWindowSkins(unlocked);
    setStoredUnlocked(unlocked);
  }, [storedUnlocked, unlocked]);

  const selectedDefinition = WINDOW_SKINS.find(skin => skin.id === previewSkin) || WINDOW_SKINS[0];
  const selectedProgress = getWindowSkinProgress(selectedDefinition, metrics);
  const selectedUnlocked = unlockedSet.has(selectedDefinition.id);
  const visibleSkins = category === 'all'
    ? WINDOW_SKINS
    : WINDOW_SKINS.filter(skin => skin.category === category);

  const applySkin = (skin: WindowSkin) => {
    if (!unlockedSet.has(skin)) return;
    setWindowSkin(skin);
    setActiveSkinState(skin);
    setPreviewSkin(skin);
  };

  return (
    <div className="skin-gallery-page">
      <header className="skin-gallery-header">
        <div>
          <h2>窗口皮肤</h2>
          <p>通过学习与试炼解锁场景，解锁后永久保留。</p>
        </div>
        <div className="skin-collection-count">
          <strong>{unlocked.length}</strong>
          <span>/ {WINDOW_SKINS.length} 已拥有</span>
        </div>
      </header>

      <section
        className={`skin-featured ${selectedDefinition.image ? '' : 'skin-featured-default'}`}
        style={selectedDefinition.image ? { backgroundImage: `url(${selectedDefinition.image})` } : undefined}
        aria-label={`${selectedDefinition.name}预览`}
      >
        <div className="skin-featured-shade" />
        <div className="skin-featured-content">
          <span className={`skin-featured-status ${selectedUnlocked ? 'owned' : 'locked'}`}>
            {selectedUnlocked ? '已拥有' : '未解锁'}
          </span>
          <h3>{selectedDefinition.name}</h3>
          <p>{selectedDefinition.description}</p>
          <div className="skin-featured-condition">
            {selectedUnlocked ? '可以随时使用' : selectedProgress.label}
          </div>
          <button
            type="button"
            className="skin-apply-button"
            disabled={!selectedUnlocked || activeSkin === selectedDefinition.id}
            onClick={() => applySkin(selectedDefinition.id)}
          >
            {activeSkin === selectedDefinition.id ? '使用中' : selectedUnlocked ? '使用此皮肤' : '达到条件后解锁'}
          </button>
        </div>
      </section>

      <div className="skin-category-tabs" role="tablist" aria-label="皮肤分类">
        {(Object.keys(CATEGORY_LABELS) as Array<'all' | WindowSkinCategory>).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={category === id}
            className={category === id ? 'active' : ''}
            onClick={() => setCategory(id)}
          >
            {CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="skin-gallery-grid">
        {visibleSkins.map(skin => {
          const progress = getWindowSkinProgress(skin, metrics);
          const isUnlocked = unlockedSet.has(skin.id);
          const isActive = activeSkin === skin.id;
          const percentage = Math.min(100, Math.round((progress.current / progress.target) * 100));
          return (
            <article
              key={skin.id}
              className={`skin-gallery-card ${isActive ? 'active' : ''} ${isUnlocked ? 'unlocked' : 'locked'}`}
            >
              <button
                type="button"
                className={`skin-card-preview ${skin.image ? '' : 'skin-card-preview-default'}`}
                style={skin.image ? { backgroundImage: `url(${skin.image})` } : undefined}
                onClick={() => setPreviewSkin(skin.id)}
                aria-label={`预览${skin.name}`}
              >
                <span className="skin-card-state">{isActive ? '使用中' : isUnlocked ? '已解锁' : '未解锁'}</span>
              </button>
              <div className="skin-card-body">
                <div className="skin-card-title-row">
                  <div>
                    <h3>{skin.name}</h3>
                    <p>{skin.description}</p>
                  </div>
                  {isUnlocked && !isActive && (
                    <button type="button" className="skin-card-use" onClick={() => applySkin(skin.id)}>使用</button>
                  )}
                </div>
                <div className={`skin-unlock-condition ${isUnlocked ? 'complete' : ''}`}>
                  <span>{isUnlocked ? '已永久解锁' : progress.label}</span>
                  {!isUnlocked && <strong>{Math.min(progress.current, progress.target)}/{progress.target}</strong>}
                </div>
                {!isUnlocked && (
                  <div className="skin-progress-track" aria-label={`解锁进度${percentage}%`}>
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
