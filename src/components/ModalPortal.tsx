import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

// 弹窗统一挂到 body：窗口皮肤会给卡片加 backdrop-filter，
// 它会让后代 position:fixed 相对卡片而不是视口定位，导致弹窗被裁掉
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
