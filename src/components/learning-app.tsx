"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { TARGET_WORDS } from "../data/vocabulary";
import { createInitialState, getNextWord, submitAnswer } from "../lib/learning";
import { clearProgress, loadProgress, saveProgress } from "../lib/storage";
import type { StoredProgress } from "../lib/storage";
import type { ContentSource, LearningState } from "../types/contracts";
import { requestLesson } from "./lesson-request";
import StoryReader, { sourceLabels } from "./story-reader";
import StoryJourney, { ArrowIcon, CheckIcon } from "./story-journey";
import { storyExample, WORD_IPA } from "./word-display";
import storyCover from "./story-cover.webp";

export default function LearningApp() {
  const [state, setState] = useState<LearningState | null>(null);
  const [loadStatus, setLoadStatus] = useState<StoredProgress["status"] | "loading">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [mode, setMode] = useState<ContentSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [incorrect, setIncorrect] = useState(false);
  const stateRef = useRef<LearningState | null>(null);
  const requestSequence = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const meaningRef = useRef<HTMLDetailsElement | null>(null);

  const restoreProgress = useCallback(() => {
    const stored = loadProgress();
    const restored = stored.status === "ready" ? stored.state : null;
    stateRef.current = restored;
    setState(restored);
    setLoadStatus(stored.status);
    setSaveStatus(restored ? "saved" : "idle");
    setError(null);
  }, []);

  useEffect(() => {
    restoreProgress();
    return () => {
      requestSequence.current += 1;
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [restoreProgress]);

  useEffect(() => {
    if (saveStatus !== "error") return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveStatus]);

  const lesson = state?.currentLesson;
  const completedCount = state?.learnedWordIds.length ?? 0;
  const nextWord = state ? getNextWord(state.learnedWordIds) : null;
  const finished = state !== null && nextWord === null;
  const lastEpisode = state?.episodes.at(-1);
  const displayedStory = lesson?.story ?? lastEpisode;
  const displayedWord = lesson?.word ?? TARGET_WORDS.find((word) => word.id === lastEpisode?.wordId);

  useEffect(() => {
    if (lesson) document.getElementById("story-title")?.focus();
    else if (completedCount) document.getElementById("chapter-result")?.focus();
  }, [lesson?.lessonId, completedCount]);

  function keepProgress(next: LearningState) {
    // Write only after an explicit action or accepted response, never in a mount effect.
    stateRef.current = next;
    setState(next);
    setLoadStatus("ready");
    setSaveStatus(saveProgress(next) ? "saved" : "error");
  }

  function revealMeaning() {
    if (!meaningRef.current) return;
    meaningRef.current.open = true;
    meaningRef.current.querySelector("summary")?.focus();
  }

  async function loadLesson(current: LearningState) {
    if (pendingRequest.current || current.currentLesson || !getNextWord(current.learnedWordIds)) return;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setBusy(true);
    setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const next = await requestLesson(current, controller.signal);
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      keepProgress(next);
      setSelectedOption("");
      setIncorrect(false);
    } catch (failure) {
      if (sequence !== requestSequence.current) return;
      setError(controller.signal.aborted
        ? "等待故事超时，请重试。当前进度已保留。"
        : failure instanceof Error ? failure.message : "故事暂时无法加载，请重试。");
    } finally {
      window.clearTimeout(timeout);
      if (sequence === requestSequence.current) {
        pendingRequest.current = null;
        setBusy(false);
      }
    }
  }

  function startRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadStatus !== "empty" || stateRef.current || !mode) return;
    const initial = createInitialState(mode);
    keepProgress(initial);
    void loadLesson(initial);
  }

  function answerQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = stateRef.current;
    if (!current?.currentLesson || !selectedOption || pendingRequest.current) return;
    try {
      const result = submitAnswer(current, selectedOption);
      if (result.status === "incorrect") {
        setIncorrect(true);
      } else if (result.status === "correct") {
        keepProgress(result.state);
        setIncorrect(false);
        setSelectedOption("");
      }
      setError(null);
    } catch {
      setError("暂时无法核对答案，请重新选择后再试。当前进度已保留。");
    }
  }

  function restartRound() {
    if (!window.confirm("重新开始会清除本浏览器中 StoryWords 的当前学习进度和故事，随后可重新选择模式。确定清除并重新开始吗？")) return;
    if (!clearProgress()) {
      setError("无法清除本地存档，本轮进度保持不变。请允许浏览器存储后再试。");
      return;
    }
    requestSequence.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    stateRef.current = null;
    setState(null);
    setLoadStatus("empty");
    setSaveStatus("idle");
    setMode(null);
    setBusy(false);
    setError(null);
    setIncorrect(false);
    setSelectedOption("");
  }

  return (
    <div className={`app-shell${state ? " is-reading" : ""}${finished ? " is-complete" : ""}`}>
      <a className="skip-link" href="#main-content">跳到学习内容</a>
      <header className="site-header">
        <p className="wordmark" lang="en"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M14 7c-3-3-7-3-11-2v18c4-1 8-1 11 2 3-3 7-3 11-2V5c-4-1-8-1-11 2Zm0 0v18" /></svg>StoryWords<span aria-hidden="true">.</span></p>
        <span className="profile-label">A2 英语 <span aria-hidden="true">/</span> 悬疑故事</span>
      </header>

      <main id="main-content">
        <section className={`book-intro${state ? " compact" : ""}`} aria-label="你的故事书">
          <div className="intro-copy">
            <h1>{finished ? <>十章读完，<br />故事留在心里。</> : state ? "把故事，接着读下去。" : <>每一个新词，<br />都通向<em>下一章。</em></>}</h1>
            <p className="intro-description">{finished ? "从第一盏提灯到最后的宝藏，十个新词已经成为你的故事。" : state ? "Mia 和 Leo 的旅程还在继续。你的书签，就停在这里。" : "跟随 Mia 与 Leo 走进旧屋。读懂线索，记住新词，慢慢揭开藏在故事里的秘密。"}</p>
            <div className="daily-goal"><span className="goal-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg></span><p><strong>{finished ? "本轮旅程已完成" : "今日小目标"}</strong><span>{finished ? "10 个新词 · 10 个章节" : "读一章故事，掌握一个新词。"}</span></p></div>
            {state && displayedStory && <a className="continue-link" href="#story-title">{finished ? "重读最终章" : "继续阅读"}<ArrowIcon /></a>}
            {loadStatus === "empty" && (
              <form className="start-form" aria-label="开始学习" onSubmit={startRound}>
                <fieldset>
                  <legend>选择这一轮的故事来源</legend>
                  <label className="choice-row"><input type="radio" name="mode" value="demo" checked={mode === "demo"} onChange={() => setMode("demo")} required /><span><strong>预置演示</strong><small>预先写好的连续故事<br />无需 AI 配置</small></span></label>
                  <label className="choice-row"><input type="radio" name="mode" value="ai" checked={mode === "ai"} onChange={() => setMode("ai")} required /><span><strong>真实 AI</strong><small>逐章实时生成<br />需要可用的 AI 服务</small></span></label>
                </fieldset>
                <div className="start-actions"><button className="primary" type="submit" disabled={!mode}>开始第一章<ArrowIcon /></button><p className="small-note">本轮来源固定<br />切换需确认清除进度</p></div>
              </form>
            )}
          </div>
          <figure className="book-cover">
            <img src={storyCover.src} width={840} height={1260} alt="午夜旧屋里，一盏暖金色提灯照亮桌上的信封" fetchPriority="high" />
            <figcaption><span lang="en">A STORYWORDS MYSTERY</span><strong lang="en">The Quiet<br /><i>Mystery</i></strong><span>旧屋里的秘密</span></figcaption>
            <span className="cover-volume" aria-hidden="true">VOL. 01</span>
          </figure>
        </section>

        {loadStatus === "loading" && <p className="notice" role="status">正在读取本地学习进度…</p>}

        {loadStatus === "invalid" && (
          <section className="notice warning" aria-labelledby="invalid-save-title">
            <h2 id="invalid-save-title">这份存档暂时无法恢复</h2>
            <p>存档已损坏或格式不受支持。原始内容已保留，没有被覆盖。确认重置后才能开始新一轮。</p>
            <button type="button" className="secondary" onClick={restoreProgress}>重新读取存档</button>
            <button type="button" className="text-button" onClick={restartRound}>确认重置存档并重新开始</button>
          </section>
        )}

        {loadStatus === "unavailable" && (
          <section className="notice warning" aria-labelledby="unavailable-save-title">
            <h2 id="unavailable-save-title">暂时无法访问本地存档</h2>
            <p>请允许此页面使用浏览器存储，再重新读取。为保护可能存在的进度，暂不开始新一轮。</p>
            <button type="button" className="secondary" onClick={restoreProgress}>重新读取存档</button>
          </section>
        )}

        {state && (
          <>
            <section className="progress-section" aria-labelledby="progress-title">
              <div className="progress-heading">
                <h2 id="progress-title">学习进度 <span>已完成 {completedCount}/{TARGET_WORDS.length}</span></h2>
                <span className="source-label">{sourceLabels[state.mode]}</span>
              </div>
              <progress value={completedCount} max={TARGET_WORDS.length} aria-label={`已完成 ${completedCount} 个词，共 ${TARGET_WORDS.length} 个`} />
              <div className="save-row">
                <p role="status">{saveStatus === "saved" ? "已保存到本浏览器，可刷新后继续。" : "本次进度尚未保存。"}</p>
                <button type="button" className="text-button" onClick={restartRound}>重新开始 / 切换模式</button>
              </div>
            </section>
            {saveStatus === "error" && (
              <div className="notice warning" role="alert">
                <p><strong>本次进度尚未保存。</strong>浏览器存储空间不足或访问受限。可以继续学习，但关闭或刷新可能丢失本次进度。</p>
                <button type="button" className="secondary" onClick={() => {
                  if (stateRef.current) setSaveStatus(saveProgress(stateRef.current) ? "saved" : "error");
                }}>重试保存进度</button>
              </div>
            )}
          </>
        )}

        {error && <div className="notice warning" role="alert">{error}</div>}
        <div role="status" aria-live="polite" aria-atomic="true">
          {busy && <p className="loading-message"><span className="loading-dot" aria-hidden="true" />{state?.mode === "ai" ? "AI 正在接续故事，请稍候…" : "正在读取预置故事，请稍候…"}</p>}
        </div>

        {state && (
          <div className="lesson-layout">
            <div className="reading-column">
              {displayedStory && displayedWord ? (
                <StoryReader story={displayedStory} word={displayedWord} source={lesson?.source ?? lastEpisode!.source} chapter={lesson ? completedCount + 1 : completedCount} onWordClick={revealMeaning} />
              ) : (
                <section className="story-placeholder" aria-labelledby="first-chapter-title">
                  <h2 id="first-chapter-title">故事，从这里开始。</h2>
                  <p>第一章准备好后，会显示在这里。先读故事，再完成右侧或下方的单词小测试。</p>
                  <p className="small-note">当前来源：{sourceLabels[state.mode]}</p>
                </section>
              )}
            </div>
            <aside className="practice-column" aria-label="本章单词与练习" aria-busy={busy}>
              {displayedWord && displayedStory && <section className="word-section" aria-labelledby="word-title">
                <div className="word-heading"><h2 id="word-title">{lesson ? "本章新词" : "本章已掌握"}</h2><span>{String(lesson ? completedCount + 1 : completedCount).padStart(2, "0")} / 10</span></div>
                <button type="button" className="target-word word-action" lang="en" aria-label={`查看 ${displayedWord.text} 的中文释义`} aria-controls="word-meaning" onClick={revealMeaning}>{displayedWord.text}</button>
                <p className="word-ipa"><span>英</span> <span lang="en">{WORD_IPA[displayedWord.id]}</span></p>
                <details id="word-meaning" className="word-meaning" key={lesson?.lessonId ?? lastEpisode?.lessonId} ref={meaningRef}>
                  <summary>查看中文释义</summary>
                  <p>{displayedWord.meaningZh}</p>
                </details>
                <blockquote className="word-example"><span>故事中的用法</span><p lang="en">{storyExample(displayedStory.text, displayedWord.text)}</p></blockquote>
              </section>}
              {lesson ? (
                <>
                  <form className="quiz-form" onSubmit={answerQuestion}>
                    <h2>读完，试一题</h2>
                    <fieldset aria-describedby={incorrect ? "answer-feedback" : undefined}>
                      <legend>{lesson.quiz.question}</legend>
                      {lesson.quiz.options.map((option) => (
                        <label key={option.id} className={`choice-row quiz-choice${incorrect && selectedOption === option.id ? " is-incorrect" : ""}`}>
                          <input type="radio" name="answer" value={option.id} checked={selectedOption === option.id} required onChange={() => { setSelectedOption(option.id); setIncorrect(false); }} />
                          <span className="option-letter" aria-hidden="true">{option.id.toUpperCase()}</span><span>{option.text}</span>
                        </label>
                      ))}
                    </fieldset>
                    <div role="status" aria-live="polite" aria-atomic="true">
                      {incorrect && <p id="answer-feedback" className="answer-feedback"><strong>还差一点，再试一次。</strong>还没答对，进度不变。看看故事和释义，再选一次。</p>}
                    </div>
                    <button type="submit" className="primary wide" disabled={!selectedOption || busy}>提交答案</button>
                  </form>
                </>
              ) : (
                <section className={`chapter-result${completedCount ? " answer-success" : ""}`}>
                  {completedCount > 0 && <span className="success-symbol"><CheckIcon /></span>}
                  <h2 id="chapter-result" tabIndex={-1}>{finished ? "这段故事，你读完了。" : completedCount ? "答对了，新词已解锁。" : "准备好开始了吗？"}</h2>
                  <p>{finished
                    ? `你已完成全部 ${TARGET_WORDS.length} 个目标词，也读到了故事结局。完整旅程已收录在下方，每一章都可以重新翻阅。`
                    : completedCount ? `${displayedWord?.text}（${displayedWord?.meaningZh}）已加入熟词。下一章会接续刚才的故事。`
                    : "故事加载后，认识一个新词，再用一道题巩固它。"}</p>
                  {!finished && <button type="button" className="primary wide" disabled={busy} onClick={() => {
                    if (stateRef.current) void loadLesson(stateRef.current);
                  }}>{busy ? "正在准备故事…" : error ? "重试加载故事" : completedCount ? "继续下一章" : "加载第一章"}</button>}
                  {finished && <button type="button" className="secondary wide" onClick={restartRound}>重新开始一轮</button>}
                </section>
              )}
              {completedCount > 0 && (
                <details className="learned-words" open={finished || undefined}>
                  <summary>已学会的 {completedCount} 个词</summary>
                  <dl>{TARGET_WORDS.filter((word) => state.learnedWordIds.includes(word.id)).map((word) => (
                    <div key={word.id}><dt lang="en">{word.text}</dt><dd>{word.meaningZh}</dd></div>
                  ))}</dl>
                </details>
              )}
            </aside>
          </div>
        )}
        {loadStatus !== "loading" && <StoryJourney learnedIds={state?.learnedWordIds ?? []} currentId={nextWord?.id ?? (!state ? TARGET_WORDS[0].id : undefined)} episodes={state?.episodes ?? []} complete={finished} />}
      </main>
      <footer className="site-footer"><span>一次一个新词，慢慢读懂整个故事。</span><span>进度仅存于本浏览器，不跨设备同步。</span></footer>
    </div>
  );
}
