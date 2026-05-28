import { useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
import { usePetStore } from '../../stores/petStore';
import { AI_MODELS, type AIProvider } from '../../types/ai';
import UpdateChecker from './UpdateChecker';

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
        <p className="settings-desc">输入教师提供的激活码，开启 12 天集训模式：所有奖励 ×1.5，每日额外 3 份食物</p>
        <TrainingCampSection />
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
      setMsg('✅ 集训模式已开启！12 天内所有奖励 ×1.5');
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
        <div style={{ background: '#065f46', borderRadius: 10, padding: '10px 14px', color: '#d1fae5' }}>
          <strong>🏕️ 集训进行中</strong> · 剩余 <strong>{daysLeft}</strong> 天
          <br /><span style={{ fontSize: 12 }}>所有奖励 ×1.5 · 每日可领 3 份食物</span>
          <div style={{ marginTop: 6 }}>
            <button onClick={handleClaim} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#34d399', color: '#000', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>🍞 领取今日食物</button>
          </div>
          {msg && <div style={{ marginTop: 4, fontSize: 11 }}>{msg}</div>}
        </div>
      ) : (
        <div>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="输入教师激活码" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: 12, width: 160 }} />
          <button onClick={handleActivate} style={{ marginLeft: 6, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#000', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>激活集训</button>
          {msg && <div style={{ marginTop: 6, fontSize: 12, color: msg.startsWith('✅') ? '#34d399' : '#f87171' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
