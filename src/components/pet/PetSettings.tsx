import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

interface Props {
  petSize: string;
  setPetSize: (v: string) => void;
  roaming: boolean;
  setRoaming: (v: boolean) => void;
  petWinVisible: boolean;
  setPetWinVisible: (v: boolean) => void;
  showToast: (msg: string) => void;
}

export default function PetSettings({ petSize, setPetSize, roaming, setRoaming, petWinVisible, setPetWinVisible, showToast }: Props) {
  return (
    <div className="pet-status">
      <div style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚙️ 显示设置
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>精灵尺寸</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'small', label: '小巧', size: 110, icon: '🐣' },
              { key: 'medium', label: '适中', size: 140, icon: '🐱' },
              { key: 'large', label: '大气', size: 170, icon: '🦖' },
            ].map(opt => {
              const active = petSize === opt.key;
              return (
                <button key={opt.key} onClick={() => {
                  setPetSize(opt.key);
                  localStorage.setItem('csp_pet_size', opt.key);
                  emit('pet-settings-changed', {}).catch(() => {});
                  showToast(`精灵尺寸已设为「${opt.label}」`);
                }} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '14px 6px 10px', borderRadius: 12, cursor: 'pointer',
                  border: active ? '2px solid #7c3aed' : '2px solid transparent',
                  background: active ? '#f5f3ff' : '#fff',
                  boxShadow: active ? '0 2px 8px rgba(124,58,237,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all .2s',
                }}>
                  <span style={{ fontSize: 24 }}>{opt.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#7c3aed' : '#334155' }}>{opt.label}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{opt.size}px</span>
                  {active && <span style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>● 当前</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>🌐 桌面漫游</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>精灵在桌面上自由走动</div>
          </div>
          <button onClick={() => {
            const next = !roaming;
            setRoaming(next);
            localStorage.setItem('csp_pet_roaming', String(next));
            emit('pet-settings-changed', {}).catch(() => {});
          }} style={{
            width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: roaming ? '#7c3aed' : '#cbd5e1', position: 'relative', transition: 'background .2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: roaming ? 22 : 2,
              width: 24, height: 24, borderRadius: 12, background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s',
            }} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>🪟 显示精灵</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              关闭则隐藏桌面悬浮窗
            </div>
          </div>
          <button onClick={async () => {
            const result = await invoke('toggle_pet_window').catch(() => 'error');
            if (result === 'hidden') { setPetWinVisible(false); showToast('悬浮窗已隐藏'); }
            else if (result === 'shown') { setPetWinVisible(true); showToast('悬浮窗已显示'); }
            else showToast('操作失败');
          }} style={{
            width: 48, height: 28, borderRadius: 14, border: 'none',
            cursor: 'pointer', background: petWinVisible ? '#7c3aed' : '#cbd5e1',
            position: 'relative', transition: 'background .2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: petWinVisible ? 22 : 2,
              width: 24, height: 24, borderRadius: 12, background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s',
            }} />
          </button>
        </div>

        <div style={{
          fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 14,
          background: '#f1f5f9', borderRadius: 10, padding: '8px 12px',
        }}>
          💡 拖拽桌面精灵可移动位置 · 双击精灵回到原位
        </div>
      </div>
    </div>
  );
}
