import { useState, useEffect } from 'react';
import { loadKnowledgePointData, getPrimaryKnowledgePoint } from '../../utils/knowledgePointHelp';

interface KnowledgePointHelpProps {
  /** 题目 ID，对应 question-knowledge-mapping.json 中的 key */
  questionId: string;
  /** 用户是否答对 */
  isCorrect: boolean;
}

/**
 * 题后知识点帮助入口组件。
 *
 * 答错时：显示突出按钮 "没懂？看「XX知识卡」"
 * 答对时：显示较轻文字入口 "巩固这个知识点"
 * 未建立映射：不显示任何内容
 *
 * 在普通练习、CSP 真题、超级挑战、智子试炼场共用的题目解析区接入。
 */
export default function KnowledgePointHelp({ questionId, isCorrect }: KnowledgePointHelpProps) {
  const [loaded, setLoaded] = useState(false);
  const kp = loaded ? getPrimaryKnowledgePoint(questionId) : null;

  useEffect(() => {
    let cancelled = false;
    loadKnowledgePointData().then(() => {
      if (!cancelled) setLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 数据未加载或题目未映射 → 不显示
  if (!loaded || !kp) return null;

  // 知识卡 URL 为空 → 不显示（飞书文档尚未创建）
  const cardUrl = kp.feishuCardUrl;
  if (!cardUrl) {
    // 知识卡 URL 未填入，只显示知识点名称提示
    return null;
  }

  const handleOpen = () => {
    try {
      // 在 Tauri WebView 中，飞书链接用浏览器默认行为打开
      // @tauri-apps/plugin-shell 的 open 可打开外部链接
      window.open(cardUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // 兜底
      window.open(cardUrl, '_blank');
    }
  };

  if (isCorrect) {
    // 答对：轻量文字入口
    return (
      <div style={{
        marginTop: 12,
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
      }}>
        💡 想巩固一下？
        <span
          onClick={handleOpen}
          style={{
            color: '#f59e0b',
            cursor: 'pointer',
            marginLeft: 4,
            textDecoration: 'underline',
            fontWeight: 500,
          }}
        >
          看「{kp.name}」知识卡
        </span>
      </div>
    );
  }

  // 答错：突出按钮
  return (
    <div style={{
      marginTop: 14,
      padding: '12px 16px',
      background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
      borderRadius: 10,
      border: '1px solid #fcd34d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
        <strong>🤔 没懂？</strong>
        {' '}先花 1 分钟看看
        <span style={{ fontWeight: 700, color: '#d97706' }}>「{kp.name}」</span>
        知识卡，快速搞懂核心概念。
      </div>
      <button
        onClick={handleOpen}
        style={{
          padding: '6px 16px',
          background: '#f59e0b',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        📖 打开知识卡
      </button>
    </div>
  );
}
