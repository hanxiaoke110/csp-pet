import { useState, useEffect } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch } from '@tauri-apps/plugin-http';
import { createAutomaticBackup } from '../../lib/backup';

function isMac(): boolean {
  return navigator.userAgent.includes('Mac');
}

// update.json 是下载 URL 的唯一真源（与 Tauri updater 同源），避免硬编码文件名导致 404
const UPDATE_JSON_URL = 'https://gitee.com/hanliuliu110/csp-pet/raw/master/update.json';
const PLATFORM_LABELS: Record<string, string> = {
  'darwin-aarch64': 'macOS Apple Silicon',
  'darwin-x86_64': 'macOS Intel',
  'windows-x86_64': 'Windows 64位',
};

async function fetchDownloadLinks(): Promise<Record<string, string>> {
  const res = await fetch(UPDATE_JSON_URL);
  const data = await res.json();
  const p = data.platforms || {};
  const links: Record<string, string> = {};
  for (const [key, label] of Object.entries(PLATFORM_LABELS)) {
    const url = p[key]?.url;
    if (url) links[label] = url;
  }
  return links;
}

export default function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});

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
        try {
          setLinks(await fetchDownloadLinks());
        } catch {
          setLinks({});
        }
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
    try {
      await createAutomaticBackup('before-update');
    } catch (e) {
      // 更新本身不会删除 AppData；备份权限异常时不能让孩子永远无法升级。
      setError('⚠️ 更新前自动备份失败，更新仍会继续：' + String(e));
    }
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
                {Object.entries(links).length > 0 ? (
                  Object.entries(links).map(([name, url]) => (
                    <button key={name} className="mode-btn"
                      onClick={() => openUrl(url)}
                      style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', fontSize: 13, padding: '10px 16px' }}>
                      {name}
                    </button>
                  ))
                ) : (
                  <button className="mode-btn"
                    onClick={() => openUrl(`https://gitee.com/hanliuliu110/csp-pet/releases/tag/v${update.version}`)}
                    style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', fontSize: 13, padding: '10px 16px' }}>
                    打开 Gitee Releases 下载
                  </button>
                )}
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
