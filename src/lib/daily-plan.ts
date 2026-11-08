import { TARGET_WORDS } from "../data/vocabulary.ts";
import { getNextWord, parseLearningState, submitAnswer } from "./learning.ts";
import type { AnswerResult, DailyPlan, DailySummary, LearningState } from "../types/contracts.ts";

export const DAILY_PLAN_STORAGE_KEY = "storywords.daily-plan.v1";

export function getLocalDateKey(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid local date");
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function wordIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > TARGET_WORDS.length || new Set(value).size !== value.length ||
      value.some(id => !TARGET_WORDS.some(word => word.id === id))) throw new Error("Invalid daily words");
  return [...value];
}

function readPlan(value: unknown): DailyPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid daily plan");
  const plan = value as Record<string, unknown>;
  if (plan.version !== 1 || typeof plan.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) ||
      getLocalDateKey(new Date(`${plan.date}T12:00:00`)) !== plan.date ||
      typeof plan.target !== "number" || !Number.isInteger(plan.target) || plan.target < 0 || plan.target > TARGET_WORDS.length) {
    throw new Error("Invalid daily plan");
  }
  const seenWordIds = wordIds(plan.seenWordIds);
  const completedWordIds = wordIds(plan.completedWordIds);
  if (completedWordIds.some(id => !seenWordIds.includes(id))) throw new Error("Invalid daily completion history");
  return { version: 1, date: plan.date, target: plan.target, completedWordIds, seenWordIds };
}

export function normalizeDailyPlan(value: unknown, learnedWordIds: readonly string[], now = new Date()): DailyPlan {
  getNextWord(learnedWordIds);
  const date = getLocalDateKey(now);
  let saved: DailyPlan;
  try { saved = readPlan(value); }
  catch { saved = { version: 1, date, target: 3, completedWordIds: [], seenWordIds: [] }; }
  // Observed existing progress establishes history, never retrospective daily completions.
  const seenWordIds = TARGET_WORDS.filter(word => saved.seenWordIds.includes(word.id) || learnedWordIds.includes(word.id)).map(word => word.id);
  const completedWordIds = saved.date === date ? [...saved.completedWordIds] : [];
  const maxTarget = completedWordIds.length + TARGET_WORDS.length - seenWordIds.length;
  const target = maxTarget === 0 ? 0 : Math.min(Math.max(1, saved.target), maxTarget);
  return { version: 1, date, target, completedWordIds, seenWordIds };
}

export function setDailyTarget(plan: DailyPlan, target: number, learnedWordIds: readonly string[], now = new Date()): DailyPlan {
  const summary = getDailySummary(plan, learnedWordIds, now);
  if (!Number.isInteger(target) || target < (summary.maxTarget === 0 ? 0 : 1) || target > summary.maxTarget) {
    throw new Error("Daily target exceeds available new words");
  }
  return { ...summary.plan, target };
}

export function recordDailyCompletion(plan: DailyPlan, before: LearningState, result: AnswerResult, now = new Date()): DailyPlan {
  const state = parseLearningState(before);
  const current = normalizeDailyPlan(plan, state.learnedWordIds, now);
  if (result.status !== "correct") return current;
  if (!state.currentLesson) throw new Error("Invalid completion transition");
  const expected = submitAnswer(state, state.currentLesson.quiz.correctOptionId).state;
  if (JSON.stringify(parseLearningState(result.state)) !== JSON.stringify(expected)) throw new Error("Invalid completion transition");
  const id = state.currentLesson.word.id;
  if (current.seenWordIds.includes(id)) return current;
  return normalizeDailyPlan({ ...current, completedWordIds: [...current.completedWordIds, id], seenWordIds: [...current.seenWordIds, id] }, expected.learnedWordIds, now);
}

export function getDailySummary(plan: DailyPlan, learnedWordIds: readonly string[], now = new Date()): DailySummary {
  const current = normalizeDailyPlan(plan, learnedWordIds, now);
  const completedToday = current.completedWordIds.length;
  const availableNewWords = TARGET_WORDS.length - current.seenWordIds.length;
  return {
    plan: current, target: current.target, completedToday,
    remainingToTarget: Math.max(0, current.target - completedToday), availableNewWords,
    maxTarget: completedToday + availableNewWords,
    goalReached: current.target > 0 && completedToday >= current.target,
    courseCompleted: learnedWordIds.length === TARGET_WORDS.length,
  };
}
