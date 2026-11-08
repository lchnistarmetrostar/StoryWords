import { env } from "node:process";
import type { LessonRequest } from "../../types/contracts.ts";
import { getNextWord } from "../learning.ts";
import { LessonError } from "./errors.ts";

// shortcut: single-process, per-launch budget; a public/multi-worker service needs shared accounting.
let active = false;
let attempts = 0;
let recent: number[] = [];

export function beginLocalAiRequest(request: Request, input: LessonRequest): () => void {
  if (env.STORYWORDS_LOCAL_AI_DEMO !== "1" || input.mode !== "ai") return () => {};
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("host") !== "127.0.0.1:3001" ||
      request.headers.get("origin") !== "http://127.0.0.1:3001" ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
      (site !== null && site !== "same-origin")) {
    throw new LessonError("INVALID_REQUEST");
  }
  // A completed course performs no generation and must remain readable after budget exhaustion.
  if (!getNextWord(input.learnedWordIds)) return () => {};
  if (active) throw new LessonError("RATE_LIMITED");
  active = true;
  return () => { active = false; };
}

export function reserveLocalAiAttempt(): void {
  if (env.STORYWORDS_LOCAL_AI_DEMO !== "1") return;
  const now = performance.now();
  recent = recent.filter(start => now - start < 60_000);
  if (attempts >= 10 || recent.length >= 4) throw new LessonError("RATE_LIMITED");
  attempts++;
  recent.push(now);
}

export function localAiOutputLimit(): Record<string, number> {
  if (env.STORYWORDS_LOCAL_AI_DEMO !== "1") return {};
  const parameter = env.STORYWORDS_AI_OUTPUT_LIMIT;
  return parameter === "max_tokens" || parameter === "max_completion_tokens" ? { [parameter]: 2048 } : {};
}
