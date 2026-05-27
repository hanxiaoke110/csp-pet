import { useState, useEffect } from 'react';

type CeremonyType = 'summon' | 'hatch' | 'evolve';

interface Props {
  type: CeremonyType;
  petName: string;
  petElement: string;  // earth/fire/wind/water
  petIcon: string;     // emoji for display
  oldName?: string;    // pre-evolution name (for evolve)
  newName?: string;    // post-evolution name (for evolve)
  onComplete: (finalName?: string) => void;
}

const ELEMENT_PARTICLES: Record<string, { color: string; symbol: string }> = {
  earth: { color: '#a16207', symbol: '◆' },
  fire: { color: '#dc2626', symbol: '✦' },
  wind: { color: '#16a34a', symbol: '🍃' },
  water: { color: '#2563eb', symbol: '💧' },
};

const steps: Record<CeremonyType, string[]> = {
  summon: ['正在召唤...', '建立契约...', '契约达成！'],
  hatch: ['蛋在晃动...', '裂开了...', '孵化成功！'],
  evolve: ['积蓄能量...', '形态变换...', '进化完成！'],
};

const STEP_DURATION = 1500;

export default function CeremonyModal({ type, petName, petElement, petIcon, oldName, newName, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [showPet, setShowPet] = useState(false);
  const [particles, setParticles] = useState<{ x: number; y: number; delay: number }[]>([]);
  const particles_config = ELEMENT_PARTICLES[petElement] || ELEMENT_PARTICLES.fire;

  useEffect(() => {
    // Generate particles
    const ps = Array.from({ length: 30 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 1.5,
    }));
    setParticles(ps);

    // Step progression
    const t1 = setTimeout(() => setStep(1), STEP_DURATION);
    const t2 = setTimeout(() => { setStep(2); setShowPet(true); }, STEP_DURATION * 2);
    const t3 = setTimeout(() => onComplete(petName), STEP_DURATION * 3 + 500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="ceremony-overlay">
      <div className="ceremony-modal">
        {/* Background effects */}
        <div className="ceremony-bg" />

        {/* Magic circle (summon) */}
        {type === 'summon' && (
          <div className={`magic-circle ${step >= 1 ? 'active' : ''}`}>
            <div className="circle-ring ring-1" />
            <div className="circle-ring ring-2" />
            <div className="circle-ring ring-3" />
          </div>
        )}

        {/* Egg (hatch) */}
        {type === 'hatch' && (
          <div className={`ceremony-egg ${step >= 0 ? 'shake' : ''} ${step >= 2 ? 'cracked' : ''}`}>
            <div className="egg-body">
              <div className="egg-crack" />
            </div>
          </div>
        )}

        {/* Evolution light */}
        {type === 'evolve' && (
          <div className={`evolve-light ${step >= 1 ? 'active' : ''}`}>
            <div className="light-pillar" />
          </div>
        )}

        {/* Pet display */}
        <div className={`ceremony-pet ${showPet ? 'revealed' : ''}`}>
          <div className="ceremony-pet-icon">{petIcon}</div>
          {type === 'evolve' && oldName && newName && (
            <div className="evolve-names">
              <span className="old-name">{oldName}</span>
              <span className="evolve-arrow">→</span>
              <span className="new-name">{newName}</span>
            </div>
          )}
          <div className="ceremony-pet-name">{petName}</div>
        </div>

        {/* Particles */}
        {particles.map((p, i) => (
          <div
            key={i}
            className="ceremony-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animationDelay: `${p.delay}s`,
              color: particles_config.color,
            }}
          >
            {particles_config.symbol}
          </div>
        ))}

        {/* Step text */}
        <div className="ceremony-step">
          <div className="step-dots">
            {steps[type].map((_s, i) => (
              <span key={i} className={`step-dot ${i <= step ? 'active' : ''}`} />
            ))}
          </div>
          <p className="step-text">{steps[type][step]}</p>
        </div>
      </div>
    </div>
  );
}
