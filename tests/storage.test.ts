import assert from "node:assert/strict";
import test from "node:test";
import { TARGET_WORDS } from "../src/data/vocabulary.ts";
import { acceptLesson, createInitialState, STORAGE_KEY, submitAnswer } from "../src/lib/learning.ts";
import { clearProgress, loadProgress, saveProgress } from "../src/lib/storage.ts";
import type { ReadyLesson } from "../src/types/contracts.ts";
import { requestLesson } from "../src/components/lesson-request.ts";
import { storyExample } from "../src/components/word-display.ts";

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>([["unrelated.setting", "keep"]]);
  if (initial !== null) values.set(STORAGE_KEY, initial);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function pendingLesson(): ReadyLesson {
  const { quiz, ...word } = TARGET_WORDS[0];
  return {
    status: "ready", lessonId: "storage-test-1", source: "demo", word, quiz,
    story: { title: "The Old House", text: "Mia sees a lantern in the old house." },
  };
}

test("reading an empty save never creates default progress", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadProgress(storage), { status: "empty" });
  assert.equal(storage.values.has(STORAGE_KEY), false);
});

test("completed progress restores its mode and previous chapter without rewriting storage", () => {
  for (const mode of ["demo", "ai"] as const) {
    const active = acceptLesson(createInitialState(mode), { ...pendingLesson(), source: mode });
    const state = submitAnswer(active, "a").state;
    const raw = JSON.stringify(state);
    const storage = memoryStorage(raw);
    assert.deepEqual(loadProgress(storage), { status: "ready", state });
    assert.equal(storage.values.get(STORAGE_KEY), raw);
  }
});

test("saving and restoring an unanswered lesson keeps the same question and does not unlock a word", () => {
  const storage = memoryStorage();
  const state = acceptLesson(createInitialState(), pendingLesson());
  assert.equal(saveProgress(state, storage), true);
  const result = loadProgress(storage);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") assert.fail("Expected restored progress");
  assert.equal(result.state.currentLesson?.lessonId, "storage-test-1");
  assert.equal(result.state.currentLesson?.quiz.question, "lantern 在故事中是什么意思？");
  assert.deepEqual(result.state.learnedWordIds, []);
  assert.deepEqual(result.state.episodes, []);
});

test("malformed JSON and invalid state remain intact across repeated reads", () => {
  for (const raw of ["{broken", "", "null", "{}", JSON.stringify({ ...createInitialState(), learnedWordIds: ["envelope"] })]) {
    const storage = memoryStorage(raw);
    assert.deepEqual(loadProgress(storage), { status: "invalid" });
    assert.deepEqual(loadProgress(storage), { status: "invalid" });
    assert.equal(storage.values.get(STORAGE_KEY), raw);
  }
});

test("read permission failures are not mistaken for an empty save", () => {
  assert.deepEqual(loadProgress({ getItem() { throw new Error("denied"); } }), { status: "unavailable" });
});

test("blocked browser storage getters are caught before any read, save or reset", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", { configurable: true,
    value: { get localStorage() { throw new Error("SecurityError"); } },
  });
  assert.deepEqual(loadProgress(), { status: "unavailable" });
  assert.equal(saveProgress(createInitialState()), false);
  assert.equal(clearProgress(), false);
});

test("quota or permission errors report unsaved progress and retain the previous save", () => {
  const state = createInitialState("ai");
  const storage = memoryStorage(JSON.stringify(state));
  const previous = storage.values.get(STORAGE_KEY);
  assert.equal(saveProgress(createInitialState(), { ...storage,
    setItem() { throw new Error("quota exceeded"); },
  }), false);
  assert.equal(storage.values.get(STORAGE_KEY), previous);
  assert.deepEqual(state, createInitialState("ai"));
});

test("invalid outgoing progress cannot overwrite an existing save", () => {
  const storage = memoryStorage(JSON.stringify(createInitialState("ai")));
  const previous = storage.values.get(STORAGE_KEY);
  assert.equal(saveProgress({ ...createInitialState(), learnedWordIds: ["envelope"] }, storage), false);
  assert.equal(storage.values.get(STORAGE_KEY), previous);
});

