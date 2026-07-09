import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeviceId } from '../../utils/crypto';

const API = 'https://api.cspstudy.top';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type AccessStatus = 'idle' | 'checking' | 'allowed' | 'missing' | 'denied' | 'offline';

interface AccessState {
  status: AccessStatus;
  message: string;
}

function readClassCode(): string {
  try {
    return localStorage.getItem('csp_class_code') || '';
  } catch {
    return '';
  }
}

function readLastCheckedAt(): number {
  try {
    return parseInt(localStorage.getItem('csp_class_last_checked_at') || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function clearClassAccessCache() {
  try {
    localStorage.removeItem('csp_class_code');
    localStorage.removeItem('csp_class_info');
    localStorage.removeItem('csp_class_label');
    localStorage.removeItem('csp_teacher_name');
    localStorage.removeItem('csp_class_last_checked_at');
  } catch {}
}

export function markClassAccessChecked(data?: { label?: string; teacher_name?: string; class_code?: string }) {
  try {
    localStorage.setItem('csp_class_last_checked_at', String(Date.now()));
    if (data?.label) localStorage.setItem('csp_class_label', data.label);
    if (data?.teacher_name) localStorage.setItem('csp_teacher_name', data.teacher_name);
    if (data?.class_code) {
      localStorage.setItem('csp_class_code', data.class_code);
      localStorage.setItem('csp_class_info', JSON.stringify(data));
    }
  } catch {}
}

export function hasFreshClassAccess(): boolean {
  const code = readClassCode();
  if (!code) return false;
  return Date.now() - readLastCheckedAt() < CACHE_TTL_MS;
}

export function useClassAccess(autoCheck = false) {
  const [state, setState] = useState<AccessState>(() => ({
    status: readClassCode() ? (hasFreshClassAccess() ? 'allowed' : 'idle') : 'missing',
    message: '',
  }));

  // 返回 { ok, message }：ok=false 时 message 为本次校验失败的具体原因。
  // 直接返回 message 而非依赖外部读取 state.message，避免调用方拿到闭包旧值（setState 后闭包不刷新）。
  const ensure = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const code = readClassCode();
    if (!code) {
      const message = '请先绑定老师提供的班级码。';
      setState({ status: 'missing', message });
      return { ok: false, message };
    }

    if (hasFreshClassAccess()) {
      setState({ status: 'allowed', message: '' });
      return { ok: true, message: '' };
    }

    setState({ status: 'checking', message: '正在校验班级权限...' });
    try {
      // 10s 超时：避免服务无响应时永久卡在「校验中」
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const url = `${API}/api/classes/validate?code=${encodeURIComponent(code)}&device_hash=${encodeURIComponent(getDeviceId())}`;
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      // 5xx：校验服务异常，不清缓存（班级码可能仍有效），与「班级码失效」区分
      if (resp.status >= 500) {
        const message = '校验服务异常，请稍后再试。';
        setState({ status: 'offline', message });
        return { ok: false, message };
      }
      const data = await resp.json().catch(() => ({} as Record<string, unknown>));
      if (!resp.ok || data.error) {
        // 班级码失效：清理本地缓存，提示学生重新绑定
        clearClassAccessCache();
        const message = (data.error as string) || '班级权限已失效，请联系老师。';
        setState({ status: 'denied', message });
        return { ok: false, message };
      }
      markClassAccessChecked(data as { label?: string; teacher_name?: string; class_code?: string });
      setState({ status: 'allowed', message: '' });
      return { ok: true, message: '' };
    } catch {
      // 网络不可用 / 超时：不清缓存，保留班级码供下次重试
      const message = '网络暂时不可用，请检查网络后重试。';
      setState({ status: 'offline', message });
      return { ok: false, message };
    }
  }, []);

  useEffect(() => {
    if (autoCheck) ensure();
  }, [autoCheck, ensure]);

  return {
    ...state,
    hasClassCode: !!readClassCode(),
    isAllowed: state.status === 'allowed',
    ensure,
  };
}

export function ClassAccessRequired({
  title = '请先绑定班级码',
  description = '这个功能属于班级专属内容，需要先绑定老师提供的班级码。',
  message,
  onBind,
  onBack,
}: {
  title?: string;
  description?: string;
  message?: string;
  onBind?: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const goBind = onBind || (() => navigate('/settings'));

  return (
    <div className="quiz-practice" style={{ textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
      <h2>{title}</h2>
      <p style={{ color: '#64748b', marginBottom: 12 }}>{description}</p>
      {message && <p style={{ color: '#ef4444', marginBottom: 20, fontWeight: 700 }}>{message}</p>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="mode-btn" onClick={goBind}>去设置绑定</button>
        {onBack && <button className="mode-btn mode-btn-back" onClick={onBack}>返回</button>}
      </div>
    </div>
  );
}
