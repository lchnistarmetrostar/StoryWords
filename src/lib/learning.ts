import { BASE_KNOWN_WORDS, TARGET_WORDS } from "../data/vocabulary.ts";
import type {
  AnswerResult, ContentSource, Episode, LearningState, LessonRequest,
  LessonResponse, Profile, ReadyLesson, Story, VocabularyEntry,
} from "../types/contracts.ts";

export const STORAGE_KEY = "storywords.progress.v1";
export const MAX_STORY_LENGTH = 5000;
export const MAX_TITLE_LENGTH = 100;
export const MAX_REQUEST_BYTES = 32768;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid text length");
  return value;
}

function parseMode(value: unknown): ContentSource {
  if (value !== "ai" && value !== "demo") throw new Error("Invalid content source");
  return value;
}

function parseProfile(value: unknown): Profile {
  const profile = record(value);
  if (profile.level !== "A2" || profile.genre !== "mystery") throw new Error("Only A2 mystery is supported");
  return { level: "A2", genre: "mystery" };
}

function parseLearnedIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > TARGET_WORDS.length || value.some((id, index) => id !== TARGET_WORDS[index].id)) {
    throw new Error("Completed words must be an ordered prefix of the vocabulary");
  }
  return [...value];
}

function parseStory(value: unknown): Story {
  const story = record(value);
  return { title: text(story.title, MAX_TITLE_LENGTH), text: text(story.text, MAX_STORY_LENGTH) };
}

