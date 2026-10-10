import { CheckCircle2, Sprout, StepForward } from 'lucide-react';
import type { FocusOutcome, FocusSession } from '../../types/focus';
import { deriveFocusTiming, recommendedBreakSeconds } from '../../utils/focusTimer';

interface Props {
  session: FocusSession;
  onSave: (outcome: FocusOutcome) => void;
  onDiscard: () => void;
}

export default function FocusReview({ session, onSave, onDiscard }: Props) {
  const finishedAt = session.finishedAt ? Date.parse(session.finishedAt) : Date.now();
  const focusedMinutes = Math.max(0, Math.floor(deriveFocusTiming(session, finishedAt).elapsedSeconds / 60));
  const breakMinutes = recommendedBreakSeconds(session.plannedSeconds) / 60;
  return (
    <section className="focus-card focus-review">
      <div className="focus-review-sun">☀️</div>
      <h2>这一段结束啦</h2>
      <p>“{session.goal}”专注了 {focusedMinutes} 分钟</p>
      <h3>刚才的目标完成得怎么样？</h3>
      <div className="focus-review-options">
        <button type="button" onClick={() => onSave('completed')}><CheckCircle2 /><b>完成了</b><span>把这次记下来</span></button>
        <button type="button" onClick={() => onSave('partial')}><Sprout /><b>完成一部分</b><span>已经向前走了一步</span></button>
        <button type="button" onClick={() => onSave('continue')}><StepForward /><b>下次继续</b><span>保留进度再接着来</span></button>
      </div>
      <p className="focus-break-copy">建议起身看看远处，休息 {breakMinutes} 分钟；也可以直接跳过。</p>
      <button type="button" className="focus-text-button" onClick={onDiscard}>不保存这次记录</button>
      <small>这里没有“失败”，选择只用于你自己的本地记录</small>
    </section>
  );
}
