import { parseLearningState, STORAGE_KEY } from "./learning.ts";
import type { LearningState } from "../types/contracts.ts";

export type StoredProgress =
  | { status: "ready"; state: LearningState }
  | { status: "empty" | "invalid" | "unavailable" };

export function loadProgress(storage?: Pick<Storage, "getItem">): StoredProgress {
  let raw: string | null;
  try {
    raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "empty" };
  try {
    return { status: "ready", state: parseLearningState(JSON.parse(raw)) };
  } catch {
    return { status: "invalid" };
  }
}

export function saveProgress(state: LearningState, storage?: Pick<Storage, "setItem">): boolean {
  try {
    const parsed = parseLearningState(state);
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

// The caller must obtain confirmation before clearing an existing or invalid save.
export function clearProgress(storage?: Pick<Storage, "removeItem">): boolean {
  try {
    (storage ?? window.localStorage).removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
