import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { loadKnowledgePointData, getPrimaryKnowledgePoint, getPrimaryKnowledgeLectures } from '../../utils/knowledgePointHelp';

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
  const lectures = loaded ? getPrimaryKnowledgeLectures(questionId) : [];

  useEffect(() => {
    let cancelled = false;
    loadKnowledgePointData().then(() => {
      if (!cancelled) setLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 数据未加载或题目未映射 → 不显示
  if (!loaded || !kp) return null;

  const cardUrl = kp.feishuCardUrl;
  const primaryLecture = lectures[0] || null;
  const lectureUrl = primaryLecture?.feishuUrl || kp.feishuLectureUrl;
  if (!cardUrl && !lectureUrl) return null;

  const openLearningUrl = async (url: string) => {
    if (!url) return;
    try {
      if (/^https?:\/\//.test(url)) {
        await openUrl(url);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url, '_blank');
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
          onClick={() => openLearningUrl(cardUrl || lectureUrl)}
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
        {lectureUrl && (
          <span
            onClick={() => openLearningUrl(lectureUrl)}
            style={{
              color: '#0f766e',
              cursor: 'pointer',
              marginLeft: 10,
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            详细讲解
          </span>
        )}
      </div>
    );
  }

  // 答错：突出按钮
  return (
    <div style={{
      marginTop: 14,
      padding: '12px 16px',
      background: '#fff7ed',
      borderRadius: 10,
      border: '1px solid #fed7aa',
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
        {primaryLecture && (
          <span style={{ display: 'block', color: '#64748b', marginTop: 2 }}>
            还想系统学，就继续看「{primaryLecture.title.replace(/^专题详解｜/, '')}」。
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cardUrl && (
          <button
            onClick={() => openLearningUrl(cardUrl)}
            style={{
              padding: '6px 14px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            打开知识卡
          </button>
        )}
        {lectureUrl && (
          <button
            onClick={() => openLearningUrl(lectureUrl)}
            style={{
              padding: '6px 14px',
              background: '#fff',
              color: '#0f766e',
              border: '1px solid #99f6e4',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            详细讲解
          </button>
        )}
      </div>
    </div>
  );
}
