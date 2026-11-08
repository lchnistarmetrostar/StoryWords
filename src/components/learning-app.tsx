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
import LearnedReview from "./learned-review";
import { PronounceButton, usePronunciation } from "./word-pronunciation";
import ApiSettings from "./api-settings";
import DailyGoalPanel from "./daily-goal-panel";
import { getDailySummary, normalizeDailyPlan, recordDailyCompletion, setDailyTarget } from "../lib/daily-plan";
import { loadDailyProgress, saveDailyProgress } from "../lib/daily-plan-storage";
import { parseByokConfig } from "../lib/byok";
import type { ByokConfig, DailyPlan } from "../types/contracts";

export default function LearningApp() {
  const [state, setState] = useState<LearningState | null>(null);
  const [loadStatus, setLoadStatus] = useState<StoredProgress["status"] | "loading">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [mode, setMode] = useState<ContentSource>("demo");
  const [reviewWordId, setReviewWordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [incorrect, setIncorrect] = useState(false);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [dailyWarning, setDailyWarning] = useState<string | null>(null);
  const [dailyUnsaved, setDailyUnsaved] = useState(false);
  const [continueExtra, setContinueExtra] = useState(false);
  const [apiConfig, setApiConfig] = useState<Pick<ByokConfig, "provider" | "model"> | null>(null);
  const dailyRef = useRef<DailyPlan | null>(null);
  const credentialsRef = useRef<ByokConfig | null>(null);
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
    const daily = loadDailyProgress(restored?.learnedWordIds ?? []);
    dailyRef.current = daily.plan;
    setDailyPlan(daily.plan);
    setDailyWarning(daily.status === "unavailable" ? "无法读取今日计划，今日统计暂不能可靠保存。" : daily.status === "invalid" ? "今日计划无法读取，原记录未自动覆盖。再次设置目标会保存新计划；旧课程不会计入今日完成。" : null);
    setDailyUnsaved(false);
    setError(null);
  }, []);

  const clearApi = useCallback(() => {
    credentialsRef.current = null;
    setApiConfig(null);
    requestSequence.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setBusy(false);
  }, []);

  useEffect(() => {
    restoreProgress();
    window.addEventListener("pagehide", clearApi);
    return () => {
      window.removeEventListener("pagehide", clearApi);
      clearApi();
    };
  }, [restoreProgress, clearApi]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refreshDay = () => {
      const now = new Date();
      if (dailyRef.current) {
        const normalized = normalizeDailyPlan(dailyRef.current, stateRef.current?.learnedWordIds ?? [], now);
        if (normalized.date !== dailyRef.current.date) setContinueExtra(false);
        dailyRef.current = normalized;
        setDailyPlan(normalized);
      }
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refreshDay, midnight.getTime() - now.getTime() + 25);
    };
    const visible = () => { if (!document.hidden) refreshDay(); };
    refreshDay();
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refreshDay); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => {
    if (saveStatus !== "error" && !dailyUnsaved) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveStatus, dailyUnsaved]);

  const lesson = state?.currentLesson;
  const completedCount = state?.learnedWordIds.length ?? 0;
  const nextWord = state ? getNextWord(state.learnedWordIds) : null;
  const finished = state !== null && nextWord === null;
  const lastEpisode = state?.episodes.at(-1);
  const displayedStory = lesson?.story ?? lastEpisode;
  const displayedWord = lesson?.word ?? TARGET_WORDS.find((word) => word.id === lastEpisode?.wordId);
  const speech = usePronunciation(`${displayedWord?.id ?? ""}:${reviewWordId ?? ""}`);
  const dailySummary = dailyPlan ? getDailySummary(dailyPlan, state?.learnedWordIds ?? []) : null;
  const dailyPaused = !!dailySummary?.goalReached && !continueExtra;

  useEffect(() => {
    if (lesson) document.getElementById("word-title")?.focus();
    else if (completedCount) document.getElementById("chapter-result")?.focus();
  }, [lesson?.lessonId, completedCount]);

  function keepProgress(next: LearningState) {
    // Write only after an explicit action or accepted response, never in a mount effect.
    stateRef.current = next;
    setState(next);
    setLoadStatus("ready");
    setSaveStatus(saveProgress(next) ? "saved" : "error");
  }

  function keepDaily(plan: DailyPlan, learnedIds = stateRef.current?.learnedWordIds ?? []) {
    dailyRef.current = plan;
    setDailyPlan(plan);
    const saved = saveDailyProgress(plan, learnedIds);
    setDailyUnsaved(!saved);
    setDailyWarning(saved ? null : "今日目标和完成记录尚未保存。刷新或关闭后可能丢失，请重试保存。");
    return saved;
  }

  function changeTarget(target: number): string | null {
    if (!dailyRef.current) return "正在读取今日计划，请稍候。";
    try {
      const plan = setDailyTarget(dailyRef.current, target, stateRef.current?.learnedWordIds ?? []);
      keepDaily(plan);
      setContinueExtra(false);
      return null;
    } catch { return "请输入当前可学范围内的整数目标。"; }
  }

  function useApi(form: HTMLFormElement): string | null {
    if (loadStatus !== "empty" && loadStatus !== "ready") return "请先恢复或重置本地存档，再开始 AI 学习。";
    if (pendingRequest.current) return "正在准备内容，请等待完成，或先清除密钥取消请求。";
    const data = new FormData(form);
    try {
      const config = parseByokConfig({ provider: data.get("provider"), model: data.get("model"), apiKey: data.get("apiKey") });
      if (config.model === config.apiKey) return "模型名称和密钥不能相同，请检查输入。";
      if (stateRef.current?.mode === "demo" && !restartRound()) return "未切换到 AI，原学习进度保持不变。";
      clearApi();
      credentialsRef.current = config;
      setApiConfig({ provider: config.provider, model: config.model });
      setMode("ai");
      setError(null);
      const current = stateRef.current ?? createInitialState("ai");
      if (!stateRef.current) {
        if (dailyRef.current) keepDaily(normalizeDailyPlan(dailyRef.current, []), []);
        keepProgress(current);
      }
      if (current.currentLesson) {
        document.getElementById("word-title")?.focus();
      } else if (!getNextWord(current.learnedWordIds)) {
        document.getElementById("review-title")?.scrollIntoView();
      } else if (dailyRef.current && getDailySummary(dailyRef.current, current.learnedWordIds).goalReached && (state?.mode !== "ai" || !continueExtra)) {
        setError("AI 配置已就绪。今日目标已完成，请先点击“继续多学”，再加载下一词。");
      } else {
        void loadLesson(current);
      }
      return null;
    } catch { return "配置无效。请选择官方供应商，检查模型名称和 API Key 格式。"; }
  }

  function openApiSettings() {
    const settings = document.getElementById("api-settings") as HTMLDetailsElement | null;
    if (settings) {
      settings.open = true;
      settings.querySelector<HTMLSelectElement>('select[name="provider"]')?.focus();
    }
  }

  function requireApi() {
    if (credentialsRef.current) return true;
    setError("请先填写自己的 API 配置。已有学习内容和 AI 来源已保留，不会改用预置内容。");
    const settings = document.getElementById("api-settings") as HTMLDetailsElement | null;
    if (settings) { settings.open = true; settings.querySelector<HTMLInputElement>('input[name="apiKey"]')?.focus(); }
    return false;
  }

  function revealMeaning() {
    if (!meaningRef.current) return;
    meaningRef.current.open = true;
    meaningRef.current.querySelector("summary")?.focus();
  }

  async function loadLesson(current: LearningState) {
    if (pendingRequest.current || current.currentLesson || !getNextWord(current.learnedWordIds)) return;
    if (current.mode === "ai" && !requireApi()) return;
    if (dailyRef.current && getDailySummary(dailyRef.current, current.learnedWordIds).goalReached && !continueExtra) return;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setBusy(true);
    setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const next = await requestLesson(current, controller.signal, credentialsRef.current ?? undefined);
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
    if (mode === "ai" && !requireApi()) return;
    if (dailyRef.current) keepDaily(normalizeDailyPlan(dailyRef.current, []), []);
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
      if (dailyRef.current) {
        const normalized = normalizeDailyPlan(dailyRef.current, current.learnedWordIds);
        dailyRef.current = normalized;
        setDailyPlan(normalized);
      }
      if (result.status === "incorrect") {
        setIncorrect(true);
      } else if (result.status === "correct") {
        if (dailyRef.current) keepDaily(recordDailyCompletion(dailyRef.current, current, result), result.state.learnedWordIds);
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
    if (!window.confirm("重新开始会清除本浏览器中 StoryWords 的当前学习进度和故事，随后可重新选择模式。确定清除并重新开始吗？")) return false;
    if (dailyRef.current && !keepDaily(normalizeDailyPlan(dailyRef.current, stateRef.current?.learnedWordIds ?? []))) {
      setError("今日记录尚未保存，为避免重置后丢失计数，请先重试保存。当前课程保持不变。");
      return false;
    }
    if (!clearProgress()) {
      setError("无法清除本地存档，本轮进度保持不变。请允许浏览器存储后再试。");
      return false;
    }
    requestSequence.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    stateRef.current = null;
    setState(null);
    setLoadStatus("empty");
    setSaveStatus("idle");
    setMode("demo");
    setReviewWordId(null);
    setContinueExtra(false);
    setBusy(false);
    setError(null);
    setIncorrect(false);
    setSelectedOption("");
    return true;
  }

  return (
    <div className={`app-shell${state ? " is-reading" : ""}${finished ? " is-complete" : ""}`}>
      <a className="skip-link" href="#main-content">跳到学习内容</a>
      <header className="site-header">
        <p className="wordmark" lang="en">StoryWords<span aria-hidden="true">.</span></p>
        <nav className="header-nav" aria-label="主要导航"><span className="profile-label">A2 · 默认词库</span><a href="#review-title">已学词回顾</a></nav>
      </header>

      <main id="main-content">
        <section className={`learning-intro${state ? " compact" : ""}`} aria-label="本轮词汇学习">
          <div className="intro-copy">
            <h1>{finished ? "本轮学习已完成" : state ? "继续单词学习" : "开始单词学习"}</h1>
            <p className="intro-description">{finished ? "10 个词的测试已完成。随时回顾释义、例句，再练一次。" : state ? "听发音、看例句，完成一道测试，再继续下一个词。" : "A2 默认词库 · 10 个单词。用发音、释义和例句开始学习。"}</p>
            {(loadStatus === "empty" || loadStatus === "ready") && <button type="button" className="secondary" aria-controls="api-settings" onClick={openApiSettings}>用我的 API 生成故事</button>}
            {dailySummary && (loadStatus === "empty" || loadStatus === "ready") && <DailyGoalPanel target={dailySummary.target} completed={dailySummary.completedToday} remaining={TARGET_WORDS.length - completedCount} maxTarget={dailySummary.maxTarget} date={dailySummary.plan.date} onTarget={changeTarget} />}
            {dailyWarning && <div className="notice warning" role="alert"><p>{dailyWarning}</p>{dailyUnsaved && <button type="button" className="secondary" onClick={() => { if (dailyRef.current) keepDaily(dailyRef.current); }}>重试保存今日记录</button>}</div>}
            {state && <div className="intro-links"><a className="continue-link" href={finished ? "#review-title" : lesson ? "#word-title" : "#chapter-result"}>{finished ? "回顾已学词" : "继续学习"}<ArrowIcon /></a></div>}
            {loadStatus === "empty" && (
              <form className="start-form" aria-label="开始学习" onSubmit={startRound}>
                <p className="start-summary">本轮已完成 0/{TARGET_WORDS.length} · {mode === "demo" ? "预置内容，无需 AI 配置" : "真实 AI，需要可用的 AI 服务"}</p>
                <div className="start-actions"><button className="primary" type="submit" disabled={dailyPaused}>{mode === "demo" ? "开始学习" : "使用 AI 开始学习"}<ArrowIcon /></button></div>
                <details className="source-options"><summary>内容来源 · {mode === "demo" ? "预置内容" : "真实 AI"}</summary><fieldset>
                  <legend>本轮来源固定，切换需确认清除进度</legend>
                  <label className="choice-row"><input type="radio" name="mode" value="demo" checked={mode === "demo"} onChange={() => setMode("demo")} required /><span><strong>预置内容</strong><small>可直接完成十词学习，无需 AI 配置</small></span></label>
                  <label className="choice-row"><input type="radio" name="mode" value="ai" checked={mode === "ai"} onChange={() => setMode("ai")} required /><span><strong>真实 AI</strong><small>使用自己的 DeepSeek 或 OpenAI 配置</small></span></label>
                </fieldset></details>
              </form>
            )}
          </div>
        </section>

        <ApiSettings configured={apiConfig} onUse={useApi} onClear={clearApi} busy={busy} actionLabel={state?.mode === "ai" && lesson ? "使用此配置并继续当前课" : state?.mode === "ai" && finished ? "使用此配置并回顾已学词" : "使用此配置并开始 AI 学习"} />
        {state?.mode === "ai" && !apiConfig && <p className="notice">AI 学习内容已保留。续写下一词前，请在“使用自己的 AI”中重新填写密钥。</p>}

        {dailySummary?.goalReached && <section className="goal-complete" aria-labelledby="goal-complete-title"><h2 id="goal-complete-title">今日目标完成</h2><p>今天已完成 {dailySummary.completedToday} 个新词，目标 {dailySummary.target} 个。课程和已学内容均已保留。</p><a href="#review-title">回顾已学词</a>{!finished && dailyPaused && <button type="button" className="secondary" onClick={() => setContinueExtra(true)}>继续多学</button>}</section>}

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
                <h2 id="progress-title">本轮学习 <span>已完成 {completedCount}/{TARGET_WORDS.length}</span></h2>
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
            <div className="practice-column" aria-label="当前单词与练习" aria-busy={busy}>
              {displayedWord && displayedStory && <section className="word-section" aria-labelledby="word-title">
                <div className="word-heading"><h2 id="word-title" tabIndex={-1}>{lesson ? "当前单词" : "本词测试已完成"}</h2><span>{String(lesson ? completedCount + 1 : completedCount).padStart(2, "0")} / 10</span></div>
                <button type="button" className="target-word word-action" lang="en" aria-label={`查看 ${displayedWord.text} 的中文释义`} aria-controls="word-meaning" onClick={revealMeaning}>{displayedWord.text}</button>
                <p className="word-ipa"><span>英</span> <span lang="en">{WORD_IPA[displayedWord.id]}</span></p>
                <PronounceButton word={displayedWord.text} speech={speech} />
                <details id="word-meaning" className="word-meaning" key={lesson?.lessonId ?? lastEpisode?.lessonId} ref={meaningRef}>
                  <summary>查看中文释义</summary>
                  <p>{displayedWord.meaningZh}</p>
                </details>
                <blockquote className="word-example"><span>原文例句</span><p lang="en">{storyExample(displayedStory.text, displayedWord.text)}</p></blockquote>
              </section>}
              {lesson ? (
                <>
                  <form className="quiz-form" onSubmit={answerQuestion}>
                    <h2>单词小测试</h2>
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
                  <h2 id="chapter-result" tabIndex={-1}>{finished ? "本轮 10 个词的测试已完成。" : completedCount ? "答对了，可以继续下一个词。" : "准备好开始了吗？"}</h2>
                  <p>{finished
                    ? "可以在下方回顾已学词、查看例句和重新练习。完整故事仍可展开阅读。"
                    : completedCount ? `${displayedWord?.text} 的本轮测试已完成，可在已学词中回顾。`
                    : "正在准备当前单词、例句与测试。加载后即可开始。"}</p>
                  {!finished && !dailyPaused && <button type="button" className="primary wide" disabled={busy} onClick={() => {
                    if (stateRef.current) void loadLesson(stateRef.current);
                  }}>{busy ? "正在准备内容…" : error ? "重试加载内容" : completedCount ? "学习下一个词" : "加载第一个词"}</button>}
                  {finished && <button type="button" className="secondary wide" onClick={restartRound}>重新开始一轮</button>}
                </section>
              )}
            </div>
            {displayedStory && displayedWord && <details className="story-disclosure" key={lesson?.lessonId ?? lastEpisode?.lessonId}>
              <summary>展开完整故事<span>查看例句上下文</span></summary>
              <StoryReader story={displayedStory} word={displayedWord} source={lesson?.source ?? lastEpisode!.source} chapter={lesson ? completedCount + 1 : completedCount} onWordClick={revealMeaning} />
            </details>}
          </div>
        )}
        {loadStatus !== "loading" && <LearnedReview learnedIds={state?.learnedWordIds ?? []} episodes={state?.episodes ?? []} selectedId={reviewWordId} onSelect={(id) => { speech.stop(); setReviewWordId(id); }} speech={speech} />}
        {loadStatus !== "loading" && <StoryJourney learnedIds={state?.learnedWordIds ?? []} currentId={nextWord?.id ?? (!state ? TARGET_WORDS[0].id : undefined)} episodes={state?.episodes ?? []} complete={finished} />}
      </main>
      <footer className="site-footer"><span>默认词库 · A2 · 每轮 10 个词</span><span>进度仅存于本浏览器，不跨设备同步。</span></footer>
    </div>
  );
}
