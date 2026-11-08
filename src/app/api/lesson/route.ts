import { env } from "node:process";
import { MAX_REQUEST_BYTES, parseLessonRequest } from "../../../lib/learning.ts";
import { parseByokConfig } from "../../../lib/byok.ts";
import { errorResponse, LessonError } from "../../../lib/server/errors.ts";
import { getLesson } from "../../../lib/server/lesson.ts";
import { beginLocalAiRequest } from "../../../lib/server/local-ai-demo.ts";
import { beginByokRequest } from "../../../lib/server/byok-access.ts";

export const runtime = "nodejs";

async function readRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new LessonError("INVALID_REQUEST");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new LessonError("PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    const raw = JSON.parse(text + decoder.decode());
    const input = parseLessonRequest(raw);
    if (Object.hasOwn(raw, "ai") && input.mode !== "ai") throw new LessonError("INVALID_REQUEST");
    const ai = Object.hasOwn(raw, "ai") ? parseByokConfig(raw.ai) : undefined;
    return { input, ai };
  } catch (error) {
    if (error instanceof LessonError) throw error;
    throw new LessonError("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    const { input, ai } = await readRequest(request);
    const byokOnly = env.STORYWORDS_BYOK_ONLY === "1";
    if (input.mode === "ai" && byokOnly && !ai) throw new LessonError("AI_NOT_CONFIGURED");
    if (input.mode === "ai" && (byokOnly || ai) && env.STORYWORDS_LOCAL_AI_DEMO === "1") {
      throw new LessonError("AI_NOT_CONFIGURED");
    }
    let reserveAttempt: (() => void) | undefined;
    if (ai) {
      const access = beginByokRequest(request, input, ai);
      release = access.release;
      reserveAttempt = access.reserveAttempt;
    } else {
      release = beginLocalAiRequest(request, input);
    }
    const lesson = await getLesson(input, request.signal, ai, reserveAttempt);
    return Response.json(lesson, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error instanceof LessonError ? error.code : "INTERNAL_ERROR");
  } finally {
    release?.();
  }
}
