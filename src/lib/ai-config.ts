/**
 * 服务端 AI 配置解析（仅 Route Handler 使用）。
 *
 * 优先级：环境变量 > 请求体 settings > 默认值。
 * 客户端在每次请求体中携带 settings（aiBaseUrl/aiApiKey/aiModel/subfunctionCount），
 * 服务端以环境变量为准，env 缺失时回退到请求体，最终回退默认值。
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_SUBFUNCTION_COUNT = 10;

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 提取请求体中的 settings 子对象（不存在则返回空对象）。 */
function bodySettings(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object") {
    const s = (body as Record<string, unknown>).settings;
    if (s && typeof s === "object") return s as Record<string, unknown>;
  }
  return {};
}

/** 统一解析 baseUrl / apiKey / model（四类 AI 路由共用）。 */
export function resolveAiConfig(body: unknown): AiConfig {
  const s = bodySettings(body);
  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    asString(s.aiBaseUrl) ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const apiKey = process.env.OPENAI_API_KEY || asString(s.aiApiKey);
  const model =
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    asString(s.aiModel) ||
    DEFAULT_MODEL;

  return { baseUrl, apiKey, model };
}

/** 解析关键子函数数量上限（env 优先，其次请求体，默认 10，范围 1–20）。 */
export function resolveSubfunctionCount(body: unknown): number {
  const s = bodySettings(body);
  const raw = process.env.SUBFUNCTION_COUNT ?? s.subfunctionCount;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n)) {
    return Math.min(20, Math.max(1, Math.round(n)));
  }
  return DEFAULT_SUBFUNCTION_COUNT;
}
