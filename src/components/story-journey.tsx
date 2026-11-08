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
      <div className="journey-heading"><h2 id="journey-title">{complete ? "你走过的每一章" : "十个新词，一段旅程"}</h2><span>{complete ? "故事已完整收藏" : "从一盏灯，走向最后的秘密"}</span></div>
      {!complete && <p className="route-hint">左右滑动，查看全部十章</p>}
      <div className="route-scroll" tabIndex={0} role="region" aria-label="十章故事路线，可横向滚动查看所有章节">
        <ol className="story-route">
          {TARGET_WORDS.map((word, index) => {
            const done = learnedIds.includes(word.id);
            const current = word.id === currentId;
            return <li key={word.id} className={done ? "route-done" : current ? "route-current" : "route-locked"} aria-current={current ? "step" : undefined}>
              <span className="route-node" aria-hidden="true">{done ? <CheckIcon /> : String(index + 1).padStart(2, "0")}</span>
              <span lang="en" className="route-word">{word.text}</span>
              <span className="route-status">{done ? "已完成" : current ? "当前章节" : "未解锁"}</span>
            </li>;
          })}
        </ol>
      </div>
      {complete && <div className="completed-chapters">
        {episodes.map((episode, index) => <details key={episode.lessonId}>
          <summary><span className="chapter-index">{String(index + 1).padStart(2, "0")}</span><span lang="en">{episode.title}</span><span className="chapter-revisit">重读</span></summary>
          <p lang="en">{episode.text}</p>
        </details>)}
      </div>}
    </section>
  );
}
