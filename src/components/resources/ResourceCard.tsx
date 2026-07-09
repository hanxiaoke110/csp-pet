import { useState } from 'react';
import type { LearningResource, ResourceStatus } from './types';

const TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  lecture: { label: '讲义卡', emoji: '📘', color: '#3b82f6' },
  fable: { label: '寓言卡', emoji: '🐉', color: '#8b5cf6' },
  practice: { label: '配套练习', emoji: '✏️', color: '#10b981' },
  review: { label: '复盘材料', emoji: '🔎', color: '#f59e0b' },
};

// 兼容新旧阶段名：C1-C4 真实阶段名 + 旧的 基础/进阶/综合
const STAGE_COLOR: Record<string, string> = {
  'C1 入门阶段': '#10b981',
  'C2 基础阶段': '#3b82f6',
  'C3 进阶阶段': '#f59e0b',
  'C4 提高阶段': '#ef4444',
  '基础': '#10b981',
  '进阶': '#3b82f6',
  '综合': '#f59e0b',
};

const STATUS_META: Record<Exclude<ResourceStatus, 'hidden'>, { label: string; color: string }> = {
  ready: { label: '已就绪', color: '#10b981' },
  coming_soon: { label: '制作中', color: '#f59e0b' },
};

export default function ResourceCard({
  resource,
  onOpen,
}: {
  resource: LearningResource;
  onOpen: (r: LearningResource) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const meta = TYPE_META[resource.type] || { label: resource.type, emoji: '📄', color: '#64748b' };
  const stageColor = STAGE_COLOR[resource.stage] || '#64748b';
  const locked = resource.requiresClassCode;
  // hidden 已在页面层过滤；缺省按 coming_soon 处理（保守显示“制作中”）
  const statusKey: Exclude<ResourceStatus, 'hidden'> = resource.status === 'ready' ? 'ready' : 'coming_soon';
  const statusMeta = STATUS_META[statusKey];
  const hasThumb = !!resource.thumbnailUrl && !imgError;

  // ready：打开；coming_soon：制作中（仍可点击打开占位链接，飞书文档后续直接更新）
  const buttonLabel = statusKey === 'ready'
    ? (locked ? '🔒 验证班级码后打开' : '🔗 打开')
    : '制作中';

  return (
    <div
      className="resource-card"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* 缩略图：有则显示，空或加载失败显示简洁占位（不破图） */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 8,
          overflow: 'hidden',
          background: hasThumb ? '#f1f5f9' : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasThumb ? (
          <img
            src={resource.thumbnailUrl}
            alt={resource.title}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 36, opacity: 0.8 }}>{meta.emoji}</span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          {typeof resource.lessonNo === 'number' && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: meta.color, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
              P{resource.lessonNo}
            </span>
          )}
          <strong style={{ fontSize: 15, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resource.title}
          </strong>
        </div>
        <span
          title={statusMeta.label}
          style={{ fontSize: 12, background: `${statusMeta.color}1a`, color: statusMeta.color, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {statusMeta.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, color: '#fff', background: meta.color }}>{meta.label}</span>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, color: '#fff', background: stageColor }}>{resource.stage}</span>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, color: '#475569', background: '#f1f5f9' }}>{resource.level}</span>
        {locked && (
          <span title="需要绑定班级码后打开" style={{ fontSize: 12, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            🔒 班级码
          </span>
        )}
      </div>

      {resource.description && (
        <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{resource.description}</p>
      )}

      {resource.tags && resource.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {resource.tags.map(t => (
            <span key={t} style={{ fontSize: 11, color: '#64748b' }}>#{t}</span>
          ))}
        </div>
      )}

      <button
        className="mode-btn"
        style={{ marginTop: 4, alignSelf: 'flex-start' }}
        onClick={() => onOpen(resource)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
