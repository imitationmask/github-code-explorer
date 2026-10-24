/**
 * 递归截断 JSON 中的长字符串字段，避免超长内容撑爆展示区域。
 * 字符串长度超过 maxLength 时，仅保留前 maxLength 个字符，并追加「···（还有 N 字符）」提示。
 */

export const DEFAULT_TRUNCATE_LENGTH = 500;

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = value.slice(0, maxLength);
  const rest = value.length - maxLength;
  return `${head}···（还有 ${rest} 字符）`;
}

export function truncateJson(value: unknown, maxLength = DEFAULT_TRUNCATE_LENGTH): unknown {
  if (typeof value === "string") {
    return truncateString(value, maxLength);
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateJson(item, maxLength));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = truncateJson(v, maxLength);
    }
    return result;
  }
  return value;
}
