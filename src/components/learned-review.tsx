"use client";

import { useState } from "react";
import { TARGET_WORDS } from "../data/vocabulary";
import type { Episode, VocabularyEntry } from "../types/contracts";
import { storyExample, WORD_IPA } from "./word-display";
import { PronounceButton, type usePronunciation } from "./word-pronunciation";

type Speech = ReturnType<typeof usePronunciation>;

function ReviewExercise({ word, episode, speech }: { word: VocabularyEntry; episode?: Episode; speech: Speech }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
  const example = episode ? storyExample(episode.text, word.text) : "";
  return <div className="review-exercise">
    <div>
      <h3 className="review-word" lang="en">{word.text}</h3>
      <p className="word-ipa">英 <span lang="en">{WORD_IPA[word.id]}</span></p>
      <PronounceButton word={word.text} speech={speech} />
      <details className="review-meaning"><summary>查看释义与例句</summary><p>{word.meaningZh}</p>{example && <blockquote className="word-example"><span>已学例句</span><p lang="en">{example}</p></blockquote>}</details>
    </div>
    <form className="quiz-form" onSubmit={(event) => {
      event.preventDefault();
      if (answer) setResult(answer === word.quiz.correctOptionId ? "correct" : "incorrect");
    }}>
      <h3>回顾练习</h3>
      <fieldset aria-describedby="review-feedback"><legend>{word.quiz.question}</legend>
        {word.quiz.options.map((option) => <label key={option.id} className={`choice-row quiz-choice${result === "incorrect" && answer === option.id ? " is-incorrect" : ""}`}>
          <input type="radio" name="review-answer" value={option.id} checked={answer === option.id} onChange={() => { setAnswer(option.id); setResult(null); }} required />
          <span className="option-letter" aria-hidden="true">{option.id.toUpperCase()}</span><span>{option.text}</span>
        </label>)}
      </fieldset>
      <p id="review-feedback" role="status" className={result === "incorrect" ? "answer-feedback" : "review-feedback"}>{result === "correct" ? "回答正确。本轮学习进度保持不变。" : result === "incorrect" ? "还没答对，查看释义后再试。本轮学习进度保持不变。" : "只练习，不改变本轮进度。"}</p>
      <button type="submit" className="secondary" disabled={!answer}>核对回顾答案</button>
      {result && <button type="button" className="text-button" onClick={() => { setAnswer(""); setResult(null); }}>再练一次</button>}
    </form>
  </div>;
}

export default function LearnedReview({ learnedIds, episodes, selectedId, onSelect, speech }: {
  learnedIds: string[]; episodes: Episode[]; selectedId: string | null; onSelect: (id: string | null) => void; speech: Speech;
}) {
  const words = TARGET_WORDS.filter((word) => learnedIds.includes(word.id));
  const selected = words.find((word) => word.id === selectedId);
  return <section className="review-section" aria-labelledby="review-title">
    <div className="review-heading"><h2 id="review-title" tabIndex={-1}>已学词回顾</h2><span>{words.length} 个已完成</span></div>
    {!words.length ? <p className="empty-review">完成第一个词的测试后，可以在这里查看释义、例句和回顾练习。</p> : <>
      <p className="review-note">选择一个已学词，查看释义与例句，或再做一次原题。</p>
      <div className="review-word-list" aria-label="选择要回顾的已学词">{words.map((word) => <button type="button" key={word.id} className="secondary" aria-pressed={selected?.id === word.id} aria-controls="review-detail" onClick={() => onSelect(word.id)} lang="en">{word.text}</button>)}</div>
      {selected && <div id="review-detail"><div className="review-close"><button type="button" className="text-button" onClick={() => onSelect(null)}>收起回顾</button></div><ReviewExercise key={selected.id} word={selected} episode={episodes.find((episode) => episode.wordId === selected.id)} speech={speech} /></div>}
    </>}
  </section>;
}
