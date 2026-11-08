"use client";

import { useEffect, useState } from "react";

export default function DailyGoalPanel({ target, completed, remaining, maxTarget, date, onTarget }: {
  target: number; completed: number; remaining: number; maxTarget: number; date: string;
  onTarget: (target: number) => string | null;
}) {
  const [draft, setDraft] = useState(String(target));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(String(target)); setError(null); }, [target, date]);
  return <section className="daily-goal-panel" aria-labelledby="daily-title">
    <div className="daily-status"><h2 id="daily-title">今天学几个词</h2><p>今日完成 <strong>{completed} / {target}</strong><span> · {date}</span></p></div>
    <form onSubmit={(event) => { event.preventDefault(); setError(onTarget(Number(draft))); }}>
      <fieldset className="goal-options"><legend>选择今日目标</legend>{[3, 5, 10].map((count) => <label key={count}><input type="radio" name="daily-target" value={count} checked={draft === String(count)} disabled={count > maxTarget} onChange={() => { setDraft(String(count)); setError(onTarget(count)); }} />{count} 个</label>)}</fieldset>
      <div className="goal-actions"><label>自定义数量<input type="number" name="custom-target" min={1} max={Math.max(1, maxTarget)} step={1} required value={draft} disabled={maxTarget === 0} onChange={(event) => setDraft(event.currentTarget.value)} aria-describedby="goal-help" /></label><button type="submit" className="secondary" disabled={maxTarget === 0}>设置目标</button></div>
    </form>
    <p id="goal-help">本轮还剩 {remaining} 个词；今日最多可完成 {maxTarget} 个。回顾练习不计入今日完成。</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
