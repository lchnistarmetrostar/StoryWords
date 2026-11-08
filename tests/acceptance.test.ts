import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { POST } from "../src/app/api/lesson/route.ts";
import { requestLesson } from "../src/components/lesson-request.ts";
import { DEMO_LESSONS } from "../src/data/demo-lessons.ts";
import { TARGET_WORDS } from "../src/data/vocabulary.ts";
import { buildLessonRequest, createInitialState, STORAGE_KEY, submitAnswer } from "../src/lib/learning.ts";
import { clearProgress, loadProgress, saveProgress } from "../src/lib/storage.ts";
import { DAILY_PLAN_STORAGE_KEY, getDailySummary, recordDailyCompletion, setDailyTarget } from "../src/lib/daily-plan.ts";
import { loadDailyProgress, saveDailyProgress } from "../src/lib/daily-plan-storage.ts";
import type { ByokConfig } from "../src/types/contracts.ts";

const ORIGIN = "http://127.0.0.1:3004";
const OWNER_SENTINEL = "test-only-owner-never-use";

beforeEach(() => {
  // Node isolates test files; overwrite only this child process with fake configuration, never read .env.
  Object.assign(process.env, {
    STORYWORDS_BYOK_ONLY: "1", STORYWORDS_LOCAL_AI_DEMO: "0", STORYWORDS_ALLOWED_ORIGINS: ORIGIN,
    AI_BASE_URL: "https://owner.example.invalid/v1", AI_MODEL: "owner-must-not-run", AI_API_KEY: OWNER_SENTINEL,
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function restore(storage: ReturnType<typeof memoryStorage>) {
  const loaded = loadProgress(storage);
  assert.ok(loaded.status === "ready", "Expected a valid saved learning state");
  return loaded.state;
}

// The transport bridge calls the real handler in memory; it does not exercise Next.js HTTP or the DOM.
test("acceptance: real demo route and client survive storage restoration at every chapter", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    assert.equal(url, "/api/lesson", "No external network is allowed");
    const response = await POST(new Request("http://127.0.0.1/api/lesson", options));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response;
  });
  const storage = memoryStorage();
  const signal = new AbortController().signal;
  let state = createInitialState("demo");
  const today = new Date(2026, 10, 8, 23, 59);
  let plan = setDailyTarget(loadDailyProgress([], storage, today).plan, 1, [], today);
  for (const [index, word] of TARGET_WORDS.entries()) {
    state = await requestLesson(state, signal);
    assert.equal(saveProgress(state, storage), true);
    assert.deepEqual(restore(storage), state);
    state = restore(storage);
    const lesson = state.currentLesson;
    assert.ok(lesson);
    assert.equal(lesson.word.id, word.id);
    assert.equal(lesson.source, "demo");
    assert.equal(state.episodes.length, index);
    const wrong = lesson.quiz.options.find(option => option.id !== lesson.quiz.correctOptionId);
    assert.ok(wrong);
    const incorrect = submitAnswer(state, wrong.id);
    assert.equal(incorrect.status, "incorrect");
    assert.deepEqual(recordDailyCompletion(plan, state, incorrect, today), plan);
    assert.equal(saveProgress(incorrect.state, storage), true);
    assert.deepEqual(restore(storage), state);
    const correct = submitAnswer(restore(storage), lesson.quiz.correctOptionId);
    assert.equal(correct.status, "correct");
    plan = recordDailyCompletion(plan, state, correct, today);
    assert.equal(saveProgress(correct.state, storage), true);
    state = restore(storage);
    assert.equal(saveDailyProgress(plan, state.learnedWordIds, storage, today), true);
    plan = loadDailyProgress(state.learnedWordIds, storage, today).plan;
    const daily = getDailySummary(plan, state.learnedWordIds, today);
    assert.equal(daily.completedToday, index + 1);
    assert.equal(daily.target, 1);
    assert.equal(daily.goalReached, true, "Meeting a daily goal must not prevent continuing the course");
    assert.deepEqual(state.learnedWordIds, TARGET_WORDS.slice(0, index + 1).map(entry => entry.id));
    assert.deepEqual(state.episodes.at(-1), {
      lessonId: lesson.lessonId, wordId: word.id, source: "demo", ...lesson.story,
    });
    assert.equal(state.currentLesson, null);
    assert.deepEqual(submitAnswer(state, lesson.quiz.correctOptionId).state, state);
  }
  const saved = storage.getItem(STORAGE_KEY);
  assert.deepEqual(await requestLesson(restore(storage), signal), state);
  assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.equal(new Set(state.episodes.map(episode => episode.lessonId)).size, 10);
  assert.equal(calls.mock.callCount(), 11, "Ten lessons and one completed response");
  const savedDaily = storage.getItem(DAILY_PLAN_STORAGE_KEY);
  assert.equal(clearProgress(storage), true);
  assert.equal(loadProgress(storage).status, "empty");
  assert.equal(storage.getItem(DAILY_PLAN_STORAGE_KEY), savedDaily);
  const tomorrow = new Date(2026, 10, 9, 0, 1);
  plan = loadDailyProgress([], storage, tomorrow).plan;
  assert.equal(getDailySummary(plan, [], tomorrow).completedToday, 0);
  assert.equal(getDailySummary(plan, [], tomorrow).availableNewWords, 0);
  assert.equal(getDailySummary(plan, [], tomorrow).target, 0);
  const replay = await requestLesson(createInitialState("demo"), signal);
  assert.ok(replay.currentLesson);
  const repeated = submitAnswer(replay, replay.currentLesson.quiz.correctOptionId);
  plan = recordDailyCompletion(plan, replay, repeated, tomorrow);
  assert.deepEqual(plan.completedWordIds, [], "Resetting and replaying a seen word must not create a new daily completion");
  assert.equal(saveDailyProgress(plan, repeated.state.learnedWordIds, storage, tomorrow), true);
  assert.deepEqual(loadDailyProgress(repeated.state.learnedWordIds, storage, tomorrow).plan, plan);
});

test("acceptance: actual route rejection preserves saved history and retry resumes the next word", async (t) => {
  let corruptNextRequest = false;
  const calls = t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    assert.equal(url, "/api/lesson", "No external network is allowed");
    const response = await POST(new Request("http://127.0.0.1/api/lesson", {
      ...options, body: corruptNextRequest ? "{broken" : options?.body,
    }));
    assert.equal(response.status, corruptNextRequest ? 400 : 200);
    return response;
  });
  const storage = memoryStorage();
  const signal = new AbortController().signal;
  const active = await requestLesson(createInitialState("demo"), signal);
  assert.ok(active.currentLesson);
  const state = submitAnswer(active, active.currentLesson.quiz.correctOptionId).state;
  assert.equal(saveProgress(state, storage), true);
  const saved = storage.getItem(STORAGE_KEY);
  corruptNextRequest = true;
  await assert.rejects(requestLesson(restore(storage), signal), /当前进度暂时无法请求故事/);
  assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.deepEqual(restore(storage), state);
  corruptNextRequest = false;
  const next = await requestLesson(restore(storage), signal);
  assert.equal(next.currentLesson?.word.id, "envelope");
  assert.deepEqual(next.episodes, state.episodes);
  assert.deepEqual(next.learnedWordIds, ["lantern"]);
  assert.equal(saveProgress(next, storage), true);
  assert.deepEqual(restore(storage), next);
  assert.equal(calls.mock.callCount(), 3);
});

