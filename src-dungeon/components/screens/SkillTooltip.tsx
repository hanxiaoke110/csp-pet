import { SkillDefinition } from '../../data/skills';

interface Props {
  skill: SkillDefinition;
  cooldownRemaining: number;
  usesLeft: number | null;
}

export function SkillTooltip({ skill, cooldownRemaining, usesLeft }: Props) {
  return (
    <div className="skill-tooltip">
      <strong>{skill.name}</strong>
      <p>{skill.description}</p>
      <p>知识点：{skill.knowledgeLabel}</p>
      <p>伤害倍率：{skill.multiplier}×</p>
      {skill.cooldown > 0 && <p>冷却：{skill.cooldown} 回合</p>}
      {usesLeft !== null && <p>本关剩余：{usesLeft} 次</p>}
      {cooldownRemaining > 0 && <p className="cooldown">冷却中：还剩 {cooldownRemaining} 回合</p>}
    </div>
  );
}
