import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/lesson/route.ts";
import { requestLesson } from "../src/components/lesson-request.ts";
import { TARGET_WORDS } from "../src/data/vocabulary.ts";
import { createInitialState, STORAGE_KEY, submitAnswer } from "../src/lib/learning.ts";
import { loadProgress, saveProgress } from "../src/lib/storage.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
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
    assert.equal(saveProgress(incorrect.state, storage), true);
    assert.deepEqual(restore(storage), state);
    const correct = submitAnswer(restore(storage), lesson.quiz.correctOptionId);
    assert.equal(correct.status, "correct");
    assert.equal(saveProgress(correct.state, storage), true);
    state = restore(storage);
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
