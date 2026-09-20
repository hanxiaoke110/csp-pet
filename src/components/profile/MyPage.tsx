import { useEffect, useMemo, useRef, useState } from 'react';
import { BookHeart, Check, Coins, Eye, LockKeyhole, Pencil, ShieldCheck, Shirt, Sparkles, Star, Trophy, X } from 'lucide-react';
import AchievementsPanel from '../achievements/AchievementsPanel';
import { PROFILE_AVATARS, WARDROBE_BY_ID, WARDROBE_ITEMS } from '../../data/wardrobe';
import { loadWardrobeCatalog } from '../../data/wardrobeCatalog';
import { NICKNAME_CHANGE_COST, useProfileStore } from '../../stores/profileStore';
import { usePetStore } from '../../stores/petStore';
import { useCollectorCardStore } from '../../stores/collectorCardStore';
import type { WardrobeCatalog, WardrobeCategory, WardrobeItem } from '../../types/profile';
import { ensureWardrobeAsset, ensureWardrobeInteractionAsset } from '../../utils/wardrobeAssetDownloader';
import { learnedToday, localDateKey } from '../../utils/localDate';
import { isWardrobeConditionMet } from '../../utils/wardrobeUnlock';
import './myPage.css';

type PageTab = 'today' | 'journal' | 'honor' | 'wardrobe';

const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  avatar: '头像', frame: '头像框', background: '背景', pendant: '挂件', effect: '特效', title: '称号',
};

function readSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch { return new Set(); }
}

