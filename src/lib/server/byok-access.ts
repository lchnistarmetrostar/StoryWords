import { createHmac, randomBytes } from "node:crypto";
import { env } from "node:process";
import type { ByokConfig, LessonRequest } from "../../types/contracts.ts";
import { getNextWord } from "../learning.ts";
import { LessonError } from "./errors.ts";

// shortcut: process-local protection, use shared counters before running multiple workers.
const fingerprints = new Map<string, { active: boolean; recent: number[] }>();
const salt = randomBytes(32);
let active = 0;

export function beginByokRequest(request: Request, input: LessonRequest, ai: ByokConfig) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  try {
    const url = new URL(origin ?? "");
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== origin || (url.protocol !== "https:" && !localHttp) ||
        !env.STORYWORDS_ALLOWED_ORIGINS?.split(",").map(value => value.trim()).includes(origin) ||
        request.headers.get("host") !== url.host ||
        request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
        (site !== null && site !== "same-origin")) throw new Error("Invalid request origin");
  } catch {
    throw new LessonError("INVALID_REQUEST");
  }

  if (!getNextWord(input.learnedWordIds)) return { reserveAttempt: () => {}, release: () => {} };
  const now = performance.now();
  for (const [id, entry] of fingerprints) {
    entry.recent = entry.recent.filter(start => now - start < 60_000);
    if (!entry.active && !entry.recent.length) fingerprints.delete(id);
  }
  const id = createHmac("sha256", salt).update(ai.provider).update("\0").update(ai.apiKey).digest("hex");
  const entry = fingerprints.get(id) ?? { active: false, recent: [] };
  if (active >= 4 || entry.active || entry.recent.length >= 4 || (!fingerprints.has(id) && fingerprints.size >= 1024)) {
    throw new LessonError("RATE_LIMITED");
  }
  fingerprints.set(id, entry);
  entry.active = true;
  active++;
  let released = false;
  return {
    reserveAttempt() {
      if (released) throw new LessonError("INTERNAL_ERROR");
      const now = performance.now();
      entry.recent = entry.recent.filter(start => now - start < 60_000);
      if (entry.recent.length >= 4) throw new LessonError("RATE_LIMITED");
      entry.recent.push(now);
    },
    release() {
      if (released) return;
      released = true;
      entry.active = false;
      active--;
      if (!entry.recent.length) fingerprints.delete(id);
    },
  };
}
