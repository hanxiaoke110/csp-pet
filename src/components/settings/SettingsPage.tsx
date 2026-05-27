import { useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
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

      <UpdateChecker />
    </div>
  );
}
