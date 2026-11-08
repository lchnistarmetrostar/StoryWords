import type { ContentSource, Story, Word } from "../types/contracts";

export const sourceLabels: Record<ContentSource, string> = {
  demo: "预置内容 · 非实时 AI",
  ai: "真实 AI · 实时生成",
};

function HighlightedText({ text, word, onWordClick }: { text: string; word: string; onWordClick?: () => void }) {
  return text.split(/(\b[a-z]+\b)/gi).map((part, index) =>
    part.toLowerCase() === word.toLowerCase() ? <mark key={index}>{onWordClick
      ? <button type="button" className="word-action" aria-label={`查看 ${word} 的中文释义`} aria-controls="word-meaning" onClick={onWordClick}>{part}</button>
      : part}</mark> : part,
  );
}

export default function StoryReader({ story, word, source, chapter, onWordClick }: {
  story: Story; word: Word; source: ContentSource; chapter: number; onWordClick?: () => void;
}) {
  return (
    <article className="story-paper" aria-labelledby="story-title" key={chapter}>
      <h2 id="story-title" tabIndex={-1} lang="en">
        <HighlightedText text={story.title} word={word.text} onWordClick={onWordClick} />
      </h2>
      <div className="story-meta">
        <span>第 {chapter} 章</span>
        <span className="source-label">{sourceLabels[source]}</span>
      </div>
      <p className="story-text" lang="en"><HighlightedText text={story.text} word={word.text} onWordClick={onWordClick} /></p>
      <p className="reading-note">点击有下划线的 <span lang="en">{word.text}</span> 查看释义。</p>
    </article>
  );
}
