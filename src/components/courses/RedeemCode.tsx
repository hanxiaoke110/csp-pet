import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyCompensationReceipt } from '../../lib/compensationRedemption';
import { getDeviceId } from '../../utils/crypto';
import { redeemExcellenceCode } from '../../lib/excellenceRedemption';

const API = 'https://api.cspstudy.top';

interface Props { onClose: () => void; }

export default function RedeemCode({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'already'; message: string } | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);


  const redeem = async () => {
    const code = input.trim();
    if (!code) return;

    // 1. Compensation code (CMP-): server-generated, class-bound, one-time
    if (code.toUpperCase().startsWith('CMP-')) {
      const normalized = code.toUpperCase();
      try {
        const used = JSON.parse(localStorage.getItem('csp_used_comp_codes') || '[]');
        if (used.includes(normalized)) {
          setResult({ type: 'already', message: '此补偿码已被兑换' });
          return;
        }
      } catch {}

      try {
        const resp = await fetch(`${API}/api/codes/redeem-v2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: normalized, device_hash: getDeviceId() }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
          setResult({ type: 'error', message: data.error || '兑换失败，请稍后重试' });
          return;
        }
        try { await applyCompensationReceipt(normalized, data); }
        catch (error) { setResult({ type: 'error', message: error instanceof Error ? error.message : '保存失败，请重试' }); return; }
        setResult({
          type: 'success',
          message: `🎁 补偿到账：+${data.coins} 金币，+${data.exp} 经验（已存入经验池，可在智子页分配）`,
        });
      } catch {
        setResult({ type: 'error', message: '网络连接失败，请稍后重试' });
      }
      return;
    }

    // 2. Excellence rewards are local; compensation remains online above.
    if (code.toUpperCase().startsWith('EXC-')) {
      setResult(await redeemExcellenceCode(code));
      return;
    }

    // 3. No match
    setResult({ type: 'error', message: '兑换码无效，请检查输入' });
  };

  const handleRedeem = async () => {
    if (submitting.current || !input.trim()) return;
    submitting.current = true;
    setBusy(true);
    try { await redeem(); }
    catch { setResult({ type: 'error', message: '兑换失败，请稍后重试' }); }
    finally { setBusy(false); }
    // Keep the guard until the result is dismissed, including synchronous clicks.
  };

  // portal 到 body：避免祖先卡片的 backdrop-filter 让 fixed 定位失效
  return createPortal(
    <div className="ai-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ai-modal" style={{ width: 400 }}>
        <div className="ai-modal-header">
          <span>🎁 神秘代码</span>
          <button className="ai-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ai-modal-body" style={{ padding: 20 }}>
          {!result ? (
            <>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, textAlign: 'center' }}>
                输入老师给的神秘代码，解锁隐藏奖励 ٩(ˊᗜˋ*)و
                <br />优秀码可离线兑换，补偿码需要联网。优秀码仅北京时间当天有效。
              </p>
              <div className="pw-row">
                <input
                  type="text" className="pw-input" style={{ flex: 1 }}
                  placeholder="输入兑换码..."
                  value={input} onChange={e => setInput(e.target.value)}
                  disabled={busy}
                  onKeyDown={e => { if (e.key === 'Enter') handleRedeem(); }}
                  autoFocus
                />
              </div>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="pw-btn" disabled={busy} onClick={handleRedeem}>{busy ? '兑换中…' : '兑换'}</button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {result.type === 'success' ? '🎉' : result.type === 'already' ? '📋' : '❌'}
              </div>
              <div style={{
                fontSize: 14, fontWeight: 600, whiteSpace: 'pre-line',
                color: result.type === 'error' ? '#ef4444' : '#1e293b',
                lineHeight: 1.8, marginBottom: 16,
              }}>
                {result.message}
              </div>
              <button className="pw-btn" onClick={() => { submitting.current = false; setResult(null); setInput(''); }}>
                {result.type === 'success' ? '好的！' : '重新输入'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
