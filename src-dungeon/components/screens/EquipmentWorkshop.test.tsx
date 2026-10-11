import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EquipmentWorkshop from './EquipmentWorkshop';

describe('装备工坊界面', () => {
  it('无需悬停即可浏览35件购买装备，包含五属性筛选与常驻详情栏', () => {
    const html = renderToStaticMarkup(<EquipmentWorkshop />);
    expect(html).toContain('装备商店');
    expect(html).toContain('我的装备 · 强化');
    expect(html).toContain('装备详情');
    expect(html).toContain('地晶石');
    expect(html).toContain('不灭·金乌圣衣');
    expect(html).toContain('950');
    expect(html.match(/class="equipment-tile /g)).toHaveLength(35);
  });
});
