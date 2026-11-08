import type { ApiError, ApiErrorCode } from "../../types/contracts.ts";

const ERRORS = {
  INVALID_REQUEST: { status: 400, message: "学习请求无效，请检查当前进度。", retryable: false },
  PAYLOAD_TOO_LARGE: { status: 413, message: "请求内容过大，请缩短请求后重试。", retryable: false },
  AI_NOT_CONFIGURED: { status: 503, message: "真实 AI 尚未配置，请先设置服务端 AI 配置。", retryable: false },
  RATE_LIMITED: { status: 429, message: "AI 服务请求过于频繁，请稍后重试。", retryable: true },
  AI_TIMEOUT: { status: 504, message: "故事生成超时，请重试。", retryable: true },
  AI_UPSTREAM_ERROR: { status: 502, message: "AI 服务暂时不可用，请稍后重试。", retryable: true },
  INVALID_AI_OUTPUT: { status: 502, message: "AI 故事未通过格式或词汇检查，请重试。", retryable: true },
  INTERNAL_ERROR: { status: 500, message: "故事服务出现内部错误，请稍后再试。", retryable: false },
} satisfies Record<ApiErrorCode, { status: number; message: string; retryable: boolean }>;

export class LessonError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(ERRORS[code].message);
    this.code = code;
  }
}

export function errorResponse(code: ApiErrorCode): Response {
  const { status, message, retryable } = ERRORS[code];
  const body: ApiError = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
