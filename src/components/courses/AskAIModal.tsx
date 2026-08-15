import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Problem } from '../../types/course';
import AIService from '../../services/ai/ai-service';
import { renderMarkdown, escapeHtml } from '../../utils/markdown';

interface Props { problem: Problem; onClose: () => void; }

const aiService = new AIService();

export default function AskAIModal({ problem, onClose }: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([{
    role: 'assistant',
    content: '你好！我是你的 C++ 学习伙伴。\n\n关于这道题，你可以：\n- 没思路了，让我帮你分析\n- 代码有 bug，贴出来我帮你看看\n- 知识点不理解，我用简单的话讲给你听\n- 要一个代码框架自己填\n\n我不会直接给你答案哦！',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight); }, [messages]);

  const buildContext = () => {
    const samples = (problem.samples || []).map((s, i) =>
      `样例${i + 1}: 输入=${s.in || s.input || ''} 输出=${s.out || s.output || ''}`
    ).join('\n');
    return `【题目】${problem.title}\n【描述】${problem.description || ''}\n【输入格式】${problem.inputFormat || ''}\n【输出格式】${problem.outputFormat || ''}\n${samples ? '【样例】\n' + samples : ''}`;
  };

  const sendToAI = async (content: string) => {
    setMessages(prev => [...prev, { role: 'user' as const, content }]);
    setLoading(true);
    try {
      await aiService.ensureConfigured();
      const response = await aiService.sendMessage(
        buildContext() + '\n\n【学生问题】' + content,
        'student',
        messages.filter(m => m.role === 'user' || m.role === 'assistant')
      );
      setMessages(prev => [...prev, { role: 'assistant' as const, content: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant' as const, content: '出错了：' + escapeHtml((e as Error).message) + '。请检查 AI 设置。' }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMsg = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendToAI(text);
  };

  const sendCode = async () => {
    const code = codeInput.trim();
    if (!code || loading) return;
    setCodeInput('');
    setShowCodeInput(false);
    await sendToAI('我写了这段代码，帮我看看哪里有问题，不要给我完整答案：\n```cpp\n' + code + '\n```');
  };

  const quickBtns = [
    { label: '🤷 没思路', q: '这道题我看了题目描述，但是没有思路，能帮我分析一下吗？' },
    { label: '🐛 代码有bug', q: 'bug' },
    { label: '📖 不理解知识点', q: '这个知识点我还不太理解，能用简单的话再讲一遍吗？' },
    { label: '✍️ 要代码框架', q: '我已经理解思路了，能给一个带___的代码框架让我自己填吗？' },
  ];

  const handleQuick = (q: string) => {
    if (q === 'bug') {
      setShowCodeInput(!showCodeInput);
    } else {
      sendToAI(q);
    }
  };

  // portal 到 body：避免祖先卡片的 backdrop-filter 让 fixed 定位失效
  return createPortal(
    <div className="ai-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ai-modal">
        <div className="ai-modal-header">
          <span>🤔 向 AI 提问 — {problem.title}</span>
          <button className="ai-modal-close" onClick={onClose}>✖</button>
        </div>
        <div className="ai-modal-body" ref={msgsRef}>
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            </div>
          ))}
          {loading && <div className="ai-msg assistant">思考中...</div>}
        </div>
        <div className="ai-modal-quick">
          {quickBtns.map(b => (
            <button key={b.label} className="ai-qb" onClick={() => handleQuick(b.q)}>
              {b.label}
            </button>
          ))}
        </div>
        {showCodeInput && (
          <div className="ai-code-row">
            <textarea
              placeholder="把你的代码粘贴到这里..."
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              rows={5}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <button onClick={sendCode} disabled={loading || !codeInput.trim()}>🔍 分析代码</button>
          </div>
        )}
        <div className="ai-modal-input">
          <textarea
            placeholder="输入你的问题... (Enter 发送)" rows={2}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }}}
          />
          <button onClick={sendMsg} disabled={loading || !input.trim()}>发送</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
