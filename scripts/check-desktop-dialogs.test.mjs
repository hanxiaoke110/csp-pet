import { describe, expect, it } from 'vitest';
import { checkDesktopDialogs, findNativeConfirmReferences } from './check-desktop-dialogs.mjs';

describe('desktop native confirmation release gate', () => {
  it('rejects unsupported native confirm throughout both desktop entry points', () => {
    expect(checkDesktopDialogs()).toEqual([]);
  });
  it.each([
    'window.confirm("结束?")',
    'globalThis.confirm("结束?")',
    'self["confirm"]("结束?")',
    'confirm("结束?")',
    'const ask = window.confirm;',
    'import { confirm as ask } from "@tauri-apps/plugin-dialog";',
    'invoke("plugin:dialog|confirm", { message: "结束?" });',
  ])('detects unsafe reference: %s', text => {
    expect(findNativeConfirmReferences(text)).toHaveLength(1);
  });
  it('does not flag comments, strings, application modal callbacks or web-only teacher pages', () => {
    expect(findNativeConfirmReferences('// window.confirm("x")\nconst text = "window.confirm"; const props = { onConfirm() {} }; props.onConfirm();')).toEqual([]);
  });
});
