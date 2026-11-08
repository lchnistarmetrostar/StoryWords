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
