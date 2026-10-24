import { NextResponse } from "next/server";

/** 供设置页展示与「环境变量优先」合并使用的服务端环境变量值及其来源。 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_DEPTH = 2;
const DEFAULT_COUNT = 10;

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value.trim());
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : fallback;
}

export async function GET(request: Request) {
  // 读取请求头以保持路由动态，确保每次请求都读取运行时环境变量（而非构建时固化）
  request.headers.get("accept");

  const baseUrl = process.env.OPENAI_BASE_URL?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim();
  const githubToken = process.env.GITHUB_TOKEN?.trim();

  const res = NextResponse.json({
    aiBaseUrl: { value: baseUrl || DEFAULT_BASE_URL, source: baseUrl ? "env" : "default" },
    aiApiKey: { value: apiKey || "", source: apiKey ? "env" : "none" },
    aiModel: { value: model || DEFAULT_MODEL, source: model ? "env" : "default" },
    githubToken: { value: githubToken || "", source: githubToken ? "env" : "none" },
    maxDrilldownDepth: {
      value: readInt(process.env.MAX_DRILLDOWN_DEPTH, DEFAULT_DEPTH),
      source: process.env.MAX_DRILLDOWN_DEPTH ? "env" : "default",
    },
    subfunctionCount: {
      value: readInt(process.env.SUBFUNCTION_COUNT, DEFAULT_COUNT),
      source: process.env.SUBFUNCTION_COUNT ? "env" : "default",
    },
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
