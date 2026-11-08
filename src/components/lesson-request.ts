import { acceptLesson, buildLessonRequest, parseLessonResponse } from "../lib/learning.ts";
import { parseByokConfig } from "../lib/byok.ts";
import type { ApiErrorCode, ByokConfig, LearningState, LessonTransportRequest } from "../types/contracts.ts";

const errorMessages: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: "当前进度暂时无法请求故事，请刷新页面恢复存档后重试。",
  PAYLOAD_TOO_LARGE: "上一章内容过长，故事服务暂时无法接续。当前进度已保留。",
  AI_NOT_CONFIGURED: "请在“使用自己的 AI”中填写个人 API 配置后重试。当前进度和来源已保留。",
  RATE_LIMITED: "故事服务当前较忙，请稍后重试。",
  AI_TIMEOUT: "故事生成超时，请重试。当前进度已保留。",
  AI_UPSTREAM_ERROR: "AI 请求未成功，请检查供应商、模型名称和个人密钥，或稍后重试。当前进度已保留。",
  INVALID_AI_OUTPUT: "AI 故事未通过内容检查，请重试。当前进度已保留。",
  INTERNAL_ERROR: "故事服务遇到问题，请稍后重试。",
};

export async function requestLesson(state: LearningState, signal: AbortSignal, ai?: ByokConfig): Promise<LearningState> {
  const request: LessonTransportRequest = buildLessonRequest(state);
  signal.throwIfAborted();
  if (state.mode === "ai") {
    if (!ai) throw new Error(errorMessages.AI_NOT_CONFIGURED);
    try { request.ai = parseByokConfig(ai); }
    catch { throw new Error("个人 API 配置无效，请检查供应商、模型名称和密钥后重试。"); }
  }
  let response: Response;
  try {
    response = await fetch("/api/lesson", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request), cache: "no-store", signal,
    });
  } catch {
    signal.throwIfAborted();
    throw new Error("网络连接失败，请检查网络后重试。当前进度已保留。");
  }
  signal.throwIfAborted();
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    signal.throwIfAborted();
    throw new Error("故事服务未返回可读取的内容，请稍后重试。当前进度已保留。");
  }
  signal.throwIfAborted();
  if (!response.ok) {
    const error = raw && typeof raw === "object" && "error" in raw ? raw.error : null;
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    throw new Error(typeof code === "string" && Object.hasOwn(errorMessages, code)
      ? errorMessages[code as ApiErrorCode]
      : "故事服务暂时不可用，请稍后重试。当前进度已保留。");
  }
  try {
    const lesson = parseLessonResponse(raw, state.learnedWordIds, state.mode);
    return lesson.status === "completed" ? state : acceptLesson(state, lesson);
  } catch {
    throw new Error("故事内容与本轮学习不一致，未载入该内容。请重试，当前进度已保留。");
  }
}
