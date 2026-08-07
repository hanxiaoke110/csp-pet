import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { availableMonitors } from '@tauri-apps/api/window';
import { useState, useEffect } from 'react';
import { usePetStore } from '../../stores/petStore';
import ConfirmModal from './ConfirmModal';
import { sqliteSetFireAndForget } from '../../lib/sqlite-storage';

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
  const coins = usePetStore(s => s.coins);
  const companionSlots = usePetStore(s => s.companionSlots);
  const buyCompanionSlot = usePetStore(s => s.buyCompanionSlot);
  const [slotConfirm, setSlotConfirm] = useState(false);
  // 多于一块屏才显示「换屏」入口：单屏孩子完全无感
  const [monitorCount, setMonitorCount] = useState(1);
  useEffect(() => {
    availableMonitors().then(list => setMonitorCount(list.length)).catch(() => {});
  }, []);
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
                  sqliteSetFireAndForget('csp_pet_size', opt.key);
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>👥 多智子桌面伙伴</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 8 }}>已解锁 {companionSlots}/3 个位置。额外伙伴与主智子同屏显示，可单独拖到任意位置，不参与战斗和奖励。</div>
          {companionSlots < 3 && (
            <div style={{ fontSize: 11, lineHeight: 1.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
              ⚠️ 每只额外智子都会增加电脑资源占用。配置较低或已经出现卡顿时，建议只开启一只桌宠。
            </div>
          )}
          {companionSlots < 3 ? (
            <button onClick={() => setSlotConfirm(true)} disabled={coins < (companionSlots === 1 ? 2500 : 5000)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #8b5cf6', background: '#fff', color: '#6d28d9', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              解锁第 {companionSlots + 1} 位 · 🪙 {companionSlots === 1 ? 2500 : 5000}
            </button>
          ) : <div style={{ color: '#16a34a', fontSize: 12, fontWeight: 700, marginTop: 6 }}>✅ 三个独立桌面位置已全部解锁</div>}
          {slotConfirm && (
            <ConfirmModal
              icon="👥" title="解锁桌面伙伴位置"
              desc={`解锁第 ${companionSlots + 1} 个桌面伙伴位置。\n额外伙伴与主智子同屏显示，可单独拖到任意位置，不参与战斗和奖励。`}
              price={companionSlots === 1 ? 2500 : 5000} coins={coins}
              confirmText="确认解锁"
              onCancel={() => setSlotConfirm(false)}
              onConfirm={() => {
                showToast(buyCompanionSlot(companionSlots) ? `已解锁第 ${companionSlots + 1} 个桌面伙伴位置，可回智子页选择伙伴` : '状态已变化或金币不足，请重新确认');
                setSlotConfirm(false);
              }}
            />
          )}
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
            sqliteSetFireAndForget('csp_pet_roaming', String(next));
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

        {monitorCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>🖥️ 智子在哪块屏幕</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                检测到 {monitorCount} 块屏幕，点击循环切换
              </div>
            </div>
            <button onClick={() => {
              emit('pet-hop-monitor', {}).catch(() => {});
              showToast('智子已搬到下一块屏幕');
            }} style={{
              padding: '6px 12px', borderRadius: 7, border: '1px solid #8b5cf6',
              background: '#fff', color: '#6d28d9', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}>
              换到下一块 →
            </button>
          </div>
        )}

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
