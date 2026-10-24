/**
 * 服务端 AI 调用公共逻辑：JSON 容错提取、上游错误读取、OpenAI 兼容 chat/completions 封装。
 * 仅供 Route Handler 使用（服务端环境，依赖 process.env 由调用方传入）。
 */

export interface ChatMessage {
  role: string;
  content: string;
}

export interface PostChatCompletionsParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  res: Response;
  /** 首次请求（400 时）已读取到的上游错误详情，避免二次读取已消费的响应体 */
  detail: string;
}

/** 从上游错误响应体中提取可读错误信息（OpenAI 兼容格式）。 */
export async function readUpstreamError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const err = body?.error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === "string") return msg;
    }
    if (typeof body?.message === "string") return body.message;
  } catch {
    // 响应体可能不是 JSON 或已被读取
  }
  return "";
}

/** 从模型返回文本中容错提取 JSON 对象。 */
export function extractJson(text: string): unknown {
  let candidate = text.trim();

  // 去掉 ```json ... ``` 或 ``` ... ``` 包裹
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    candidate = fence[1].trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    // 回退：截取第一个 { 到最后一个 } 之间的片段
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * 调用 OpenAI 兼容的 /chat/completions。
 * 默认带 response_format=json_object；若上游 400 且报错涉及 json/response_format，自动去掉后重试一次。
 * 网络/超时错误原样抛出（TimeoutError/AbortError），由调用方区分处理。
 */
export async function postChatCompletions(
  params: PostChatCompletionsParams,
): Promise<ChatResult> {
  const {
    baseUrl,
    apiKey,
    model,
    messages,
    temperature = 0.2,
    maxTokens = 1200,
    timeoutMs = 45_000,
  } = params;

  const baseBody = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages,
  };

  const doFetch = (withJsonFormat: boolean) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        withJsonFormat ? { ...baseBody, response_format: { type: "json_object" } } : baseBody,
      ),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let res = await doFetch(true);
  let detail = "";

  if (res.status === 400) {
    detail = await readUpstreamError(res);
    if (/(json|response_format)/i.test(detail)) {
      detail = "";
      res = await doFetch(false);
    }
  }

  return { res, detail };
}
