import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ElementGuide } from './ElementGuide';
it('元素帮助说明使用装备新版公式，不继续宣传旧伙伴倍率', () => {
  const html = renderToStaticMarkup(<ElementGuide onClose={() => {}} />);
  expect(html).toContain('武器');
  expect(html).toContain('120%');
  expect(html).toContain('每阶增加5%');
  expect(html).toContain('每阶增加4%');
  expect(html).not.toContain('1.25');
  expect(html).not.toContain('0.85');
});
