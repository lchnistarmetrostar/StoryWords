import type { ByokConfig } from "../types/contracts.ts";

/** Request-only validation; callers must never persist the returned credential. */
export function parseByokConfig(value: unknown): ByokConfig {
  const invalid = () => new Error("Invalid AI configuration");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const config = value as Record<string, unknown>;
  if (Object.keys(config).length !== 3 || Object.keys(config).some(key => !["provider", "model", "apiKey"].includes(key)) ||
      (config.provider !== "deepseek" && config.provider !== "openai") ||
      typeof config.model !== "string" || typeof config.apiKey !== "string") throw invalid();
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model) || !/^[!-~]{8,512}$/.test(apiKey)) throw invalid();
  return { provider: config.provider, model, apiKey };
}
