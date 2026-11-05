import { useEffect, useState } from 'react';
import { usePerformanceMode, writePerformanceMode } from '../../lib/performanceMode';
import { formatCacheBytes, hasDesktopCacheAccess, inspectDownloadCache, type CacheReport } from '../../lib/downloadCache';

const LABELS: Record<string, string> = {
  'pet-sprites': '智子素材（保留）', 'collector-cards': '典藏卡素材',
  'wardrobe-assets': '装扮素材', 'question-bank-cache-v2': '离线题库',
};
export default function ResourceSettings() {
  const mode = usePerformanceMode();
  const [report, setReport] = useState<CacheReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = async (clean = false) => {
    setBusy(true); setMessage('');
    try {
      const next = await inspectDownloadCache(clean); setReport(next);
      if (clean) setMessage(`已清理 ${formatCacheBytes(next.removedBytes)} 过期缓存文件。${next.skippedFiles ? '部分文件无法检查，已保留。' : ''}`);
    } catch (error) { setMessage(`${clean ? '清理未完成' : '无法读取缓存'}：${error instanceof Error ? error.message : String(error)}。学习记录和素材来源不受影响。`); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (hasDesktopCacheAccess()) void refresh(); }, []);
  const total = report?.entries.reduce((sum, entry) => sum + entry.bytes, 0) || 0;
  const cleanable = report?.entries.reduce((sum, entry) => sum + entry.cleanableBytes, 0) || 0;
  return <>
    <div className="settings-section">
      <h3>运行性能</h3>
      <label htmlFor="performance-mode">显示模式 </label>
      <select id="performance-mode" value={mode} onChange={event => writePerformanceMode(event.target.value === 'economy' ? 'economy' : 'standard')}>
        <option value="standard">标准模式</option><option value="economy">省资源模式</option>
      </select>
      <p className="settings-desc">省资源模式会静止待机智子和装饰，降低动作帧率，简化战斗特效与画面精度。切换后自动保存并同步到其他窗口，学习进度、战斗规则和奖励不变。</p>
    </div>
    <div className="settings-section">
      <h3>下载缓存</h3>
      <p className="settings-desc">统计本机下载素材和离线题库的文件大小。可清理超过一天且不再被引用的旧版题库，以及中断下载临时文件。保留当前题库、上一版离线回退题库、正在写入的题库、全部智子和装扮素材，以及存档、金币、备份、日记和专注记录。</p>
      {!hasDesktopCacheAccess() ? <p>浏览器预览无法读取本机缓存，请在桌面应用中查看。</p> : <>
        <p aria-live="polite">{report ? `已下载文件：${formatCacheBytes(total)}，可安全清理：${formatCacheBytes(cleanable)}` : '正在读取缓存大小…'}</p>
        {report?.entries.map(entry => <div key={entry.name}>{LABELS[entry.name] || entry.name}：{formatCacheBytes(entry.bytes)}</div>)}
        {report && !report.questionCleanupAvailable && <p>离线题库引用信息不完整，已保留全部题库文件。</p>}
        {Boolean(report?.skippedFiles) && <p>部分文件无法检查，已跳过，统计不包含这些文件。</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="settings-btn settings-btn-secondary" disabled={busy} onClick={() => void refresh()}>刷新用量</button>
          <button className="settings-btn" disabled={busy || cleanable === 0} onClick={() => void refresh(true)}>{busy ? '正在处理…' : '清理过期缓存'}</button>
        </div>
      </>}
      {message && <p role="status">{message}</p>}
    </div>
  </>;
}