function tokens(value: string): string[] {
  return (value.toLowerCase().replaceAll("’", "'").match(/[a-z]+(?:'[a-z]+)*/g) ?? [])
    .map((word) => word.endsWith("'s") && !BASE_KNOWN_WORDS.includes(word) ? word.slice(0, -2) : word);
}

export function createInitialState(mode: ContentSource = "demo"): LearningState {
  return { version: 1, profile: { level: "A2", genre: "mystery" }, mode: parseMode(mode), learnedWordIds: [], episodes: [], currentLesson: null };
}

export function getNextWord(learnedWordIds: readonly string[]): VocabularyEntry | null {
  return TARGET_WORDS[parseLearnedIds(learnedWordIds).length] ?? null;
}

export function getKnownWords(learnedWordIds: readonly string[]): string[] {
  const ids = parseLearnedIds(learnedWordIds);
  return [...new Set([...BASE_KNOWN_WORDS, ...TARGET_WORDS.slice(0, ids.length).map((word) => word.text)])];
}

export function checkStoryVocabulary(story: Story, learnedWordIds: readonly string[]): { missingTarget: boolean; unknownWords: string[] } {
  const next = getNextWord(learnedWordIds);
  if (!next) throw new Error("All words have been completed");
  const allowed = new Set([...getKnownWords(learnedWordIds), next.text]);
  return {
    missingTarget: !tokens(story.text).includes(next.text),
    unknownWords: [...new Set(tokens(`${story.title} ${story.text}`).filter((word) => !allowed.has(word)))],
  };
}

function assertStoryVocabulary(story: Story, learnedWordIds: readonly string[]): void {
  const check = checkStoryVocabulary(story, learnedWordIds);
  if (check.missingTarget || check.unknownWords.length) throw new Error("Story violates the allowed vocabulary");
}

function parseEpisode(value: unknown, previousIds: readonly string[], mode: ContentSource): Episode {
  const episode = record(value);
  const word = getNextWord(previousIds);
  if (!word || episode.wordId !== word.id || episode.source !== mode) throw new Error("Episode does not match progress");
  const story = parseStory(episode);
  assertStoryVocabulary(story, previousIds);
  return { lessonId: text(episode.lessonId, 100), wordId: word.id, source: mode, ...story };
}

export function parseLessonRequest(value: unknown): LessonRequest {
  const request = record(value);
  const profile = parseProfile(request.profile);
  const mode = parseMode(request.mode);
  const learnedWordIds = parseLearnedIds(request.learnedWordIds);
  let previousEpisode: Episode | null = null;
  if (learnedWordIds.length) {
    previousEpisode = parseEpisode(request.previousEpisode, learnedWordIds.slice(0, -1), mode);
  } else if (request.previousEpisode !== null) {
    throw new Error("The first lesson cannot have a previous episode");
  }
  return { profile, mode, learnedWordIds, previousEpisode };
}

export function parseLessonResponse(value: unknown, learnedWordIds: readonly string[], mode: ContentSource): LessonResponse {
  const response = record(value);
  const expected = getNextWord(learnedWordIds);
  parseMode(mode);
  if (response.status === "completed" && !expected) return { status: "completed" };
  if (response.status !== "ready" || !expected || response.source !== mode) throw new Error("Unexpected lesson response");
  const word = record(response.word);
  if (word.id !== expected.id || word.text !== expected.text || word.meaningZh !== expected.meaningZh) throw new Error("Unexpected target word");
  const quiz = record(response.quiz);
  if (quiz.question !== expected.quiz.question || quiz.correctOptionId !== expected.quiz.correctOptionId || !Array.isArray(quiz.options) || quiz.options.length !== expected.quiz.options.length) {
    throw new Error("Unexpected quiz");
  }
  for (const [index, option] of quiz.options.entries()) {
    const parsed = record(option);
    if (parsed.id !== expected.quiz.options[index].id || parsed.text !== expected.quiz.options[index].text) throw new Error("Unexpected quiz option");
  }
  const story = parseStory(response.story);
  assertStoryVocabulary(story, learnedWordIds);
  return {
    status: "ready", lessonId: text(response.lessonId, 100), source: mode,
    word: { id: expected.id, text: expected.text, meaningZh: expected.meaningZh },
    story, quiz: structuredClone(expected.quiz),
  };
}

export function parseLearningState(value: unknown): LearningState {
  const state = record(value);
  if (state.version !== 1) throw new Error("Unsupported save version");
  const profile = parseProfile(state.profile);
  const mode = parseMode(state.mode);
  const learnedWordIds = parseLearnedIds(state.learnedWordIds);
  if (!Array.isArray(state.episodes) || state.episodes.length !== learnedWordIds.length) throw new Error("Missing completed story history");
  const episodes = state.episodes.map((episode, index) => parseEpisode(episode, learnedWordIds.slice(0, index), mode));
  if (new Set(episodes.map((episode) => episode.lessonId)).size !== episodes.length) throw new Error("Duplicate completed episode");
  let currentLesson: ReadyLesson | null = null;
  if (state.currentLesson !== null) {
    const lesson = parseLessonResponse(state.currentLesson, learnedWordIds, mode);
    if (lesson.status !== "ready" || episodes.some((episode) => episode.lessonId === lesson.lessonId)) throw new Error("Invalid active lesson");
    currentLesson = lesson;
  }
  return { version: 1, profile, mode, learnedWordIds, episodes, currentLesson };
}

export function buildLessonRequest(state: LearningState): LessonRequest {
  const parsed = parseLearningState(state);
  if (parsed.currentLesson) throw new Error("Finish the current lesson before requesting another");
  return {
    profile: parsed.profile, mode: parsed.mode, learnedWordIds: parsed.learnedWordIds,
    previousEpisode: parsed.episodes.at(-1) ?? null,
  };
}

export function acceptLesson(state: LearningState, value: unknown): LearningState {
  const parsed = parseLearningState(state);
  if (parsed.currentLesson) throw new Error("A lesson is already active");
  const lesson = parseLessonResponse(value, parsed.learnedWordIds, parsed.mode);
  if (lesson.status !== "ready" || parsed.episodes.some((episode) => episode.lessonId === lesson.lessonId)) throw new Error("No new lesson to accept");
  return { ...parsed, currentLesson: lesson };
}

export function submitAnswer(state: LearningState, optionId: string): AnswerResult {
  const parsed = parseLearningState(state);
  const lesson = parsed.currentLesson;
  if (!lesson) return { status: "no-active-lesson", state: parsed };
  if (!lesson.quiz.options.some((option) => option.id === optionId)) throw new Error("Unknown quiz option");
  if (optionId !== lesson.quiz.correctOptionId) return { status: "incorrect", state: parsed };
  return {
    status: "correct",
    state: {
      ...parsed,
      learnedWordIds: [...parsed.learnedWordIds, lesson.word.id],
      episodes: [...parsed.episodes, { lessonId: lesson.lessonId, wordId: lesson.word.id, source: lesson.source, ...lesson.story }],
      currentLesson: null,
    },
  };
}
