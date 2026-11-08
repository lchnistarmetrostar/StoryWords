import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/lesson/route.ts";
import { DEMO_LESSONS } from "../src/data/demo-lessons.ts";
import { BASE_KNOWN_WORDS, TARGET_WORDS } from "../src/data/vocabulary.ts";
import { acceptLesson, buildLessonRequest, checkStoryVocabulary, createInitialState, parseLearningState, parseLessonResponse, submitAnswer } from "../src/lib/learning.ts";

test("all ten full demo chapters add only their current word, including titles", () => {
  assert.equal(DEMO_LESSONS.length, TARGET_WORDS.length);
  assert.equal(new Set(DEMO_LESSONS.map((story) => story.title)).size, 10);
  for (const [index, story] of DEMO_LESSONS.entries()) {
    const ids = TARGET_WORDS.slice(0, index).map((word) => word.id);
    assert.deepEqual(checkStoryVocabulary(story, ids), { missingTarget: false, unknownWords: [] });
    const previous = new Set([...BASE_KNOWN_WORDS, ...ids]);
    const bodyWords = story.text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g)!;
    const introduced = [...new Set(bodyWords.map((word) => word.endsWith("'s") ? word.slice(0, -2) : word))]
      .filter((word) => !previous.has(word));
    assert.deepEqual(introduced, [TARGET_WORDS[index].text]);
    const length = story.text.split(/\s+/).length;
    assert.ok(length >= 80 && length <= 120, `Chapter ${index + 1}: ${length} words`);
    assert.match(story.text, /Mia/);
    assert.match(story.text, /Leo/);
    for (const future of TARGET_WORDS.slice(index + 1)) {
      assert.doesNotMatch(`${story.title} ${story.text}`, new RegExp(`\\b${future.text}\\b`, "i"));
    }
  }
});

test("demo POST completes ten lessons with stable IDs and no network or credentials", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", () => { throw new Error("Demo must never call fetch"); });
  let state = createInitialState("demo");
  const ids = new Set<string>();
  for (let index = 0; index < 10; index++) {
    const response = await POST(new Request("http://localhost/api/lesson", {
      method: "POST", body: JSON.stringify(buildLessonRequest(state)),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const lesson = parseLessonResponse(await response.json(), state.learnedWordIds, "demo");
    assert.equal(lesson.status, "ready");
    if (lesson.status !== "ready") assert.fail("Expected a demo lesson");
    assert.equal(lesson.source, "demo");
    assert.equal(lesson.lessonId, `demo-v1-${String(index + 1).padStart(2, "0")}`);
    assert.ok(!ids.has(lesson.lessonId));
    ids.add(lesson.lessonId);
    assert.deepEqual(lesson.story, DEMO_LESSONS[index]);
    assert.deepEqual(lesson.quiz, TARGET_WORDS[index].quiz);
    const active = acceptLesson(state, lesson);
    const wrong = lesson.quiz.options.find((option) => option.id !== lesson.quiz.correctOptionId)!;
    assert.deepEqual(submitAnswer(active, wrong.id).state.learnedWordIds, state.learnedWordIds);
    state = submitAnswer(active, lesson.quiz.correctOptionId).state;
    assert.equal(buildLessonRequest(state).previousEpisode?.text, lesson.story.text);
  }
  assert.deepEqual(parseLearningState(JSON.parse(JSON.stringify(state))), state);
  const completed = await POST(new Request("http://localhost/api/lesson", {
    method: "POST", body: JSON.stringify(buildLessonRequest(state)),
  }));
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { status: "completed" });
  assert.equal(ids.size, 10);
  assert.equal(calls.mock.callCount(), 0);
});
