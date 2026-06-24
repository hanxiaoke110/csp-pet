import { useState, useEffect } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';

function isMac(): boolean {
  return navigator.userAgent.includes('Mac');
}

function buildUrls(version: string) {
  const short = version.replace(/\./g, '');
  const base = `https://gitee.com/hanliuliu110/csp-pet/releases/download/v${version}`;
  const encodedName = encodeURIComponent(`CSP 学习助手_${version}`);
  return {
    'macOS Apple Silicon': `${base}/csp-v${short}-arm.dmg`,
    'macOS Intel': `${base}/${encodedName}_x64.dmg`,
    'Windows 64位': `${base}/${encodedName}_x64-setup.exe`,
  };
}

export default function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [showLinks, setShowLinks] = useState(false);

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
    if (isMac()) {
      setShowLinks(!showLinks);
    } else {
      setDownloading(true);
      try {
        await update.downloadAndInstall();
      } catch (e) {
        setError('更新失败：' + String(e));
        setDownloading(false);
      }
    }
  };

  const links = update ? buildUrls(update.version) : {};

  return (
    <div className="settings-section">
      <h3>🔄 版本更新</h3>
      <p className="settings-desc">
        当前版本：v{version}
        {update && <span style={{ color: '#7c3aed', fontWeight: 600 }}> — 发现新版本 v{update.version}</span>}
      </p>

      <div className="settings-form">
        {update ? (
          <>
            <button className="mode-btn" onClick={doUpdate} disabled={downloading}
              style={{ background: '#7c3aed' }}>
              {downloading ? '下载中...' : isMac() ? `获取 v${update.version}` : `更新到 v${update.version}`}
            </button>
            {isMac() && showLinks && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(links).map(([name, url]) => (
                  <button key={name} className="mode-btn"
                    onClick={() => openUrl(url as string)}
                    style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', fontSize: 13, padding: '10px 16px' }}>
                    {name}
                  </button>
                ))}
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>点击上方按钮下载，完成后打开安装包即可</p>
              </div>
            )}
          </>
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
