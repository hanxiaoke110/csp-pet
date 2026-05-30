import { useState, useEffect } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

export default function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion()
      .then(v => setVersion(v))
      .catch(() => setVersion('0.0.0'));
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    setError('');
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
      } else {
        setError('已经是最新版本');
        setTimeout(() => setError(''), 3000);
      }
    } catch (e) {
      setError('检查更新失败：' + String(e));
    } finally {
      setChecking(false);
    }
  };

  const doUpdate = async () => {
    if (!update) return;
    setDownloading(true);
    try {
      await update.downloadAndInstall();
      // App will restart automatically after install
    } catch (e) {
      setError('更新失败：' + String(e));
      setDownloading(false);
    }
  };

  return (
    <div className="settings-section">
      <h3>🔄 版本更新</h3>
      <p className="settings-desc">
        当前版本：v{version}
        {update && <span style={{ color: '#7c3aed', fontWeight: 600 }}> — 发现新版本 v{update.version}</span>}
      </p>

      <div className="settings-form">
        {update ? (
          <button className="mode-btn" onClick={doUpdate} disabled={downloading}
            style={{ background: '#7c3aed' }}>
            {downloading ? '下载中...' : `更新到 v${update.version}`}
          </button>
        ) : (
          <button className="mode-btn" onClick={checkUpdate} disabled={checking}>
            {checking ? '检查中...' : '检查更新'}
          </button>
        )}

        {error && <p style={{ fontSize: 12, color: error.includes('最新') ? '#16a34a' : '#dc2626', marginTop: 8 }}>{error}</p>}
        {update?.body && (
          <details style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
            <summary>更新内容</summary>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{update.body}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
