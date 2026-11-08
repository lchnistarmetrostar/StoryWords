import assert from "node:assert/strict";
import test from "node:test";
import { BASE_KNOWN_WORDS, TARGET_WORDS } from "../src/data/vocabulary.ts";
import {
  acceptLesson,
  buildLessonRequest,
  checkStoryVocabulary,
  createInitialState,
  getKnownWords,
  getNextWord,
  parseLearningState,
  parseLessonRequest,
  parseLessonResponse,
  submitAnswer,
} from "../src/lib/learning.ts";
import type { ContentSource, ReadyLesson } from "../src/types/contracts.ts";
import { getLocalDateKey, normalizeDailyPlan, setDailyTarget, recordDailyCompletion, getDailySummary } from "../src/lib/daily-plan.ts";
import { parseByokConfig } from "../src/lib/byok.ts";

function lesson(index = 0, source: ContentSource = "demo"): ReadyLesson {
  const entry = TARGET_WORDS[index];
  return {
    status: "ready",
    lessonId: `test-${index}`,
    source,
    word: { id: entry.id, text: entry.text, meaningZh: entry.meaningZh },
    story: { title: "The Old House", text: `Mia and Leo see a ${entry.text} in the old house.` },
    quiz: structuredClone(entry.quiz),
  };
}

test("target words remain new, and each has an unambiguous quiz", () => {
  assert.equal(TARGET_WORDS.length, 10);
  assert.equal(new Set(TARGET_WORDS.map((word) => word.id)).size, 10);
  assert.ok(BASE_KNOWN_WORDS.length >= 200);
  for (const entry of TARGET_WORDS) {
    assert.ok(!BASE_KNOWN_WORDS.includes(entry.text));
    assert.equal(new Set(entry.quiz.options.map((option) => option.id)).size, 3);
    assert.equal(entry.quiz.options.find((option) => option.id === entry.quiz.correctOptionId)?.text, entry.meaningZh);
  }
});

test("new progress is demo by default, with one first word and no invented history", () => {
  const state = createInitialState();
  assert.equal(state.mode, "demo");
  assert.deepEqual(state.profile, { level: "A2", genre: "mystery" });
  assert.equal(getNextWord(state.learnedWordIds)?.id, "lantern");
  assert.equal(buildLessonRequest(state).previousEpisode, null);
  assert.equal(createInitialState("ai").mode, "ai");
});

test("skipped, repeated and unknown word IDs cannot unlock future lessons", () => {
  for (const invalid of [["envelope"], ["lantern", "lantern"], ["unknown"]]) {
    assert.throws(() => getNextWord(invalid));
  }
});

test("the known vocabulary grows only by completed target words", () => {
  const words = getKnownWords(["lantern"]);
  assert.ok(words.includes("lantern"));
  assert.ok(words.includes("house"));
  assert.ok(!words.includes("envelope"));
});

test("reading and wrong answers do not advance progress or mutate the input", () => {
  const initial = createInitialState();
  const active = acceptLesson(initial, lesson());
  assert.deepEqual(initial.learnedWordIds, []);
  assert.equal(initial.currentLesson, null);
  assert.deepEqual(active.learnedWordIds, []);
  const result = submitAnswer(active, "b");
  assert.equal(result.status, "incorrect");
  assert.deepEqual(result.state.learnedWordIds, []);
  assert.equal(result.state.currentLesson?.lessonId, "test-0");
  assert.throws(() => submitAnswer(active, "not-an-option"));
});

test("correct answers unlock exactly one word and pass the completed story forward", () => {
  const active = acceptLesson(createInitialState(), lesson());
  const result = submitAnswer(active, "a");
  assert.equal(result.status, "correct");
  assert.deepEqual(result.state.learnedWordIds, ["lantern"]);
  assert.equal(result.state.currentLesson, null);
  assert.equal(getNextWord(result.state.learnedWordIds)?.id, "envelope");
  assert.deepEqual(buildLessonRequest(result.state).previousEpisode, {
    lessonId: "test-0", wordId: "lantern", source: "demo",
    title: "The Old House", text: "Mia and Leo see a lantern in the old house.",
  });
  assert.deepEqual(active.learnedWordIds, []);
  assert.equal(submitAnswer(result.state, "a").status, "no-active-lesson");
  assert.equal(result.state.episodes.length, 1);
});

test("active, out-of-order and wrong-mode responses cannot replace current progress", () => {
  const initial = createInitialState();
  assert.throws(() => acceptLesson(initial, lesson(1)));
  assert.throws(() => acceptLesson(initial, lesson(0, "ai")));
  assert.throws(() => acceptLesson(acceptLesson(initial, lesson()), lesson()));
  assert.throws(() => buildLessonRequest(acceptLesson(initial, lesson())));
});

