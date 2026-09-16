import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Album, Coins, Download, RotateCcw, ShoppingBag, Sparkles, X } from 'lucide-react';
import { ClassAccessRequired, useClassAccess } from '../access/ClassAccessGate';
import { loadCollectorCardCatalog } from '../../data/collectorCards';
import { useCollectorCardStore } from '../../stores/collectorCardStore';
import { usePetStore } from '../../stores/petStore';
import type { CollectorCardCatalog, CollectorCardDefinition, ResolvedCollectorCardAssets } from '../../types/collectorCard';
import { areCollectorCardAssetsCached, ensureCollectorCardAssets } from '../../utils/collectorCardDownloader';
import HoloCardViewer from './HoloCardViewer';
import './collectorCards.css';

const ELEMENT_LABELS = { fire: '火', water: '水', wind: '风', earth: '地', light: '光' } as const;

export default function CollectorCardsPage() {
  const navigate = useNavigate();
  const classAccess = useClassAccess(true);
  const [activeTab, setActiveTab] = useState<'collection' | 'workshop'>('collection');
  const [catalog, setCatalog] = useState<CollectorCardCatalog | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CollectorCardDefinition | null>(null);
  const [resolvedAssets, setResolvedAssets] = useState<ResolvedCollectorCardAssets | null>(null);
  const [reveal, setReveal] = useState<CollectorCardDefinition | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 4, label: '' });
  const [message, setMessage] = useState('');
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const coins = usePetStore(state => state.coins);
  const ownedCards = useCollectorCardStore(state => state.ownedCards);
  const purchase = useCollectorCardStore(state => state.purchase);

  const ownedSet = useMemo(() => new Set(ownedCards.map(card => card.cardId)), [ownedCards]);
  const visibleCards = useMemo(() => {
    if (!catalog) return [];
    return catalog.cards.filter(card => activeTab === 'collection' ? ownedSet.has(card.id) : !ownedSet.has(card.id));
  }, [activeTab, catalog, ownedSet]);

  useEffect(() => {
    if (!classAccess.isAllowed) return;
    loadCollectorCardCatalog().then(setCatalog).catch(reason => {
      setError(reason instanceof Error ? reason.message : '典藏卡清单暂时无法读取');
    });
  }, [classAccess.isAllowed]);

  useEffect(() => {
    if (!catalog) return;
    void Promise.all(catalog.cards.filter(card => ownedSet.has(card.id)).map(async card => (
      [card.id, await areCollectorCardAssetsCached(card)] as const
    ))).then(entries => setCachedIds(new Set(entries.filter(([, ready]) => ready).map(([id]) => id))));
  }, [catalog, ownedSet]);

  const openCard = async (card: CollectorCardDefinition) => {
    setMessage('');
    setProgress({ completed: 0, total: 4, label: '水幕正在显影…' });
    setSelected(card);
    setResolvedAssets(null);
    try {
      const assets = await ensureCollectorCardAssets(card, (completed, total, label) => {
        setProgress({ completed, total, label });
      });
      setResolvedAssets(assets);
      setCachedIds(current => new Set(current).add(card.id));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '卡片显影失败，请检查网络后重试');
    }
  };

  const buyCard = (card: CollectorCardDefinition) => {
    const result = purchase(card.id, card.price);
    if (!result.ok) {
      setMessage(result.reason === 'coins' ? `还差 ${Math.max(0, card.price - coins)} 金币` : '这张卡已经收藏过了');
      return;
    }
    setReveal(card);
    setMessage('');
    window.setTimeout(() => {
      setReveal(null);
      setActiveTab('collection');
      void openCard(card);
    }, 2300);
  };

  if (!classAccess.isAllowed) {
    if (classAccess.status === 'idle' || classAccess.status === 'checking') {
      return <div className="collector-page collector-loading"><Sparkles /><p>正在校验班级权限…</p></div>;
    }
    return (
      <ClassAccessRequired
        title="典藏卡需要班级码"
        description="绑定老师提供的班级码后，即可进入星辉工坊并收藏典藏卡。"
        message={classAccess.message}
        onBind={() => navigate('/settings')}
        onBack={() => navigate('/courses')}
      />
    );
  }

  if (error) return <div className="collector-page collector-error"><h2>典藏工坊</h2><p>{error}</p><button onClick={() => location.reload()}>重新连接</button></div>;
  if (!catalog) return <div className="collector-page collector-loading"><Sparkles /><p>正在打开典藏工坊…</p></div>;

  return (
    <div className="collector-page">
      <header className="collector-page-header">
        <div>
          <span className="collector-kicker">ASTRAL COLLECTION</span>
          <h2>典藏工坊</h2>
          <p>把喜欢的智子化作会随光而动的典藏卡。</p>
        </div>
        <div className="collector-summary">
          <div><strong>{ownedCards.length}</strong><span>/ {catalog.cards.length} 已收藏</span></div>
          <div className="collector-coins"><Coins /> {coins}g</div>
        </div>
      </header>

      <section className="collector-featured-note">
        <Sparkles />
        <div><strong>首期典藏正在显影</strong><span>以后新增卡片会自动出现在这里，不需要重新安装软件。</span></div>
      </section>

      <nav className="collector-tabs" aria-label="典藏卡分类">
        <button
          type="button"
          className={activeTab === 'collection' ? 'active' : ''}
          onClick={() => setActiveTab('collection')}
        >
          <Album /> 我的典藏 <b>{ownedCards.length}</b>
        </button>
        <button
          type="button"
          className={activeTab === 'workshop' ? 'active' : ''}
          onClick={() => setActiveTab('workshop')}
        >
          <ShoppingBag /> 星辉工坊 <b>{catalog.cards.length - ownedCards.length}</b>
        </button>
      </nav>

      {message && <div className="collector-message" role="status">{message}</div>}

      {visibleCards.length > 0 ? <div className="collector-grid">
        {visibleCards.map(card => {
          const owned = ownedSet.has(card.id);
          const cached = cachedIds.has(card.id);
          return (
            <article key={card.id} className={`collector-tile ${owned ? 'owned' : 'locked'}`}>
              <button
                className="collector-tile-art"
                type="button"
                onClick={() => owned ? void openCard(card) : setMessage(`收入${card.name}后解锁完整全息卡面、自动赏卡与专属卡背`)}
                aria-label={owned ? `查看${card.name}典藏卡` : `了解${card.name}典藏卡`}
              >
                <img src={card.assets.thumbnail} alt={card.name} />
                <span className="collector-tile-halo" />
                <span className="collector-number">NO. {card.number}</span>
                <span className="collector-rarity">👑 传说</span>
              </button>
              <div className="collector-tile-body">
                <div><span>{ELEMENT_LABELS[card.element]}属性 · {card.title}</span><h3>{card.name}</h3><p>{card.description}</p></div>
                {owned ? (
                  <button className="collector-primary" type="button" onClick={() => void openCard(card)}>
                    {cached ? <><Sparkles /> 查看典藏</> : <><Download /> 恢复显影</>}
                  </button>
                ) : (
                  <button className="collector-primary" type="button" onClick={() => buyCard(card)}>
                    <Coins /> {card.price}g 收藏
                  </button>
                )}
                <small>{owned ? (cached ? '已下载，可离线欣赏' : '拥有记录已恢复，素材待下载') : '收藏后解锁全息赏卡与专属卡背'}</small>
              </div>
            </article>
          );
        })}
      </div> : (
        <section className="collector-empty">
          {activeTab === 'collection' ? <Album /> : <Sparkles />}
          <h3>{activeTab === 'collection' ? '典藏册还在等待第一颗星光' : '本期典藏已经全部收入囊中'}</h3>
          <p>{activeTab === 'collection' ? '去星辉工坊看看，让喜欢的智子成为第一张典藏卡吧。' : '新的典藏卡上线后，会自动出现在这里。'}</p>
          {activeTab === 'collection' && (
            <button type="button" onClick={() => setActiveTab('workshop')}>
              <ShoppingBag /> 去星辉工坊
            </button>
          )}
        </section>
      )}

      {selected && (
        <div className="collector-modal" role="dialog" aria-modal="true" aria-label={`${selected.name}典藏卡`}>
          <button className="collector-modal-close" type="button" onClick={() => { setSelected(null); setResolvedAssets(null); }} aria-label="关闭"><X /></button>
          {resolvedAssets ? (
            <div className="collector-modal-layout">
              <HoloCardViewer card={selected} assets={resolvedAssets} />
              <aside>
                <span>典藏编号 {selected.number}</span><h2>{selected.name}</h2><h3>{selected.title}</h3>
                <p>{selected.description}</p><blockquote>{selected.quote}</blockquote>
                <div className="collector-archive-tags"><b>{ELEMENT_LABELS[selected.element]}属性</b><b>传说典藏</b><b>{resolvedAssets.source === 'cache' ? '离线缓存' : '高清显影'}</b></div>
              </aside>
            </div>
          ) : message ? (
            <div className="collector-download-state"><RotateCcw /><h3>显影没有完成</h3><p>{message}</p><button onClick={() => void openCard(selected)}>重新显影</button></div>
          ) : (
            <div className="collector-download-state">
              <div className="collector-water-orb"><span>{Math.round((progress.completed / progress.total) * 100)}%</span></div>
              <h3>{progress.label || '水幕正在显影…'}</h3><p>第一次下载完成后，没有网络也能继续欣赏。</p>
            </div>
          )}
        </div>
      )}

      {reveal && (
        <div className="collector-reveal" role="status" aria-live="polite">
          <div className="collector-reveal-light" /><img src={reveal.assets.thumbnail} alt="" />
          <span>典藏编号 {reveal.number}</span><h2>{reveal.name}</h2><p>星光汇聚 · 水幕显影 · 典藏入册</p>
        </div>
      )}
    </div>
  );
}
