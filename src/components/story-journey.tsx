import { TARGET_WORDS } from "../data/vocabulary";
import type { Episode } from "../types/contracts";

export function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>;
}

export function ArrowIcon() {
  return <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5" /></svg>;
}

export default function StoryJourney({ learnedIds, currentId, episodes, complete }: {
  learnedIds: string[]; currentId?: string; episodes: Episode[]; complete: boolean;
}) {
  return (
    <section className={`journey-section${complete ? " journey-complete" : ""}`} aria-labelledby="journey-title">
      <div className="journey-heading"><h2 id="journey-title">本轮单词</h2><span>{complete ? "10 个词的测试已完成" : "按顺序学习，答对后继续"}</span></div>
      <div className="route-scroll" role="region" aria-label="本轮十个单词与完成状态">
        <ol className="story-route">
          {TARGET_WORDS.map((word, index) => {
            const done = learnedIds.includes(word.id);
            const current = word.id === currentId;
            return <li key={word.id} className={done ? "route-done" : current ? "route-current" : "route-locked"} aria-current={current ? "step" : undefined}>
              <span className="route-node" aria-hidden="true">{done ? <CheckIcon /> : String(index + 1).padStart(2, "0")}</span>
              <span lang="en" className="route-word">{word.text}</span>
              <span className="route-status">{done ? "已完成" : current ? "当前单词" : "未解锁"}</span>
            </li>;
          })}
        </ol>
      </div>
      {complete && <details className="story-history"><summary>展开已保存的完整故事 · 10 章</summary><div className="completed-chapters">
        {episodes.map((episode, index) => <details key={episode.lessonId}>
          <summary><span className="chapter-index">{String(index + 1).padStart(2, "0")}</span><span lang="en">{episode.title}</span><span className="chapter-revisit">重读</span></summary>
          <p lang="en">{episode.text}</p>
        </details>)}
      </div></details>}
    </section>
  );
}
