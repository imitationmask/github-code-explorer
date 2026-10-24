import type { EntryVerification } from "@/types/ai";
import type { DataSource } from "./datasource/types";
import { getRequestSettings } from "./settings";

export const MAX_ENTRY_LINES = 4000;
const HEAD_LINES = 2000;
const TAIL_LINES = 2000;

export interface TruncatedFile {
  text: string;
  totalLines: number;
  truncated: boolean;
}

/** 按行截断：≤4000 行全读；超过则取前 2000 行 + 后 2000 行，中间插入省略标记。 */
export function truncateFileContent(
  content: string,
  maxLines = MAX_ENTRY_LINES,
): TruncatedFile {
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (totalLines <= maxLines) {
    return { text: content, totalLines, truncated: false };
  }

  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(totalLines - TAIL_LINES);
  const omitted = totalLines - HEAD_LINES - TAIL_LINES;
  const text = [
    ...head,
    `…（中间省略 ${omitted} 行）…`,
    ...tail,
  ].join("\n");

  return { text, totalLines, truncated: true };
}

export interface EntryVerifyContext {
  htmlUrl: string;
  description: string | null;
  languages: string[];
}

export interface VerifyEntryFileParams {
  dataSource: DataSource;
  path: string;
  context: EntryVerifyContext;
  signal?: AbortSignal;
}

/** 读取文件内容、按行截断后调用 /api/verify-entry 研判是否为入口文件。 */
export async function verifyEntryFile({
  dataSource,
  path,
  context,
  signal,
}: VerifyEntryFileParams): Promise<EntryVerification> {
  const raw = await dataSource.readFile(path);
  if (raw.includes("\u0000")) {
    throw new Error("文件为二进制，跳过研判");
  }

  const { text, totalLines, truncated } = truncateFileContent(raw);

  const res = await fetch("/api/verify-entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content: text, totalLines, truncated, context, settings: getRequestSettings() }),
    signal,
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: EntryVerification; error?: string }
    | null;

  if (!res.ok || !payload || payload.ok !== true || !payload.data) {
    throw new Error(payload?.error || "入口研判失败，请重试");
  }

  return payload.data;
}
