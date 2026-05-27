import { useState, useRef, useEffect } from 'react';
import { useCourseStore } from '../../stores/courseStore';
import AIService from '../../services/ai/ai-service';
import { renderCodeText } from '../../utils/markdown';

const aiService = new AIService();

const QUICK_BTNS = [
  { label: '📚 近期学的什么？', q: '总结一下最近学的内容，包括知识点和重点' },
  { label: '📝 推荐额外习题', q: '根据我最近的课程内容，推荐一些洛谷的练习题，要带链接' },
  { label: '🗺️ 知识点汇总', q: '帮我汇总最近10节课的所有知识点，用表格列出' },
  { label: '📅 后续学什么', q: '给我列出还没学的课程，按阶段分组，每课一句话说明学什么' },
  { label: '🔍 课外题答疑', q: 'help_qa' },
];

export default function AIChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([{
    role: 'assistant',
    content: '👋 你好！我是你的AI进阶教练。\n\n我可以帮你：\n📚 总结这节课的知识点\n📝 推荐额外的洛谷练习题\n🗺️ 梳理近10节课学了什么\n📅 查看后续课程安排\n🔍 回答课外C++问题\n\n试试下面的快捷按钮，或者直接问我！',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight); }, [messages]);

  useEffect(() => {
    // Track that student asked about CSP-J
    try { localStorage.setItem('csp_asked_cspj', 'true'); } catch {}
  }, []);

  const buildContext = () => {
    const lessons = useCourseStore.getState().lessons;
    const unlockedLessons = useCourseStore.getState().unlockedLessons;
    const unlockedOrders = [...unlockedLessons].map(id => lessons.find(l => l.id === id)?.order).filter(Boolean).sort((a, b) => (a as number) - (b as number));
    const maxOrder = unlockedOrders.length ? unlockedOrders[unlockedOrders.length - 1] : 0;

    const recentLessons = lessons
      .filter(l => unlockedLessons.has(l.id))
      .slice(-10)
      .map(l => ({
        title: l.title, order: l.order,
        knowledgePoints: (l.knowledgePoints || []).map((k: unknown) => typeof k === 'string' ? k : (k as { name: string }).name),
        problemCount: [...(l.review || []), ...(l.inClassCodes || []), ...(l.homework || []), ...(l.extended || [])].length,
      }));

    const upcoming = lessons.filter(l => l.order > (maxOrder as number)).slice(0, 20);

    return `【学生当前进度】已解锁${unlockedOrders.length}节课，最高第${maxOrder}课
【最近10节课】${JSON.stringify(recentLessons)}
【后续课程】${upcoming.map(l => `P${l.order} ${l.title}`).join('\n')}`;
  };

  const sendMsg = async (content?: string) => {
    const text = content || input.trim();
    if (!text || loading) return;

    if (text === 'help_qa') {
      const ctx = buildContext() + '\n\n【模式】课外答疑。请用轻松鼓励的语气回复，告诉学生直接发题目或贴代码即可。';
      setMessages(prev => [...prev, { role: 'user', content: '🔍 我想问一个课外 C++ 问题' }]);
      setInput('');
      setLoading(true);
      try {
        await aiService.ensureConfigured();
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        let full = '';
        await aiService.streamMessage(ctx, 'ai_coach', [], (chunk) => {
          full += chunk;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: full };
            return copy;
          });
        });
      } catch (e) {
        setMessages(prev => [...prev, { role: 'assistant', content: '出错：' + (e as Error).message + '。请检查AI设置。' }]);
      }
      setLoading(false);
      return;
    }

    const userMsg = { role: 'user' as const, content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!content) setInput('');
    setLoading(true);

    try {
      await aiService.ensureConfigured();
      const ctx = buildContext() + '\n\n【学生问题】' + text;
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      let full = '';
      await aiService.streamMessage(ctx, 'ai_coach', messages.filter(m => m.role === 'user' || m.role === 'assistant'), (chunk) => {
        full += chunk;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: full };
          return copy;
        });
      });
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '出错：' + (e as Error).message + '。请检查AI设置。' }]);
    }
    setLoading(false);
  };

  return (
    <div className="ai-coach-page">
      <div className="ai-coach-msgs" ref={msgsRef}>
        {messages.map((m, i) => (
          <div key={i} className={`ai-coach-msg ${m.role}`}>
            <div dangerouslySetInnerHTML={renderCodeText(m.content)} />
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="ai-coach-msg assistant">思考中...</div>
        )}
      </div>
      <div className="ai-coach-quick">
        {QUICK_BTNS.map(b => (
          <button key={b.label} className="ai-coach-qb" onClick={() => sendMsg(b.q)} disabled={loading}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="ai-coach-input-row">
        <textarea
          placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }}}
          rows={2}
        />
        <button onClick={() => sendMsg()} disabled={loading || !input.trim()}>发送</button>
      </div>
    </div>
  );
}
