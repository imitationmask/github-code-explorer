import type { FunctionNode, SubfunctionAnalysis } from "@/types/function";
import type { AiDebugInfo } from "@/types/ai";
import type { DataSource } from "./datasource/types";
import { truncateFileContent } from "./verify-entry";
import { locateFunction } from "./function-locate";
import { getRequestSettings } from "./settings";

export interface SubfunctionContext {
  htmlUrl: string;
  description: string | null;
  languages: string[];
  techTags: string[];
}

export interface AnalyzeSubfunctionsParams {
  dataSource: DataSource;
  path: string;
  context: SubfunctionContext;
  signal?: AbortSignal;
}

export interface AnalyzeFunctionSubfunctionsParams {
  dataSource: DataSource;
  filePath: string;
  fullName: string;
  context: SubfunctionContext;
  signal?: AbortSignal;
}

export interface AnalyzeSubfunctionsResult {
  analysis: SubfunctionAnalysis;
  debug: AiDebugInfo;
}

const EMPTY_DEBUG: AiDebugInfo = {
  request: { model: "", messages: [] },
  response: { raw: "" },
};

type AnalyzePayload = {
  ok: boolean;
  data?: SubfunctionAnalysis;
  debug?: AiDebugInfo;
  error?: string;
} | null;

function parsePayload(res: Response, payload: AnalyzePayload) {
  if (!res.ok || !payload || payload.ok !== true || !payload.data) {
    throw new Error(payload?.error || "子函数识别失败，请重试");
  }
  return {
    analysis: payload.data,
    debug: payload.debug ?? EMPTY_DEBUG,
  };
}

/** 读取入口文件内容、截断后调用 /api/analyze-subfunctions 识别入口函数与关键子函数。 */
export async function analyzeSubfunctions({
  dataSource,
  path,
  context,
  signal,
}: AnalyzeSubfunctionsParams): Promise<AnalyzeSubfunctionsResult> {
  const raw = await dataSource.readFile(path);
  if (raw.includes("\u0000")) {
    throw new Error("入口文件为二进制，无法识别子函数");
  }

  const { text } = truncateFileContent(raw);

  const res = await fetch("/api/analyze-subfunctions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content: text, context, settings: getRequestSettings() }),
    signal,
  });

  const payload = (await res.json().catch(() => null)) as AnalyzePayload;
  return parsePayload(res, payload);
}

/** 定位指定函数体并调用 /api/analyze-subfunctions（targetFunction 模式）下钻其子函数。 */
export async function analyzeFunctionSubfunctions({
  dataSource,
  filePath,
  fullName,
  context,
  signal,
}: AnalyzeFunctionSubfunctionsParams): Promise<AnalyzeSubfunctionsResult> {
  const raw = await dataSource.readFile(filePath);
  if (raw.includes("\u0000")) {
    throw new Error("函数所在文件为二进制，无法下钻");
  }

  const located = locateFunction(raw, fullName);
  const content = located ? located.body : truncateFileContent(raw).text;

  const res = await fetch("/api/analyze-subfunctions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: filePath,
      content,
      context,
      targetFunction: fullName,
      settings: getRequestSettings(),
    }),
    signal,
  });

  const payload = (await res.json().catch(() => null)) as AnalyzePayload;
  return parsePayload(res, payload);
}

/** 把识别结果转换为全景图树（入口函数为根，子函数为子节点，children 为递归预留）。 */
export function buildFunctionTree(
  result: SubfunctionAnalysis,
  entryFile: string,
): FunctionNode {
  return {
    id: `entry:${entryFile}:${result.entryFunction.name}`,
    name: result.entryFunction.name,
    summary: result.entryFunction.summary,
    file: entryFile,
    drilldown: null,
    analyzed: false,
    children: result.subfunctions.map((s, i) => ({
      id: `${entryFile}:${s.name}:${i}`,
      name: s.name,
      summary: s.summary,
      file: s.likelyFile,
      drilldown: s.drilldown,
      analyzed: false,
      children: [],
    })),
  };
}
