// 学习资料索引条目类型（与 public/course-data/learning-resources.json 对齐）

export type ResourceType = 'lecture' | 'fable' | 'practice' | 'review' | 'knowledge_card';

// ready：内容已完成，按钮显示“打开”
// coming_soon：飞书文档已预置但内容未完成，按钮显示“制作中”（仍可点击打开占位链接）
// hidden：不展示
export type ResourceStatus = 'ready' | 'coming_soon' | 'hidden';

export interface LearningResource {
  id: string;
  lessonNo?: number;        // 课程序号 P1-P71（非课程类资源可省略）
  title: string;
  stage: string;            // C1 入门阶段 / C2 基础阶段 / C3 进阶阶段 / 综合 ...
  type: ResourceType;
  level: string;            // CSP-J / CSP-S ...
  status: ResourceStatus;
  requiresClassCode: boolean;
  tags?: string[];
  url: string;
  thumbnailUrl?: string;    // 缩略图外链，空则显示占位（不破图）
  updatedAt?: string;       // 资源更新时间 YYYY-MM-DD
  description?: string;     // 卡片说明
  enabled?: boolean;        // 兼容旧字段：false 等同 hidden（status 优先）
}

export interface LearningResourcesData {
  version?: number;
  updated?: string;
  resources: LearningResource[];
}
