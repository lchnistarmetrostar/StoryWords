import { MAX_REQUEST_BYTES, parseLessonRequest } from "../../../lib/learning.ts";
import { errorResponse, LessonError } from "../../../lib/server/errors.ts";
import { getLesson } from "../../../lib/server/lesson.ts";

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
    return parseLessonRequest(JSON.parse(text + decoder.decode()));
  } catch (error) {
    if (error instanceof LessonError) throw error;
    throw new LessonError("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readRequest(request);
    const lesson = await getLesson(input, request.signal);
    return Response.json(lesson, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error instanceof LessonError ? error.code : "INTERNAL_ERROR");
  }
}