test("completed lessons remain restorable and all ten words finish without an eleventh", () => {
  let state = createInitialState();
  for (let index = 0; index < 10; index++) {
    const ready = lesson(index);
    state = submitAnswer(acceptLesson(state, ready), ready.quiz.correctOptionId).state;
  }
  assert.equal(state.episodes.length, 10);
  assert.equal(getNextWord(state.learnedWordIds), null);
  assert.deepEqual(parseLessonResponse({ status: "completed" }, state.learnedWordIds, "demo"), { status: "completed" });
  assert.deepEqual(parseLearningState(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => acceptLesson(state, lesson()));
});

test("saved active lessons survive a JSON round trip without advancing", () => {
  const active = acceptLesson(createInitialState(), lesson());
  const restored = parseLearningState(JSON.parse(JSON.stringify(active)));
  assert.deepEqual(restored, active);
  assert.deepEqual(restored.learnedWordIds, []);
});

test("corrupt saves, missing history and changed answers are rejected", () => {
  const state = acceptLesson(createInitialState(), lesson());
  for (const invalid of [null, [], {}, { ...state, version: 2 }, { ...state, learnedWordIds: ["lantern"] }]) {
    assert.throws(() => parseLearningState(invalid));
  }
  const changed = structuredClone(state);
  changed.currentLesson!.quiz.correctOptionId = "b";
  assert.throws(() => parseLearningState(changed));
});

test("requests enforce A2 mystery, mode, bounded history and a contiguous word prefix", () => {
  const request = buildLessonRequest(createInitialState());
  assert.deepEqual(parseLessonRequest(request), request);
  for (const invalid of [
    null,
    { ...request, profile: { level: "B1", genre: "mystery" } },
    { ...request, profile: { level: "A2", genre: "travel" } },
    { ...request, mode: "auto" },
    { ...request, learnedWordIds: ["lantern"] },
    { ...request, previousEpisode: { title: "a", text: "b" } },
  ]) assert.throws(() => parseLessonRequest(invalid));
  const finished = submitAnswer(acceptLesson(createInitialState(), lesson()), "a").state;
  const nextRequest = buildLessonRequest(finished);
  assert.deepEqual(parseLessonRequest(nextRequest), nextRequest);
  assert.throws(() => parseLessonRequest({ ...nextRequest, previousEpisode: { ...nextRequest.previousEpisode, text: "x".repeat(5001) } }));
  assert.throws(() => parseLessonRequest({ ...nextRequest, previousEpisode: { ...nextRequest.previousEpisode, wordId: "envelope" } }));
});

test("responses reject false completion, changed quiz data and unsupported words", () => {
  assert.throws(() => parseLessonResponse({ status: "completed" }, [], "demo"));
  const ready = lesson();
  assert.deepEqual(parseLessonResponse(ready, [], "demo"), ready);
  assert.throws(() => parseLessonResponse({ ...ready, word: { ...ready.word, meaningZh: "wrong" } }, [], "demo"));
  assert.throws(() => parseLessonResponse({ ...ready, quiz: { ...ready.quiz, options: [] } }, [], "demo"));
  assert.throws(() => parseLessonResponse({ ...ready, story: { ...ready.story, text: "Mia found an envelope and a lantern." } }, [], "demo"));
});

test("vocabulary checks include titles, require the new word in the body and handle case and possessives", () => {
  assert.deepEqual(checkStoryVocabulary({ title: "Mia's House", text: "Mia’s LANTERN is here." }, []), { missingTarget: false, unknownWords: [] });
  assert.deepEqual(checkStoryVocabulary({ title: "A lantern", text: "Mia is here." }, []), { missingTarget: true, unknownWords: [] });
  assert.deepEqual(checkStoryVocabulary({ title: "Envelope", text: "Mia sees a lantern and a zeppelin." }, []), { missingTarget: false, unknownWords: ["envelope", "zeppelin"] });
  assert.deepEqual(checkStoryVocabulary({ title: "The House", text: "Mia sees a lantern and an envelope." }, ["lantern"]), { missingTarget: false, unknownWords: [] });
});

test("every advertised familiar word is accepted by the same vocabulary checker", () => {
  for (const word of getKnownWords([])) {
    const result = checkStoryVocabulary({ title: "The House", text: `Mia sees a lantern. ${word}` }, []);
    assert.deepEqual(result.unknownWords, [], `Familiar word rejected: ${word}`);
  }
});

const today = new Date(2026, 10, 8, 0, 5);
const tomorrow = new Date(2026, 10, 9, 0, 5);

test("daily upgrade and malformed plans never invent today's completions", () => {
  for (const raw of [null, {}, { version: 2 }, { version: 1, date: "2026-02-31", target: 3, completedWordIds: [], seenWordIds: [] }]) {
    const plan = normalizeDailyPlan(raw, ["lantern", "envelope"], today);
    assert.deepEqual(plan.completedWordIds, []);
    assert.deepEqual(plan.seenWordIds, ["lantern", "envelope"]);
    assert.equal(plan.target, 3);
  }
  const eight = TARGET_WORDS.slice(0, 8).map(word => word.id);
  assert.equal(normalizeDailyPlan(null, eight, today).target, 2);
  const all = TARGET_WORDS.map(word => word.id);
  const complete = getDailySummary(normalizeDailyPlan(null, all, today), all, today);
  assert.equal(complete.target, 0);
  assert.equal(complete.completedToday, 0);
  assert.equal(complete.courseCompleted, true);
});

test("daily target accepts only integers within actual available words and preserves history", () => {
  const plan = normalizeDailyPlan(null, [], today);
  for (const target of [1, 3, 5, 10]) assert.equal(setDailyTarget(plan, target, [], today).target, target);
  for (const target of [0, -1, 11, 2.5, NaN, Infinity]) assert.throws(() => setDailyTarget(plan, target, [], today));
  assert.throws(() => setDailyTarget(plan, 5, TARGET_WORDS.slice(0, 8).map(word => word.id), today));
  const all = TARGET_WORDS.map(word => word.id);
  assert.equal(setDailyTarget(plan, 0, all, today).target, 0);
  assert.throws(() => setDailyTarget(plan, 1, all, today));
});

test("only a real first correct completion counts; incorrect, repeats, refresh and reset do not", () => {
  const before = acceptLesson(createInitialState(), lesson());
  const plan = normalizeDailyPlan(null, [], today);
  const wrong = recordDailyCompletion(plan, before, submitAnswer(before, "b"), today);
  assert.deepEqual(wrong.completedWordIds, []);
  const result = submitAnswer(before, "a");
  const after = recordDailyCompletion(plan, before, result, today);
  assert.deepEqual(after.completedWordIds, ["lantern"]);
  assert.deepEqual(plan.completedWordIds, []);
  assert.deepEqual(recordDailyCompletion(after, before, result, today), after);
  assert.deepEqual(recordDailyCompletion(after, result.state, submitAnswer(result.state, "a"), today), after);
  assert.deepEqual(normalizeDailyPlan(after, result.state.learnedWordIds, today), after);
  const resetPlan = normalizeDailyPlan(after, [], today);
  assert.deepEqual(recordDailyCompletion(resetPlan, before, result, today), after);
  assert.throws(() => recordDailyCompletion(plan, before, { status: "correct", state: before }, today));
});

test("achieving or editing a target does not cap genuine completions or change course progress", () => {
  let state = createInitialState();
  let plan = setDailyTarget(normalizeDailyPlan(null, [], today), 1, [], today);
  for (let index = 0; index < 2; index++) {
    const before = acceptLesson(state, lesson(index));
    const result = submitAnswer(before, before.currentLesson!.quiz.correctOptionId);
    plan = recordDailyCompletion(plan, before, result, today);
    state = result.state;
  }
  const summary = getDailySummary(plan, state.learnedWordIds, today);
  assert.equal(summary.goalReached, true);
  assert.equal(summary.completedToday, 2);
  assert.equal(summary.maxTarget, 10);
  assert.equal(summary.remainingToTarget, 0);
  const changed = setDailyTarget(plan, 5, state.learnedWordIds, today);
  assert.deepEqual(changed.completedWordIds, ["lantern", "envelope"]);
  assert.equal(getDailySummary(changed, state.learnedWordIds, today).remainingToTarget, 3);
  assert.deepEqual(state.learnedWordIds, ["lantern", "envelope"]);
});

test("midnight uses local calendar dates and retains lifetime deduplication", () => {
  const timezone = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try { assert.equal(getLocalDateKey(new Date("2026-11-07T16:05:00Z")), "2026-11-08"); }
  finally { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; }
  const before = acceptLesson(createInitialState(), lesson());
  const result = submitAnswer(before, "a");
  const plan = recordDailyCompletion(normalizeDailyPlan(null, [], today), before, result, today);
  const nextDay = normalizeDailyPlan(plan, ["lantern"], tomorrow);
  assert.deepEqual(nextDay.completedWordIds, []);
  assert.deepEqual(nextDay.seenWordIds, ["lantern"]);
  assert.deepEqual(recordDailyCompletion(nextDay, before, result, tomorrow).completedWordIds, []);
  const second = acceptLesson(result.state, lesson(1));
  const afterMidnight = recordDailyCompletion(plan, second, submitAnswer(second, second.currentLesson!.quiz.correctOptionId), tomorrow);
  assert.equal(afterMidnight.date, getLocalDateKey(tomorrow));
  assert.deepEqual(afterMidnight.completedWordIds, ["envelope"]);
});

test("daily storage parsing strips extra fields and rejects unknown or duplicate word records", () => {
  const plan = normalizeDailyPlan(null, [], today);
  assert.deepEqual(normalizeDailyPlan({ ...plan, ai: { apiKey: "never-store-test" } }, [], today), plan);
  for (const change of [{ seenWordIds: ["alien"] }, { seenWordIds: ["lantern", "lantern"] }, { completedWordIds: ["lantern"] }]) {
    assert.deepEqual(normalizeDailyPlan({ ...plan, ...change }, [], today), plan);
  }
  assert.throws(() => normalizeDailyPlan(plan, ["envelope"], today));
});

test("ten genuine completions finish today, and replaying after midnight creates no new words", () => {
  let state = createInitialState();
  let plan = normalizeDailyPlan(null, [], today);
  for (let index = 0; index < TARGET_WORDS.length; index++) {
    const before = acceptLesson(state, lesson(index));
    const result = submitAnswer(before, before.currentLesson!.quiz.correctOptionId);
    plan = recordDailyCompletion(plan, before, result, today);
    state = result.state;
  }
  assert.equal(getDailySummary(plan, state.learnedWordIds, today).completedToday, 10);
  assert.equal(getDailySummary(plan, state.learnedWordIds, today).availableNewWords, 0);
  plan = normalizeDailyPlan(plan, state.learnedWordIds, tomorrow);
  assert.equal(plan.target, 0);
  state = createInitialState();
  for (let index = 0; index < TARGET_WORDS.length; index++) {
    const before = acceptLesson(state, lesson(index));
    const result = submitAnswer(before, before.currentLesson!.quiz.correctOptionId);
    plan = recordDailyCompletion(plan, before, result, tomorrow);
    state = result.state;
  }
  assert.deepEqual(plan.completedWordIds, []);
  assert.equal(getDailySummary(plan, state.learnedWordIds, tomorrow).courseCompleted, true);
});

test("daily completion rejects valid saves that do not belong to this specific answer", () => {
  const before = acceptLesson(createInitialState(), lesson());
  const one = submitAnswer(before, before.currentLesson!.quiz.correctOptionId).state;
  const second = acceptLesson(one, lesson(1));
  const two = submitAnswer(second, second.currentLesson!.quiz.correctOptionId).state;
  const altered = { ...one, episodes: [{ ...one.episodes[0], lessonId: "other-valid-id" }] };
  const ai = { ...one, mode: "ai", episodes: one.episodes.map(episode => ({ ...episode, source: "ai" })) };
  const plan = normalizeDailyPlan(null, [], today);
  for (const candidate of [two, altered, ai]) {
    const valid = parseLearningState(candidate);
    assert.throws(() => recordDailyCompletion(plan, before, { status: "correct", state: valid }, today), /Invalid completion transition/);
  }
});

test("BYOK accepts only official provider config and keeps credentials outside course parsing", () => {
  const config = { provider: "deepseek", model: " deepseek-flash ", apiKey: " fake-personal-key " };
  assert.deepEqual(parseByokConfig(config), { provider: "deepseek", model: "deepseek-flash", apiKey: "fake-personal-key" });
  assert.equal(parseByokConfig({ ...config, provider: "openai", model: "gpt-4o-mini" }).provider, "openai");
  for (const change of [{ provider: "proxy" }, { baseUrl: "https://example.invalid" }, { model: "../evil" }, { model: "a".repeat(101) }, { apiKey: "" }, { apiKey: "with space" }, { apiKey: "x".repeat(513) }, { apiKey: "line\r\nbreak" }]) {
    assert.throws(() => parseByokConfig({ ...config, ...change }), { message: "Invalid AI configuration" });
  }
  const request = buildLessonRequest(createInitialState("ai"));
  assert.deepEqual(parseLessonRequest({ ...request, ai: parseByokConfig(config) }), request);
  const state = createInitialState("ai");
  assert.deepEqual(parseLearningState({ ...state, ai: parseByokConfig(config) }), state);
});
