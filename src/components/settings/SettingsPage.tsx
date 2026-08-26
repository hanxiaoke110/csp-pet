import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getVersion } from '@tauri-apps/api/app';
import { useAIStore } from '../../stores/aiStore';
import { usePetStore } from '../../stores/petStore';
import { AI_MODELS, type AIProvider } from '../../types/ai';
import { getDeviceId } from '../../utils/crypto';
import { clearClassAccessCache, markClassAccessChecked } from '../access/ClassAccessGate';
import ConfirmModal from '../pet/ConfirmModal';
import {
  pickBackupFile, parseBackup, exportBackup, snapshotCurrentToAppData, applyBackup,
  compareVersions, type BackupFile, type ApplyResult,
} from '../../lib/backup';
import UpdateChecker from './UpdateChecker';

const API = 'https://api.cspstudy.top';

export default function SettingsPage() {
  const config = useAIStore(s => s.config);
  const setConfig = useAIStore(s => s.setConfig);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [provider, setProvider] = useState<AIProvider>(config.aiProvider);
  const [model, setModel] = useState(config.model);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setConfig({
      ...config,
      aiProvider: provider,
      model: model || Object.keys(AI_MODELS[provider] || {})[0],
      apiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Stats
  let completedCourses = 0;
  try {
    const saved = localStorage.getItem('csp_problem_status');
    if (saved) {
      completedCourses = Object.values(JSON.parse(saved)).filter((s: unknown) => s === 'completed').length;
    }
  } catch {}

  let quizTotal = 0;
  let quizCorrect = 0;
  try {
    const saved = localStorage.getItem('csp_quiz_state');
    if (saved) {
      const data = JSON.parse(saved);
      quizTotal = data.totalPractice || 0;
      quizCorrect = data.totalCorrect || 0;
    }
  } catch {}

  return (
    <div className="settings-page">
      <h2>⚙️ 设置</h2>

      <div className="settings-section">
        <h3>🤖 AI 配置</h3>
        <p className="settings-desc">配置 AI 教练和问 AI 功能需要的 API Key</p>

        <div className="settings-form">
          <label>AI 服务商</label>
          <select value={provider} onChange={e => {
            const p = e.target.value as AIProvider;
            setProvider(p);
            setModel(Object.keys(AI_MODELS[p] || {})[0]);
          }}>
            <option value="deepseek">DeepSeek</option>
            <option value="kimi">Kimi (月之暗面)</option>
            <option value="dashscope">阿里百炼</option>
            <option value="zhipu">智谱 AI</option>
          </select>

          <label>模型</label>
          <select value={model} onChange={e => setModel(e.target.value)}>
            {Object.entries(AI_MODELS[provider] || {}).map(([id, info]) => (
              <option key={id} value={id}>{info.name}</option>
            ))}
          </select>

          <label>API Key</label>
          <input
            type="password"
            placeholder="输入你的 API Key..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />

          <button className="mode-btn" onClick={handleSave}>
            {saved ? '✅ 已保存' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>🏫 班级绑定</h3>
        <p className="settings-desc">绑定老师提供的班级码，解锁许愿墙及后续更多班级功能</p>
        <ClassBindingSection />
      </div>

      <div className="settings-section">
        <h3>📊 学习数据</h3>
        <div className="settings-stats">
          <div className="settings-stat">
            <span className="sstat-value">{completedCourses}</span>
            <span className="sstat-label">课程验证完成</span>
          </div>
          <div className="settings-stat">
            <span className="sstat-value">{quizTotal}</span>
            <span className="sstat-label">选择题练习</span>
          </div>
          <div className="settings-stat">
            <span className="sstat-value">{quizCorrect}</span>
            <span className="sstat-label">选择题答对</span>
          </div>
          <div className="settings-stat">
            <span className="sstat-value">{quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0}%</span>
            <span className="sstat-label">正确率</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>🏕️ 集训模式</h3>
        <p className="settings-desc">输入教师提供的激活码，开启 12 天集训模式：所有奖励 ×1.5，每日额外 3 份食物，超级挑战每日可完成 1 次</p>
        <TrainingCampSection />
      </div>

      <div className="settings-section">
        <h3>💾 数据备份</h3>
        <p className="settings-desc">换电脑或重装前，先导出备份文件（含智子、金币和学习进度）；图片素材会在导入后自动恢复</p>
        <BackupSection />
      </div>

      <UpdateChecker />
    </div>
  );
}

function TrainingCampSection() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const campActive = usePetStore(s => s.trainingCampActive);
  const campEnd = usePetStore(s => s.trainingCampEndDate);
  const activate = usePetStore(s => s.activateTrainingCamp);
  const claimFoods = usePetStore(s => s.claimTrainingCampFoods);

  const handleActivate = () => {
    if (!code.trim()) { setMsg('请输入激活码'); return; }
    if (activate(code.trim())) {
      setMsg('✅ 集训模式已开启！12 天内所有奖励 ×1.5，超级挑战每日 1 次');
      setCode('');
    } else {
      setMsg('❌ 激活码错误');
    }
  };

  const handleClaim = () => {
    if (claimFoods()) setMsg('🍞 已领取今日 3 份普通食物！');
    else setMsg('今日已领取过，明天再来吧~');
  };

  const daysLeft = campEnd ? Math.max(0, Math.ceil((new Date(campEnd).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div style={{ marginTop: 8 }}>
      {campActive ? (
        <div className="settings-status-card">
          <strong>🏕️ 集训进行中</strong> · 剩余 <strong>{daysLeft}</strong> 天
          <br /><span style={{ fontSize: 12, opacity: 0.85 }}>所有奖励 ×1.5 · 每日可领 3 份食物 · 超级挑战每日 1 次</span>
          <div style={{ marginTop: 8 }}>
            <button className="settings-btn settings-btn-secondary" onClick={handleClaim} style={{ padding: '5px 12px', fontSize: 12 }}>🍞 领取今日食物</button>
          </div>
          {msg && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>{msg}</div>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="settings-input" value={code} onChange={e => setCode(e.target.value)} placeholder="输入教师激活码" style={{ width: 200 }} />
            <button className="settings-btn" onClick={handleActivate}>激活集训</button>
          </div>
          {msg && <div style={{ marginTop: 6, fontSize: 12, color: msg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

function ClassBindingSection() {
  const [code, setCode] = useState('');
  const [classInfo, setClassInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('csp_class_info') || 'null'); } catch { return null; }
  });
  const [nickname, setNickname] = useState(() => localStorage.getItem('csp_display_name') || '');
  const [realName, setRealName] = useState(() => localStorage.getItem('csp_student_name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('csp_student_phone') || '');
  const [msg, setMsg] = useState('');
  const [binding, setBinding] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Verify binding status on mount
  useEffect(() => {
    const code = localStorage.getItem('csp_class_code');
    if (!code) return;
    fetch(`${API}/api/classes/validate?code=${encodeURIComponent(code)}&device_hash=${getDeviceId()}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          clearClassAccessCache();
          localStorage.removeItem('csp_display_name');
          localStorage.removeItem('csp_student_name');
          localStorage.removeItem('csp_student_phone');
          setClassInfo(null); setNickname(''); setRealName(''); setPhone('');
          setMsg(`⚠️ ${data.error}，班级码已自动清除`);
        }
      })
      .catch(() => {});
  }, []);

  const handleBind = async () => {
    if (!nickname.trim()) { setMsg('请填写昵称'); return; }
    if (!/^[a-zA-Z一-龥]{1,10}$/.test(nickname.trim())) { setMsg('昵称只能使用中文或英文，1-10个字'); return; }
    if (!realName.trim()) { setMsg('请填写真实姓名'); return; }
    if (!/^[一-龥]{2,10}$/.test(realName.trim())) { setMsg('真实姓名需2-10个汉字'); return; }
    if (!phone.trim()) { setMsg('请填写手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { setMsg('手机号格式不正确'); return; }
    setBinding(true); setMsg('');
    try {
      const resp = await fetch(`${API}/api/classes/bind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_code: code.trim(),
          device_hash: getDeviceId(),
          student_name: realName.trim(),
          phone: phone.trim(),
        }),
      });
      const data = await resp.json();
      if (data.error) { setMsg(data.error); setBinding(false); return; }

      localStorage.setItem('csp_class_code', code.trim());
      localStorage.setItem('csp_class_info', JSON.stringify({ class_code: code.trim(), label: data.label || '', teacher_name: data.teacher_name || '' }));
      localStorage.setItem('csp_class_label', data.label || '');
      localStorage.setItem('csp_teacher_name', data.teacher_name || '');
      markClassAccessChecked({ class_code: code.trim(), label: data.label || '', teacher_name: data.teacher_name || '' });
      localStorage.setItem('csp_display_name', nickname.trim());
      localStorage.setItem('csp_student_name', realName.trim() || nickname.trim());
      localStorage.setItem('csp_student_phone', phone.trim());
      setClassInfo(data); setShowModal(false);
      setMsg('✅ 班级绑定成功！');
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('网络错误，请重试'); }
    setBinding(false);
  };

  const saveInfo = async () => {
    if (!nickname.trim()) { setMsg('请填写昵称'); return; }
    if (!/^[a-zA-Z一-龥]{1,10}$/.test(nickname.trim())) { setMsg('昵称只能使用中文或英文，1-10个字'); return; }
    if (!realName.trim()) { setMsg('请填写真实姓名'); return; }
    if (!/^[一-龥]{2,10}$/.test(realName.trim())) { setMsg('真实姓名需2-10个汉字'); return; }
    if (!phone.trim()) { setMsg('请填写手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { setMsg('手机号格式不正确'); return; }
    localStorage.setItem('csp_display_name', nickname.trim());
    localStorage.setItem('csp_student_name', realName.trim() || nickname.trim());
    localStorage.setItem('csp_student_phone', phone.trim());
    // Sync to server
    const classCode = localStorage.getItem('csp_class_code');
    if (classCode) {
      try {
        await fetch(`${API}/api/classes/update-info`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ class_code: classCode, device_hash: getDeviceId(), student_name: realName.trim() || nickname.trim() }),
        });
      } catch {}
    }
    setShowModal(false);
    setMsg('✅ 信息已更新');
    setTimeout(() => setMsg(''), 2000);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {classInfo ? (
        <div className="settings-status-card">
          <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
            ✅ 已绑定：{classInfo.label}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            老师：{classInfo.teacher_name} · 班级码：{classInfo.class_code}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
            {nickname && <div>昵称：{nickname}</div>}
            {realName && <div>真实姓名：{realName}</div>}
            {phone && <div>手机号：{phone}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => setShowModal(true)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>✏️ 修改信息</button>
            <button onClick={() => { clearClassAccessCache(); setClassInfo(null); setNickname(''); setRealName(''); setPhone(''); setMsg('已解绑班级，班级专属功能将需要重新绑定'); }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>🚫 解绑</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => { setShowModal(true); setMsg(''); setNickname(''); setRealName(''); setPhone(''); }} style={{
            padding: '10px 32px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #FF8C00, #F96D00)',
            color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            boxShadow: '0 4px 12px rgba(255,140,0,0.25)',
          }}>
            🔗 绑定班级
          </button>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            💡 绑定后解锁许愿墙及后续更多班级功能
          </div>
          {msg && <div style={{ marginTop: 6, fontSize: 12, color: msg.includes('⚠️') ? '#ef4444' : '#16a34a' }}>{msg}</div>}
        </div>
      )}

      {/* ── Bind / Edit Modal ──
          必须 portal 到 body：窗口皮肤会给 .settings-section 加 backdrop-filter，
          它会让后代 position:fixed 相对卡片而不是视口定位，导致弹窗被裁掉 */}
      {showModal && createPortal(
        <div className="gacha-overlay" onClick={() => setShowModal(false)}>
          <div className="buy-confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
            <div className="buy-confirm-header">
              <span>{classInfo ? '✏️ 修改信息' : '🏫 绑定班级'}</span>
              <button className="ai-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="buy-confirm-body" style={{ alignItems: 'stretch', gap: 12 }}>
              {!classInfo && (
                <div className="bind-modal-field">
                  <label>班级码</label>
                  <input className="bind-modal-input" value={code} onChange={e => setCode(e.target.value)} placeholder="输入老师给的班级码" />
                </div>
              )}
              <div className="bind-modal-field">
                <label>昵称 *（同学可见）</label>
                <input className="bind-modal-input" value={nickname} onChange={e => setNickname(e.target.value.slice(0, 10))} placeholder="在许愿墙显示的名字" />
              </div>
              <div className="bind-modal-field">
                <label>真实姓名 🔒（仅老师可见）</label>
                <input className="bind-modal-input" value={realName} onChange={e => setRealName(e.target.value)} placeholder="用于老师联系你" />
              </div>
              <div className="bind-modal-field">
                <label>手机号 🔒（仅老师可见）</label>
                <input className="bind-modal-input" value={phone} onChange={e => setPhone(e.target.value.slice(0, 11))} placeholder="请输入11位手机号（必填）" />
              </div>
              {msg && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{msg}</div>}
            </div>
            <div className="buy-confirm-actions">
              <button className="mode-btn mode-btn-back" onClick={() => setShowModal(false)}>取消</button>
              <button className="mode-btn" onClick={classInfo ? saveInfo : handleBind} disabled={binding} style={{ background: binding ? '#cbd5e1' : undefined }}>
                {classInfo ? '保存修改' : (binding ? '绑定中...' : '确认绑定')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function BackupSection() {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ data: BackupFile; warning: string | null } | null>(null);
  const [doneInfo, setDoneInfo] = useState<ApplyResult | null>(null);

  const handleExport = async () => {
    setBusy('export');
    setMsg(null);
    try {
      const path = await exportBackup();
      setMsg({ text: `✅ 备份已保存到：${path}`, ok: true });
    } catch (e: any) {
      if (String(e) !== 'cancelled' && !String(e).includes('cancelled')) {
        setMsg({ text: `❌ 导出失败：${e}`, ok: false });
      }
    } finally {
      setBusy(null);
    }
  };

  const handlePickImport = async () => {
    setBusy('import');
    setMsg(null);
    try {
      const raw = await pickBackupFile();
      const parsed = parseBackup(raw);
      if (!parsed.ok) {
        setMsg({ text: `❌ ${parsed.error}`, ok: false });
        return;
      }
      let warning: string | null = null;
      try {
        const current = await getVersion();
        if (compareVersions(parsed.data.appVersion, current) > 0) {
          warning = `备份来自更新版本（v${parsed.data.appVersion}，当前 v${current}），建议先更新 App 再导入`;
        }
      } catch { /* 版本对比失败不阻塞 */ }
      setPendingImport({ data: parsed.data, warning });
    } catch (e: any) {
      if (String(e) !== 'cancelled' && !String(e).includes('cancelled')) {
        setMsg({ text: `❌ 读取备份失败：${e}`, ok: false });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    const { data } = pendingImport;
    setPendingImport(null);
    setBusy('import');
    setMsg(null);
    try {
      // 导入前强制快照，失败则中止，绝不在没有兜底的情况下覆盖数据
      await snapshotCurrentToAppData();
      const result = await applyBackup(data);
      setDoneInfo(result);
    } catch (e: any) {
      setMsg({ text: `❌ 导入失败：${e}。现有数据未受影响`, ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="settings-btn" onClick={handleExport} disabled={busy !== null}>
          {busy === 'export' ? '正在导出…' : '📤 导出备份'}
        </button>
        <button className="settings-btn settings-btn-secondary" onClick={handlePickImport} disabled={busy !== null}>
          {busy === 'import' ? '正在导入…' : '📥 导入备份'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.7 }}>
        💡 把导出的 .json 文件拷到 U 盘或发送到新电脑，在新电脑的同一页面导入即可。备份不再复制可重新获取的图片，因此体积更小，在 Windows 上也更稳定。
      </div>
      {msg && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: msg.ok ? '#16a34a' : '#dc2626', wordBreak: 'break-all' }}>
          {msg.text}
        </div>
      )}

      {pendingImport && (
        <ConfirmModal
          icon="📥" title="确认导入备份"
          desc={`备份时间：${new Date(pendingImport.data.exportedAt).toLocaleString('zh-CN')}\n包含 ${Object.keys(pendingImport.data.localStorage).length} 项设置与进度、${Object.keys(pendingImport.data.sprites || {}).length} 个精灵素材。\n导入会覆盖本机现有数据（已自动保留当前快照）。${pendingImport.warning ? `\n⚠️ ${pendingImport.warning}` : ''}`}
          confirmText="确认导入"
          onCancel={() => setPendingImport(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {doneInfo && (
        <ConfirmModal
          icon="✅" title="导入完成"
          desc={`已恢复 ${doneInfo.lsCount} 项设置与进度、${doneInfo.spriteCount} 个精灵素材。\n重启应用后全部生效。`}
          confirmText="立即重启"
          onCancel={() => setDoneInfo(null)}
          onConfirm={() => window.location.reload()}
        />
      )}
    </div>
  );
}