test("an explicit reset removes only StoryWords progress", () => {
  const storage = memoryStorage("{broken");
  assert.equal(clearProgress(storage), true);
  assert.equal(storage.values.has(STORAGE_KEY), false);
  assert.equal(storage.values.get("unrelated.setting"), "keep");
});

test("a failed reset reports failure so the UI can keep the current state", () => {
  assert.equal(clearProgress({ removeItem() { throw new Error("denied"); } }), false);
});

test("lesson requests use the shared contract and return a restorable pending lesson", async (t) => {
  const state = createInitialState();
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/lesson");
    assert.equal(options.method, "POST");
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(String(options.body)), {
      profile: { level: "A2", genre: "mystery" }, mode: "demo", learnedWordIds: [], previousEpisode: null,
    });
    return Response.json(pendingLesson());
  });
  const next = await requestLesson(state, signal);
  assert.equal(next.currentLesson?.lessonId, "storage-test-1");
  assert.deepEqual(state, createInitialState());
  const storage = memoryStorage();
  assert.equal(saveProgress(next, storage), true);
  assert.deepEqual(loadProgress(storage), { status: "ready", state: next });
});

test("the next request carries the completed chapter and current mode", async (t) => {
  const state = submitAnswer(acceptLesson(createInitialState(), pendingLesson()), "a").state;
  const { quiz, ...word } = TARGET_WORDS[1];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.deepEqual(body.learnedWordIds, ["lantern"]);
    assert.equal(body.previousEpisode.lessonId, "storage-test-1");
    assert.equal(body.previousEpisode.text, "Mia sees a lantern in the old house.");
    return Response.json({ ...pendingLesson(), lessonId: "storage-test-2", word, quiz,
      story: { title: "The House", text: "Mia sees an envelope." } });
  });
  const next = await requestLesson(state, new AbortController().signal);
  assert.equal(next.currentLesson?.word.id, "envelope");
  assert.deepEqual(next.learnedWordIds, ["lantern"]);
});

test("network, non-JSON and API failures retain progress without switching from AI to demo", async (t) => {
  const state = createInitialState("ai");
  const responses = [
    async () => { throw new Error("private network details"); },
    async () => new Response("<html>private upstream body</html>", { status: 502 }),
    async () => Response.json({ error: { code: "AI_NOT_CONFIGURED", message: "private details", retryable: false } }, { status: 503 }),
  ];
  for (const response of responses) {
    const fetchMock = t.mock.method(globalThis, "fetch", response);
    await assert.rejects(requestLesson(state, new AbortController().signal), (error: Error) => {
      assert.doesNotMatch(error.message, /private|<html>/);
      assert.match(error.message, /网络|服务|AI/);
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
    assert.deepEqual(state, createInitialState("ai"));
  }
});

test("wrong-mode or malformed success responses cannot become saved courses", async (t) => {
  for (const raw of [pendingLesson(), { status: "completed" }, { status: "ready" }]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(raw));
    await assert.rejects(requestLesson(createInitialState("ai"), new AbortController().signal));
    fetchMock.mock.restore();
  }
});

test("a cancelled request rejects even if the network returns a late success", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    return Response.json(pendingLesson());
  });
  await assert.rejects(requestLesson(createInitialState(), controller.signal), { name: "AbortError" });
});

test("word examples come from the actual story, matching the full target word without inventing text", () => {
  assert.equal(storyExample("They stood outside. A LANTERN stood on a table. Mia held it up.", "lantern"), "A LANTERN stood on a table.");
  assert.equal(storyExample("The shadows moved. A shadow was on the wall!", "shadow"), "A shadow was on the wall!");
  assert.equal(storyExample("Mia held a lantern", "lantern"), "Mia held a lantern");
  assert.equal(storyExample("Mia saw the house.", "lantern"), "");
});