function AvatarStage({ compact = false, previewItem }: { compact?: boolean; previewItem?: WardrobeItem | null }) {
  const equipped = useProfileStore(s => s.equipped);
  const selected = (category: WardrobeCategory) => previewItem?.category === category
    ? previewItem
    : equipped[category] ? WARDROBE_BY_ID.get(equipped[category]!) : undefined;
  const avatar = selected('avatar');
  const title = selected('title');
  const frame = selected('frame');
  const background = selected('background');
  const pendant = selected('pendant');
  const effect = selected('effect');
  const nickname = useProfileStore(s => s.nickname);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState({ column: 2, row: 2 });
  const [reacting, setReacting] = useState(false);
  const animationFrame = useRef<number | null>(null);
  const reactionTimer = useRef<number | null>(null);
  useEffect(() => {
    const items = [avatar, frame, background, pendant].filter((item): item is WardrobeItem => Boolean(item?.asset));
    let active = true;
    const jobs = items.map(async item => [item.id, (await ensureWardrobeAsset(item)).url] as const);
    if (avatar?.interaction) {
      jobs.push(ensureWardrobeInteractionAsset(avatar).then(asset => [`${avatar.id}:interaction`, asset.url] as const));
    }
    void Promise.all(jobs)
      .then(entries => { if (active) setResolved(Object.fromEntries(entries)); })
      .catch(() => {});
    return () => {
      active = false;
      if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
      if (reactionTimer.current != null) window.clearTimeout(reactionTimer.current);
    };
  }, [avatar?.id, avatar?.version, avatar?.interaction?.atlas, compact, frame?.id, frame?.version, background?.id, background?.version, pendant?.id, pendant?.version]);
  const backgroundUrl = background ? resolved[background.id] || background.asset : undefined;
  const avatarUrl = avatar ? resolved[avatar.id] || avatar.asset : undefined;
  const interactionUrl = avatar ? resolved[`${avatar.id}:interaction`] : undefined;
  const frameUrl = frame ? resolved[frame.id] || frame.asset : undefined;
  const pendantUrl = pendant ? resolved[pendant.id] || pendant.asset : undefined;
  const updateDirection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactionUrl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { clientX, clientY, currentTarget } = event;
    if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(() => {
      const rect = currentTarget.getBoundingClientRect();
      const column = Math.max(0, Math.min(4, Math.floor(((clientX - rect.left) / rect.width) * 5)));
      const row = Math.max(0, Math.min(4, Math.floor(((clientY - rect.top) / rect.height) * 5)));
      setDirection({ column, row });
    });
  };
  const react = () => {
    if (!interactionUrl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (reactionTimer.current != null) window.clearTimeout(reactionTimer.current);
    setReacting(false);
    requestAnimationFrame(() => setReacting(true));
    reactionTimer.current = window.setTimeout(() => setReacting(false), 520);
  };
  return (
    <div className={`profile-stage bg-${background?.preview || 'midnight'} ${compact ? 'compact' : ''} ${previewItem ? 'is-previewing' : ''}`} style={backgroundUrl ? { backgroundImage: `linear-gradient(rgba(3,15,33,.08),rgba(3,15,33,.22)),url(${backgroundUrl})` } : undefined}>
      {previewItem && !compact && <div className="stage-preview-badge"><Eye /> 预览中 · 不会保存</div>}
      <div className={`stage-effect ${effect?.preview || 'none'}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <div
        className={`avatar-frame frame-${frame?.preview || 'plain'} ${interactionUrl ? 'is-interactive' : ''} ${reacting ? 'is-reacting' : ''}`}
        onPointerMove={updateDirection}
        onPointerLeave={() => setDirection({ column: 2, row: 2 })}
        onPointerDown={react}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); react(); } }}
        role={interactionUrl ? 'button' : undefined}
        tabIndex={interactionUrl ? 0 : undefined}
        aria-label={interactionUrl ? `${avatar?.name || '头像'}，移动鼠标会看向你，点击会回应` : undefined}
      >
        {interactionUrl
          ? <div
              className="avatar-interactive-art"
              role="img"
              aria-label={avatar?.name || '灵动头像'}
              style={{
                backgroundImage: `url(${interactionUrl})`,
                backgroundPosition: `${direction.column * 25}% ${direction.row * 25}%`,
              }}
            />
          : avatarUrl ? <img src={avatarUrl} alt={avatar?.name || '头像'} /> : <div className="avatar-placeholder"><Star /></div>}
        {frameUrl && <img className="avatar-frame-art" src={frameUrl} alt="" />}
        {pendantUrl && <img className="avatar-pendant-art" src={pendantUrl} alt="" />}
      </div>
      <div className="profile-stage-copy">
        <strong>{nickname}</strong>
        <span className={`equipped-title rarity-${title?.rarity || 'common'}`}>{title?.name || '星途见习生'}</span>
      </div>
    </div>
  );
}

function FirstProfileSetup() {
  const initialize = useProfileStore(s => s.initialize);
  const [zodiacId, setZodiacId] = useState(PROFILE_AVATARS.find(a => a.group === 'zodiac')!.id);
  const [constellationId, setConstellationId] = useState(PROFILE_AVATARS.find(a => a.group === 'constellation')!.id);
  const groups = [
    { key: 'zodiac', title: '选一位生肖守护灵', items: PROFILE_AVATARS.filter(a => a.group === 'zodiac'), value: zodiacId, setValue: setZodiacId },
    { key: 'constellation', title: '选一位星座守护灵', items: PROFILE_AVATARS.filter(a => a.group === 'constellation'), value: constellationId, setValue: setConstellationId },
  ];
  return (
    <div className="profile-setup-overlay">
      <div className="profile-setup-card">
        <div className="setup-kicker">初次建档礼物</div>
        <h2>点亮你的两颗本命星</h2>
        <p>生肖与星座头像各免费解锁一个，之后可在星相衣橱里自由切换。</p>
        {groups.map(group => (
          <section key={group.key} className="setup-group">
            <h3>{group.title}</h3>
            <div className="setup-avatar-row">
              {group.items.map(item => (
                <button key={item.id} className={group.value === item.id ? 'selected' : ''} onClick={() => group.setValue(item.id)}>
                  <img src={item.asset} alt={item.name} /><span>{item.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <button className="setup-confirm" onClick={() => initialize(zodiacId, constellationId)}>收下两位守护灵</button>
      </div>
    </div>
  );
}

function WardrobeCard({ item, owned, equipped, previewing, cardCount, onToast, onPreview }: {
  item: WardrobeItem; owned: boolean; equipped: boolean; previewing: boolean; cardCount: number;
  onToast: (text: string) => void; onPreview: (item: WardrobeItem) => void;
}) {
  const purchase = useProfileStore(s => s.purchase);
  const equip = useProfileStore(s => s.equip);
  const [downloading, setDownloading] = useState(false);
  const canClaim = isWardrobeConditionMet(item, cardCount);
  const previewUrl = item.thumbnail || item.asset;
  const preview = previewUrl
    ? <img src={previewUrl} alt="" />
    : <div className={`wardrobe-symbol preview-${item.preview || item.rarity}`}>{item.preview && !['none', 'plain', 'gold', 'crystal', 'scholar', 'aurora', 'midnight', 'sunrise', 'tide', 'gallery', 'stardust', 'perfect'].includes(item.preview) ? item.preview : <Sparkles />}</div>;

  const act = async () => {
    if (owned) {
      try {
        setDownloading(true);
        await ensureWardrobeAsset(item, onToast);
      } catch (reason) {
        onToast(reason instanceof Error ? reason.message : '装扮下载失败，请稍后重试');
        setDownloading(false);
        return;
      }
      equip(item.id);
      setDownloading(false);
      onToast(`已换上「${item.name}」`);
      return;
    }
    if (item.acquisition.type !== 'coin') return;
    try {
      setDownloading(true);
      // 完整素材先落盘并通过校验，再扣金币。网络失败不会造成金币损失。
      await ensureWardrobeAsset(item, onToast);
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : '装扮下载失败，未扣除金币');
      setDownloading(false);
      return;
    }
    const result = purchase(item.id);
    setDownloading(false);
    if (result.ok) onToast(`「${item.name}」已永久解锁`);
    else if (result.reason === 'coins') onToast('金币还不够，再完成一些学习任务吧');
  };

  return (
    <article className={`wardrobe-card rarity-${item.rarity} ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''} ${previewing ? 'previewing' : ''}`}>
      <div className="wardrobe-preview">
        {preview}
        {!owned && <span className="wardrobe-lock"><LockKeyhole /></span>}
        <button className="wardrobe-try-button" type="button" onClick={() => onPreview(item)} aria-label={`预览${item.name}`}><Eye /> {previewing ? '预览中' : '试穿'}</button>
      </div>
      <div className="wardrobe-card-copy">
        <span className="wardrobe-rarity">{item.rarity}</span>
        <h4>{item.name}</h4>
        {owned ? (
          <button onClick={() => void act()} disabled={equipped || downloading}>{downloading ? '恢复中…' : equipped ? <><Check /> 使用中</> : '使用'}</button>
        ) : item.acquisition.type === 'coin' ? (
          <button onClick={() => void act()} disabled={downloading} className="price-button">{downloading ? '下载中…' : <><Coins /> {item.acquisition.price}</>}</button>
        ) : (
          <div className={`unlock-condition ${canClaim ? 'ready' : ''}`}>
            <ShieldCheck /> <span><b>{canClaim ? '条件已达成' : '获取条件'}</b>{item.acquisition.type === 'condition' ? item.acquisition.description : '初始赠送'}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function WardrobePanel({ onToast }: { onToast: (text: string) => void }) {
  const [category, setCategory] = useState<WardrobeCategory>('avatar');
  const [previewItem, setPreviewItem] = useState<WardrobeItem | null>(null);
  const ownedItemIds = useProfileStore(s => s.ownedItemIds);
  const equipped = useProfileStore(s => s.equipped);
  const grant = useProfileStore(s => s.grant);
  const cardCount = useCollectorCardStore(s => s.ownedCards.length);
  const coins = usePetStore(s => s.coins);
  const [catalog, setCatalog] = useState<WardrobeCatalog>({ version: 1, updatedAt: '', items: WARDROBE_ITEMS });

  useEffect(() => {
    let active = true;
    void loadWardrobeCatalog().then(next => { if (active) setCatalog(next); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    for (const item of catalog.items) {
      if (item.acquisition.type === 'free') grant(item.id);
      if (item.acquisition.type === 'condition' && isWardrobeConditionMet(item, cardCount)) grant(item.id);
    }
  }, [cardCount, catalog, grant]);

  const items = catalog.items.filter(item => item.category === category);
  return (
    <div className="wardrobe-layout">
      <aside className="wardrobe-stage-panel">
        <div className={`wardrobe-label ${previewItem ? 'previewing' : ''}`}><Sparkles /> {previewItem ? `正在预览：${previewItem.name}` : '当前装扮'}</div>
        <AvatarStage previewItem={previewItem} />
        {previewItem && <button className="end-preview-button" type="button" onClick={() => setPreviewItem(null)}><X /> 结束预览，恢复当前装扮</button>}
        <div className="wardrobe-balance"><Coins /> <b>{coins}</b><span>可用金币</span></div>
      </aside>
      <section className="wardrobe-catalog">
        <div className="wardrobe-tabs">
          {(Object.keys(CATEGORY_LABELS) as WardrobeCategory[]).map(key => (
            <button key={key} className={category === key ? 'active' : ''} onClick={() => { setCategory(key); setPreviewItem(null); }}>{CATEGORY_LABELS[key]}</button>
          ))}
        </div>
        <div className="wardrobe-note">创始系列已随应用安装；以后上新的装扮会自动出现在这里，首次使用时下载。</div>
        <div className="wardrobe-grid">
          {items.map(item => <WardrobeCard key={item.id} item={item} owned={ownedItemIds.includes(item.id)} equipped={equipped[item.category] === item.id} previewing={previewItem?.id === item.id} cardCount={cardCount} onToast={onToast} onPreview={setPreviewItem} />)}
        </div>
      </section>
    </div>
  );
}

export default function MyPage() {
  const loaded = useProfileStore(s => s.loaded);
  const initialized = useProfileStore(s => s.initialized);
  const load = useProfileStore(s => s.load);
  const nickname = useProfileStore(s => s.nickname);
  const nicknameChanges = useProfileStore(s => s.nicknameChanges);
  const changeNickname = useProfileStore(s => s.changeNickname);
  const journal = useProfileStore(s => s.journal);
  const setJournal = useProfileStore(s => s.setJournal);
  const ownedPets = usePetStore(s => s.ownedPets);
  const [tab, setTab] = useState<PageTab>('today');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(nickname);
  const [toast, setToast] = useState('');
  const [, setCatalogReady] = useState(0);
  const today = localDateKey();
  const claimedCount = readSet('csp_achievement_claimed').size;
  const unlockedCount = new Set([...readSet('csp_achievement_unlocked'), ...readSet('csp_achievement_claimed')]).size;
  const todayTasks = useMemo(() => [
    { text: '完成一次学习或练习', done: learnedToday() },
    { text: '照顾一位灵犀智子', done: ownedPets.some(p => p.lastFedAt && localDateKey(new Date(p.lastFedAt)) === today) },
    { text: '写下今天的一句话', done: Boolean(journal[today]?.trim()) },
  ], [journal, ownedPets, today]);

  useEffect(() => { load(); }, [load]);
  // Restore remote wardrobe definitions before rendering equipped items from a backup.
  useEffect(() => { void loadWardrobeCatalog().then(() => setCatalogReady(value => value + 1)); }, []);
  useEffect(() => { setNameDraft(nickname); }, [nickname]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2600); };
  const saveName = () => {
    const result = changeNickname(nameDraft);
    if (result.ok) { setEditingName(false); notify(result.cost ? `昵称修改成功，消耗 ${result.cost} 金币` : '首次昵称修改免费'); }
    else notify(result.reason === 'coins' ? '金币不足' : result.reason === 'long' ? '昵称最多 12 个字' : '请换一个新昵称');
  };

  if (!loaded) return <div className="my-page-loading">正在打开你的成长档案…</div>;
  return (
    <div className="my-page">
      {!initialized && <FirstProfileSetup />}
      <header className="my-hero">
        <div className="my-orbit" aria-hidden="true" />
        <AvatarStage compact />
        <div className="my-identity">
          <div className="my-kicker">MY STAR LOG · 我的星途</div>
          {editingName ? (
            <div className="nickname-editor"><input value={nameDraft} maxLength={12} onChange={e => setNameDraft(e.target.value)} autoFocus /><button onClick={saveName}>保存</button><button onClick={() => setEditingName(false)}>取消</button></div>
          ) : (
            <h1>{nickname}<button onClick={() => setEditingName(true)} title="修改昵称"><Pencil /></button></h1>
          )}
          <p>{nicknameChanges === 0 ? '你还有 1 次免费修改昵称的机会' : `再次修改昵称需要 ${NICKNAME_CHANGE_COST} 金币`}</p>
        </div>
        <div className="my-stats">
          <div><b>{ownedPets.length}</b><span>智子伙伴</span></div>
          <div><b>{unlockedCount}</b><span>已解锁成就</span></div>
          <div><b>{claimedCount}</b><span>已领取奖励</span></div>
        </div>
      </header>

      <nav className="my-tabs">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}><Star />今日</button>
        <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}><BookHeart />成长手账</button>
        <button className={tab === 'honor' ? 'active' : ''} onClick={() => setTab('honor')}><Trophy />荣誉</button>
        <button className={tab === 'wardrobe' ? 'active' : ''} onClick={() => setTab('wardrobe')}><Shirt />星相衣橱</button>
      </nav>

      {tab === 'today' && <div className="today-grid">
        <section className="today-card constellation-card"><span className="section-kicker">TODAY'S ORBIT</span><h2>今日星轨</h2>{todayTasks.map((task, index) => <div className={`today-task ${task.done ? 'done' : ''}`} key={task.text}><span>{task.done ? <Check /> : index + 1}</span>{task.text}</div>)}</section>
        <section className="today-card summary-card"><span className="section-kicker">GROWTH SNAPSHOT</span><h2>成长小结</h2><p>你已经结识 <b>{ownedPets.length}</b> 位智子伙伴，点亮 <b>{unlockedCount}</b> 项成就。</p><button onClick={() => setTab('journal')}>写下今天的发现</button></section>
        <section className="today-card wardrobe-entry"><Sparkles /><div><span className="section-kicker">ASTRAL CLOSET</span><h2>星相衣橱</h2><p>把喜欢的头像、星环与称号搭成独一无二的自己。</p></div><button onClick={() => setTab('wardrobe')}>去搭配</button></section>
      </div>}

      {tab === 'journal' && <section className="journal-sheet"><div><span className="section-kicker">PRIVATE STAR LOG</span><h2>{today} · 今日手账</h2><p><ShieldCheck /> 日记内容只保存在这台电脑，不会上传到服务器、教师端或排行榜；创建备份时会随个人进度一起保存。</p></div><textarea value={journal[today] || ''} maxLength={1200} placeholder="今天学会了什么？遇到了什么有趣的事？" onChange={e => setJournal(today, e.target.value)} /><span className="journal-count">{(journal[today] || '').length}/1200 · 自动保存</span></section>}
      {tab === 'honor' && <div className="honor-wrap"><AchievementsPanel /></div>}
      {tab === 'wardrobe' && <WardrobePanel onToast={notify} />}
      {toast && <div className="profile-toast">{toast}</div>}
    </div>
  );
}
