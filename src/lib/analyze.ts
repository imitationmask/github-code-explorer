import type { AiAnalysis, AiDebugInfo } from "@/types/ai";
import type { FileNode } from "@/types/github";
import { filterCodeFiles } from "./code-filter";
import { getRequestSettings } from "./settings";

/** 递归收集文件树中所有 blob 节点（文件）的路径。 */
export function collectFilePaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  const walk = (list: FileNode[]) => {
    for (const node of list) {
      if (node.type === "blob") {
        paths.push(node.path);
      } else if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

export interface PreparedFiles {
  /** 过滤并采样后、实际发送给 AI 的文件路径 */
  files: string[];
  /** 过滤前文件树 blob 总数 */
  totalFileCount: number;
  /** 过滤后的代码文件总数 */
  codeFileCount: number;
  /** 是否发生抽样 */
  sampled: boolean;
}

/** 收集并过滤/采样代码文件，供日志记录与后续请求使用。 */
export function prepareAnalysisFiles(nodes: FileNode[]): PreparedFiles {
  const paths = collectFilePaths(nodes);
  const { files, codeFileCount, sampled } = filterCodeFiles(paths);
  return { files, totalFileCount: paths.length, codeFileCount, sampled };
}

export interface RequestAnalysisInput {
  files: string[];
  codeFileCount: number;
  sampled: boolean;
  /** 项目标识（GitHub 传 `owner/repo`，本地传 `local/<sanitized-name>`）。 */
  projectLabel: string;
  signal?: AbortSignal;
}

export interface AnalysisResult {
  analysis: AiAnalysis;
  debug: AiDebugInfo;
}

const EMPTY_DEBUG: AiDebugInfo = {
  request: { model: "", messages: [] },
  response: { raw: "" },
};

/**
 * 用已过滤的文件列表请求 /api/analyze，返回归一化结果与 AI 调用原文（debug）。
 * 失败时抛出 Error；被 abort 时原样抛出 AbortError（由调用方区分）。
 */
export async function requestAnalysis({
  files,
  codeFileCount,
  sampled,
  projectLabel,
  signal,
}: RequestAnalysisInput): Promise<AnalysisResult> {
  if (files.length === 0) {
    throw new Error("未在仓库中检测到代码文件，无法进行 AI 分析");
  }

  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: projectLabel,
      files,
      sampled,
      totalCodeFileCount: codeFileCount,
      settings: getRequestSettings(),
    }),
    signal,
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: AiAnalysis; debug?: AiDebugInfo; error?: string }
    | null;

  if (!res.ok || !payload || payload.ok !== true || !payload.data) {
    throw new Error(payload?.error || "AI 分析失败，请重试");
  }

  return { analysis: payload.data, debug: payload.debug ?? EMPTY_DEBUG };
}
