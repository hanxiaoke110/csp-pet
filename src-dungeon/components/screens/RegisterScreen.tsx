import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDungeonStore } from '../../stores/dungeonStore';
import { registerPlayer, getStoredHash, getStoredClassCode } from '../../utils/api';
import { initWebPet, WEB_STARTER_OPTIONS } from '../../utils/webPet';
import { ELEMENT_EMOJI } from '../../../src/types/pet';
import schoolsData from '../../data/schools.json';
import type { School, SchoolDefinition } from '../../types/dungeon';

const schools = schoolsData as SchoolDefinition[];

type Step = 'class' | 'school' | 'pet';

export default function RegisterScreen() {
  const navigate = useNavigate();
  const store = useDungeonStore();

  const [step, setStep] = useState<Step>('class');
  const [classCode, setClassCode] = useState(getStoredClassCode());
  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School>('cultivation');
  const [selectedPetSpecies, setSelectedPetSpecies] = useState<string>('capi');
  const [validating, setValidating] = useState(false);
  const [classInfo, setClassInfo] = useState<{ label: string; teacherName: string } | null>(null);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);

  // Validate class code
  const validateClassCode = async () => {
    if (!classCode.trim()) { setError('请输入班级码'); return; }
    setValidating(true); setError('');
    try {
      const resp = await fetch(`https://api.cspstudy.top/api/classes/validate?code=${encodeURIComponent(classCode.trim())}`);
      const data = await resp.json();
      if (resp.ok && data.class_code) {
        setClassInfo({ label: data.label || data.class_code, teacherName: data.teacher_name || '老师' });
        localStorage.setItem('csp_class_code', classCode.trim());
      } else {
        setError(data.error || '班级码无效');
      }
    } catch {
      setError('验证失败，请检查网络');
    }
    setValidating(false);
  };

  // Go to school selection step
  const goToSchoolStep = () => {
    if (!displayName.trim() || displayName.trim().length < 2 || displayName.trim().length > 8) {
      setError('昵称需2-8字'); return;
    }
    if (!realName.trim()) { setError('请输入真实姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { setError('手机号格式不正确（1开头11位）'); return; }
    setError('');
    setStep('school');
  };

  // Final registration
  const handleRegister = async () => {
    setRegistering(true); setError('');
    try {
      const dh = getStoredHash();
      const resp = await registerPlayer(
        classCode.trim(), displayName.trim(), realName.trim(), phone.trim(), selectedSchool
      );
      if (resp.success) {
        localStorage.setItem('csp_class_code', classCode.trim());
        // Web 端赠送战斗伙伴（localStorage 存储，零后端写入）
        initWebPet(selectedPetSpecies);
        store.initPlayer(resp.player);
        store.saveToLocalStorage();
        // Sync to server (fire and forget)
        import('../../utils/api').then(({ syncProgress }) => {
          syncProgress({
            player_level: resp.player.playerLevel || 1, exp: 0, gold: 0,
            rank_tier: 1, rank_points: 0,
            total_answered: 0, total_correct: 0,
            current_streak: 0, max_streak: 0,
            login_streak: 0, school: selectedSchool,
            dungeon_progress: [],
            badges: [],
          }).catch(() => {});
        });
        store.setView('map');
        navigate('/map');
      } else {
        setError(resp.error || '注册失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败');
    }
    setRegistering(false);
  };

  // ── Step 1: Class code + personal info ──
  if (step === 'class') {
    return (
      <div style={{
        minHeight: '100vh', background: 'linear-gradient(180deg, #0a0015, #1a0a2e, #0a0a0a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}>
        <div className="pixel-card" style={{ maxWidth: '420px', width: '100%' }}>
          <h2 style={{
            fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
            textAlign: 'center', marginBottom: '20px',
          }}>
            🏯 加入潜龙秘境
          </h2>

          {/* Class code */}
          <div style={{ marginBottom: '16px' }}>
            <label className="status-label" style={{ display: 'block', marginBottom: '6px' }}>班级码</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="pixel-input"
                value={classCode}
                onChange={e => { setClassCode(e.target.value); setClassInfo(null); }}
                placeholder="输入老师给的班级码"
                style={{ flex: 1 }}
                disabled={!!classInfo}
              />
              <button
                className="pixel-btn"
                onClick={validateClassCode}
                disabled={validating || !!classInfo}
                style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '8px 12px' }}
              >
                {validating ? '验证中...' : classInfo ? '✅ 已验证' : '🔍 验证'}
              </button>
            </div>
            {classInfo && (
              <div style={{
                marginTop: '8px', padding: '8px 12px', background: 'rgba(0,255,65,0.1)',
                border: '2px solid var(--hp-green)', fontSize: '12px', color: 'var(--hp-green)',
              }}>
                {classInfo.teacherName} · {classInfo.label}
              </div>
            )}
          </div>

          {/* Only show personal fields after class validation */}
          {classInfo && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label className="status-label" style={{ display: 'block', marginBottom: '4px' }}>昵称（排行榜显示）</label>
                <input className="pixel-input" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="2-8字，如：代码小神龙" maxLength={8} style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="status-label" style={{ display: 'block', marginBottom: '4px' }}>真实姓名</label>
                <input className="pixel-input" value={realName} onChange={e => setRealName(e.target.value)}
                  placeholder="输入真实姓名" style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="status-label" style={{ display: 'block', marginBottom: '4px' }}>手机号</label>
                <input className="pixel-input" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="1开头11位手机号" maxLength={11} style={{ width: '100%' }} />
              </div>
            </>
          )}

          {error && (
            <div style={{ color: 'var(--hp-red)', fontSize: '12px', marginBottom: '12px', padding: '8px', background: 'rgba(255,51,51,0.1)', border: '1px solid var(--hp-red)' }}>
              ⚠️ {error}
            </div>
          )}

          {classInfo && (
            <button className="pixel-btn primary" onClick={goToSchoolStep} style={{ width: '100%', marginTop: '8px' }}>
              下一步：选择修行流派 →
            </button>
          )}

          <p style={{ color: 'var(--text-dim)', fontSize: '10px', textAlign: 'center', marginTop: '16px' }}>
            ⚠️ 班级码、昵称、姓名、手机号缺一不可
          </p>
        </div>

        <style>{`
          .pixel-input {
            padding: 10px 14px;
            background: #111;
            border: 2px solid var(--border-pixel);
            color: var(--text-light);
            font-family: var(--body-font);
            font-size: 14px;
            outline: none;
          }
          .pixel-input:focus {
            border-color: var(--gold);
            box-shadow: 0 0 8px rgba(255,215,0,0.2);
          }
        `}</style>
      </div>
    );
  }

  // ── Step 2: Choose school ──
  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, #0a0015, #1a0a2e, #0a0a0a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ maxWidth: '550px', width: '100%' }}>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
          textAlign: 'center', marginBottom: '20px',
        }}>
          🏯 选择你的修行流派
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {schools.map(school => (
            <div
              key={school.id}
              className={`pixel-card ${selectedSchool === school.id ? '' : ''}`}
              onClick={() => setSelectedSchool(school.id)}
              style={{
                cursor: 'pointer',
                borderColor: selectedSchool === school.id ? school.themeColor : 'var(--border-pixel)',
                borderWidth: selectedSchool === school.id ? '3px' : 'var(--pixel-border)',
                transition: 'all 0.15s',
                background: selectedSchool === school.id
                  ? school.bgGradient
                  : 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '28px' }}>{school.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: school.themeColor }}>
                    {school.name} · {school.subtitle}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.6 }}>
                    {school.description.slice(0, 80)}...
                  </div>
                </div>
                {selectedSchool === school.id && (
                  <span style={{ color: school.themeColor, fontSize: '20px' }}>✅</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ color: 'var(--hp-red)', fontSize: '12px', marginBottom: '12px', padding: '8px', background: 'rgba(255,51,51,0.1)', border: '1px solid var(--hp-red)' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="pixel-btn primary"
          onClick={() => setStep('pet')}
          style={{ width: '100%', fontSize: '16px', padding: '14px' }}
        >
          下一步：选择伙伴 →
        </button>

        <button
          className="pixel-btn"
          onClick={() => setStep('class')}
          style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
        >
          ← 返回修改信息
        </button>

        <p style={{ color: 'var(--text-dim)', fontSize: '10px', textAlign: 'center', marginTop: '16px' }}>
          ⚠️ 选定后每赛季可更换1次 · 不同流派同榜竞技
        </p>
      </div>
    </div>
  );

  // ── Step 3: Choose starter pet ──
  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, #0a0015, #1a0a2e, #0a0a0a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ maxWidth: '550px', width: '100%' }}>
        <h2 style={{
          fontFamily: 'var(--pixel-font)', fontSize: '14px', color: 'var(--gold)',
          textAlign: 'center', marginBottom: '20px',
        }}>
          🐾 选择你的战斗伙伴
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {WEB_STARTER_OPTIONS.map(pet => (
            <div
              key={pet.speciesId}
              onClick={() => setSelectedPetSpecies(pet.speciesId)}
              style={{
                cursor: 'pointer',
                padding: '16px',
                background: selectedPetSpecies === pet.speciesId ? 'rgba(255,215,0,0.12)' : 'var(--bg-card)',
                border: selectedPetSpecies === pet.speciesId ? '3px solid var(--gold)' : '2px solid var(--border-pixel)',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '36px' }}>{ELEMENT_EMOJI[pet.element]}</div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-light)', marginTop: '6px' }}>
                {pet.petName}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                {pet.speciesId === 'capi' ? '地·佛系肉盾' :
                 pet.speciesId === 'boba' ? '水·灵动' :
                 pet.speciesId === 'bubu-2' ? '火·强攻' : '风·迅捷'}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ color: 'var(--hp-red)', fontSize: '12px', marginBottom: '12px', padding: '8px', background: 'rgba(255,51,51,0.1)', border: '1px solid var(--hp-red)' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="pixel-btn primary"
          onClick={handleRegister}
          disabled={registering}
          style={{ width: '100%', fontSize: '16px', padding: '14px' }}
        >
          {registering ? '🏰 正在进入秘境...' : '🏰 进入秘境'}
        </button>

        <button
          className="pixel-btn"
          onClick={() => setStep('school')}
          style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
        >
          ← 返回选择流派
        </button>

        <p style={{ color: 'var(--text-dim)', fontSize: '10px', textAlign: 'center', marginTop: '16px' }}>
          🐾 伙伴会随战斗获得经验升级，等级越高战力越强
        </p>
      </div>
    </div>
  );
}
