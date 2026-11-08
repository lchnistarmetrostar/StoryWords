import { DAILY_PLAN_STORAGE_KEY, normalizeDailyPlan } from "./daily-plan.ts";
import type { DailyPlan } from "../types/contracts.ts";

export function loadDailyProgress(learnedIds: readonly string[], storage?: Pick<Storage, "getItem">, now?: Date): {
  status: "ready" | "empty" | "invalid" | "unavailable"; plan: DailyPlan;
} {
  let raw: string | null;
  try { raw = (storage ?? window.localStorage).getItem(DAILY_PLAN_STORAGE_KEY); }
  catch { return { status: "unavailable", plan: normalizeDailyPlan(null, learnedIds, now) }; }
  if (raw === null) return { status: "empty", plan: normalizeDailyPlan(null, learnedIds, now) };
  try { return { status: "ready", plan: normalizeDailyPlan(JSON.parse(raw), learnedIds, now) }; }
  catch { return { status: "invalid", plan: normalizeDailyPlan(null, learnedIds, now) }; }
}

export function saveDailyProgress(plan: DailyPlan, learnedIds: readonly string[], storage?: Pick<Storage, "setItem">, now?: Date): boolean {
  try {
    const normalized = normalizeDailyPlan(plan, learnedIds, now);
    (storage ?? window.localStorage).setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch { return false; }
}
