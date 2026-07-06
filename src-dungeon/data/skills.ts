export type KnowledgeTag = 'grammar' | 'control-flow' | 'data-structure' | 'algorithm';

export type SkillEffectType = 'damage' | 'damage_dot' | 'shield';

export interface SkillDefinition {
  id: string;
  name: string;
  knowledgeTag: KnowledgeTag;
  knowledgeLabel: string; // 给孩子看的中文名
  multiplier: number;
  cooldown: number; // 回合数，0 表示无冷却
  maxUsesPerBattle: number | null; // null 表示无限制
  energyCost: number; // Phaser 战斗新增：能量消耗
  effectType: SkillEffectType; // Phaser 战斗新增：效果类型
  description: string;
}

export const SKILLS: SkillDefinition[] = [
  {
    id: 'skill-1',
    name: '语法射线',
    knowledgeTag: 'grammar',
    knowledgeLabel: '语法基础',
    multiplier: 1.0,
    cooldown: 0,
    maxUsesPerBattle: null,
    energyCost: 0,
    effectType: 'damage',
    description: '语法基础题驱动的普通攻击，不消耗能量',
  },
  {
    id: 'skill-2',
    name: '循环火球',
    knowledgeTag: 'control-flow',
    knowledgeLabel: '流程控制',
    multiplier: 1.2,
    cooldown: 1,
    maxUsesPerBattle: null,
    energyCost: 1,
    effectType: 'damage_dot',
    description: '流程控制题驱动的元素攻击，附带灼烧效果',
  },
  {
    id: 'skill-3',
    name: '数组护盾',
    knowledgeTag: 'data-structure',
    knowledgeLabel: '数据结构',
    multiplier: 0,
    cooldown: 2,
    maxUsesPerBattle: null,
    energyCost: 1,
    effectType: 'shield',
    description: '数据结构题驱动的防御技能，获得护盾抵挡下次攻击',
  },
  {
    id: 'skill-4',
    name: '递归爆发',
    knowledgeTag: 'algorithm',
    knowledgeLabel: '算法思维',
    multiplier: 1.8,
    cooldown: 3,
    maxUsesPerBattle: 2,
    energyCost: 3,
    effectType: 'damage',
    description: '算法题驱动的大招，每关限用 2 次',
  },
];

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILLS.find(s => s.id === id);
}
