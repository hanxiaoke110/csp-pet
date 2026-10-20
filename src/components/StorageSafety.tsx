import { useEffect, useState } from 'react';
import { storageWritesAllowed, RESTORE_GENERATION_KEY, interruptedRestore } from '../lib/restoreBarrier';
import { usePetStore } from '../stores/petStore';

export default function StorageSafety() {
  const error = usePetStore(state => state.loadError);
  const [stale, setStale] = useState(!storageWritesAllowed());
  const [bankWarning, setBankWarning] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<{ lsCount: number; sqliteFailures: number } | null>(null);
  useEffect(() => {
    const warn = () => setBankWarning(true);
    const restored = (event: Event) => {
      setRestoreSummary((event as CustomEvent).detail);
      setStale(!storageWritesAllowed());
    };
    window.addEventListener('question-bank-update-warning', warn);
    window.addEventListener('backup-restore-completed', restored);
    return () => {
      window.removeEventListener('question-bank-update-warning', warn);
      window.removeEventListener('backup-restore-completed', restored);
    };
  }, []);
  useEffect(() => {
    const check = () => setStale(!storageWritesAllowed());
    const blockStaleInput = (event: Event) => {
      if (!storageWritesAllowed() && !(event.target as Element)?.closest?.('[data-storage-reload]')) {
        event.preventDefault(); event.stopImmediatePropagation(); check();
      }
    };
    document.addEventListener('click', blockStaleInput, true);
    document.addEventListener('keydown', blockStaleInput, true);
    window.addEventListener('storage', check);
    const timer = window.setInterval(check, 200);
    return () => { clearInterval(timer); window.removeEventListener('storage', check); document.removeEventListener('click', blockStaleInput, true); document.removeEventListener('keydown', blockStaleInput, true); };
  }, []);
  if (!stale && !error) return bankWarning ? <div role="status" style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9999, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412' }}>在线题库暂未更新，仍可使用已有题库练习。<button onClick={() => setBankWarning(false)}>知道了</button></div> : null;
  if (!stale && location.pathname === '/settings') return null;
  const restoring = localStorage.getItem(RESTORE_GENERATION_KEY)?.startsWith('restoring:');
  return <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: '#f8fafc', padding: 40, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
    <h2>{restoreSummary ? '本地存档已恢复' : stale ? '存档正在切换' : '存档需要检查'}</h2>
    {restoreSummary && <p>已恢复 {restoreSummary.lsCount} 项设置与进度。{restoreSummary.sqliteFailures > 0 && `其中 ${restoreSummary.sqliteFailures} 项数据库镜像写入失败，请保留原备份并检查应用目录权限。`}</p>}
    <p>{stale ? '旧状态已暂停写入，请重新加载以使用恢复后的数据。' : error}</p>
    <p>请不要清空数据或卸载应用。原存档会保留。</p>
    <button data-storage-reload disabled={Boolean(restoring && !interruptedRestore)} onClick={() => window.location.reload()}>{restoring && !interruptedRestore ? '正在恢复，请稍候…' : '重新加载'}</button>
    {!stale && <button onClick={() => { window.location.href = '/settings'; }}>打开设置与备份</button>}
  </div>;
}