test("acceptance: BYOK-only rejects missing personal keys even with owner env and completed progress", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => { assert.fail("Owner or external network must never be used"); });
  const initial = buildLessonRequest(createInitialState("ai"));
  const completed = {
    ...initial, learnedWordIds: TARGET_WORDS.map(word => word.id),
    previousEpisode: { ...DEMO_LESSONS[9], lessonId: "test-completed-ai", wordId: "treasure", source: "ai" },
  };
  for (const body of [initial, completed]) {
    const response = await POST(new Request(`${ORIGIN}/api/lesson`, {
      method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, host: "127.0.0.1:3004" },
      body: JSON.stringify(body),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "AI_NOT_CONFIGURED");
    assert.equal(response.headers.has("www-authenticate"), false);
  }
  const demo = await POST(new Request(`${ORIGIN}/api/lesson`, {
    method: "POST", body: JSON.stringify(buildLessonRequest(createInitialState("demo"))),
  }));
  assert.equal(demo.status, 200);
  assert.equal((await demo.json()).source, "demo");
  assert.equal(upstream.mock.callCount(), 0);
});

test("acceptance: two BYOK clients and an output retry retain their own official target and credential", { timeout: 5000 }, async (t) => {
  const userA: ByokConfig = { provider: "openai", model: "test-openai-model", apiKey: "test-only-user-a-key" };
  const userB: ByokConfig = { provider: "deepseek", model: "test-deepseek-model", apiKey: "test-only-user-b-key" };
  const titleA = "Mia's House";
  const titleB = "The Old House";
  let releaseA = () => {};
  const waitingForB = new Promise<void>(resolve => { releaseA = resolve; });
  t.after(releaseA);
  let attemptsA = 0;
  let attemptsB = 0;
  const upstreamOrder: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    if (url === "/api/lesson") {
      const headers = new Headers(options?.headers);
      headers.set("origin", ORIGIN);
      headers.set("host", "127.0.0.1:3004");
      headers.set("sec-fetch-site", "same-origin");
      return POST(new Request(`${ORIGIN}/api/lesson`, { ...options, headers }));
    }
    const target = String(url);
    const isA = target === "https://api.openai.com/v1/chat/completions";
    assert.ok(isA || target === "https://api.deepseek.com/chat/completions", "Only the two fixed official targets are permitted");
    const config = isA ? userA : userB;
    assert.equal(new Headers(options?.headers).get("authorization") === `Bearer ${config.apiKey}`, true, "Credential must belong to this request");
    assert.equal(options?.redirect, "error");
    assert.equal(JSON.parse(String(options?.body)).model, config.model);
    upstreamOrder.push(isA ? "A" : "B");
    if (isA && ++attemptsA === 1) {
      await waitingForB;
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{bad" } }] });
    }
    if (!isA) attemptsB++;
    return Response.json({ choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify({ ...DEMO_LESSONS[0], title: isA ? titleA : titleB }),
    } }] });
  });
  const signal = new AbortController().signal;
  const pendingA = requestLesson(createInitialState("ai"), signal, userA);
  // Keep a rejection handler attached while B completes to avoid an unhandled promise on a regression.
  void pendingA.catch(() => {});
  const stateB = await requestLesson(createInitialState("ai"), signal, userB);
  releaseA();
  const stateA = await pendingA;
  assert.equal(stateA.currentLesson?.story.title, titleA);
  assert.equal(stateB.currentLesson?.story.title, titleB);
  assert.equal(attemptsA, 2);
  assert.equal(attemptsB, 1);
  assert.deepEqual(upstreamOrder, ["A", "B", "A"]);
  for (const state of [stateA, stateB]) {
    assert.equal(state.mode, "ai");
    assert.equal(state.currentLesson?.source, "ai");
    const storage = memoryStorage();
    assert.equal(saveProgress(state, storage), true);
    const saved = storage.getItem(STORAGE_KEY)!;
    for (const sentinel of [userA.apiKey, userB.apiKey, OWNER_SENTINEL]) assert.equal(saved.includes(sentinel), false);
    const restored = restore(storage);
    assert.ok(restored.currentLesson);
    const completed = submitAnswer(restored, restored.currentLesson.quiz.correctOptionId).state;
    assert.equal(saveProgress(completed, storage), true);
    const completedSave = storage.getItem(STORAGE_KEY);
    await assert.rejects(requestLesson(restore(storage), signal), /个人 API/);
    assert.equal(storage.getItem(STORAGE_KEY), completedSave);
  }
  assert.deepEqual(upstreamOrder, ["A", "B", "A"], "Missing keys after restoration must not start another upstream call");
});
