"use client";

import { useState } from "react";
import {
  ChevronRight,
  FileCode2,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { AiAnalysis, AiStatus, Confidence } from "@/types/ai";
import { Button } from "./ui/button";

interface AiAnalysisPanelProps {
  /** 文件树未就绪时为 true，禁用开始按钮 */
  disabled: boolean;
  status: AiStatus;
  analysis: AiAnalysis | null;
  error: string;
  /** 研判后最终确认的入口文件路径（用于高亮） */
  confirmedEntryPath?: string | null;
  onAnalyze: () => void;
  onOpenFile: (path: string) => void;
}

const CONFIDENCE_DOT: Record<Confidence, string> = {
  high: "bg-success",
  medium: "bg-warning",
  low: "border border-muted-2 bg-transparent",
};

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: "text-success",
  medium: "text-warning",
  low: "text-muted-2",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const ENTRY_KIND_LABEL: Record<string, string> = {
  "main-function": "主函数",
  "app-bootstrap": "应用入口",
  server: "服务端",
  cli: "CLI",
  "library-index": "库入口",
  other: "入口",
};

const TECH_CATEGORY_LABEL: Record<string, string> = {
  language: "语言",
  framework: "框架",
  library: "库",
  tooling: "工具",
  database: "数据库",
  infra: "基础设施",
  other: "其他",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[confidence]}`} />
      <span className={`text-[10px] leading-none ${CONFIDENCE_TEXT[confidence]}`}>
        {CONFIDENCE_LABEL[confidence]}
      </span>
    </span>
  );
}

function ReasonRow({ reason }: { reason: string }) {
  if (!reason) return null;
  return (
    <p className="px-1 pb-2 text-[11px] leading-4 text-muted-2">
      <span className="text-muted">依据：</span>
      {reason}
    </p>
  );
}

export function AiAnalysisPanel({
  disabled,
  status,
  analysis,
  error,
  confirmedEntryPath,
  onAnalyze,
  onOpenFile,
}: AiAnalysisPanelProps) {
  const [expandedLang, setExpandedLang] = useState<number | null>(null);
  const [expandedTag, setExpandedTag] = useState<number | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  const isNoApiKey = error.includes("OPENAI_API_KEY");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-primary-2" />
        <span className="text-sm font-semibold text-foreground">AI 项目分析</span>
        {status === "success" && (
          <button
            type="button"
            onClick={onAnalyze}
            title="重新分析"
            className="ml-auto cursor-pointer rounded-md p-1 text-muted-2 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* 待分析态 */}
      {status === "idle" && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs leading-5 text-muted-2">
            基于代码文件列表，推断项目的主要语言、技术栈与主入口文件。
          </div>
          <Button size="sm" className="w-full" disabled={disabled} onClick={onAnalyze}>
            <Sparkles size={14} />
            开始 AI 分析
          </Button>
        </div>
      )}

      {/* 分析中态 */}
      {status === "loading" && (
        <div className="mt-4 space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
          <div className="flex items-center gap-2 pt-1 text-xs text-indigo-200">
            <Loader2 size={14} className="animate-spin" />
            AI 正在分析项目…
          </div>
        </div>
      )}

      {/* 失败态 */}
      {status === "error" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-xs text-danger">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          {isNoApiKey && (
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] leading-5 text-muted">
              {`OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini`}
            </pre>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={onAnalyze}>
            重试
          </Button>
        </div>
      )}

      {/* 成功态 */}
      {status === "success" && analysis && (
        <div className="mt-4 space-y-4">
          {/* 语言占比 */}
          {analysis.languages.length > 0 && (
            <SectionTitle>主要语言</SectionTitle>
          )}
          <div className="space-y-2.5">
            {analysis.languages.map((lang, i) => (
              <button
                key={lang.name}
                type="button"
                onClick={() => setExpandedLang(expandedLang === i ? null : i)}
                className="block w-full cursor-pointer rounded-lg text-left transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-medium text-foreground">{lang.name}</span>
                    <ConfidenceBadge confidence={lang.confidence} />
                  </span>
                  <span className="shrink-0 text-xs text-muted">{lang.percentage}%</span>
                </div>
                <div className="mx-1 mt-1.5 mb-1 h-[3px] overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, lang.percentage))}%` }}
                  />
                </div>
                {expandedLang === i && <ReasonRow reason={lang.reason} />}
              </button>
            ))}
          </div>

          {/* 技术栈标签 */}
          {analysis.techTags.length > 0 && (
            <>
              <SectionTitle>技术栈</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {analysis.techTags.map((tag, i) => (
                  <div key={`${tag.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedTag(expandedTag === i ? null : i)}
                      title={TECH_CATEGORY_LABEL[tag.category] ?? "其他"}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-foreground transition-colors hover:border-white/20 hover:bg-white/10"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[tag.confidence]}`} />
                      {tag.name}
                    </button>
                    {expandedTag === i && (
                      <div className="mt-1.5">
                        <ReasonRow reason={tag.reason} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 主入口文件 */}
          {analysis.entryFiles.length > 0 && (
            <>
              <SectionTitle>主入口文件</SectionTitle>
              <div className="space-y-1">
                {analysis.entryFiles.map((entry, i) => {
                  const isConfirmed = entry.path === confirmedEntryPath;
                  return (
                    <div
                      key={entry.path}
                      className={`rounded-lg ${
                        isConfirmed ? "border border-success/30 bg-success/5" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <ChevronRight
                          size={12}
                          className={`shrink-0 text-muted-2 transition-transform ${
                            expandedEntry === i ? "rotate-90" : ""
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="mr-2 inline-block rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px] text-muted">
                            {ENTRY_KIND_LABEL[entry.kind] ?? "入口"}
                          </span>
                          <span className="truncate font-mono text-[11px] text-foreground">
                            {entry.path}
                          </span>
                          {isConfirmed && (
                            <span className="ml-1.5 inline-flex items-center rounded bg-success/15 px-1 py-0.5 text-[9px] text-success">
                              已确认
                            </span>
                          )}
                        </span>
                        <ConfidenceBadge confidence={entry.confidence} />
                      </button>
                      {expandedEntry === i && (
                        <div className="pl-5">
                          <ReasonRow reason={entry.reason} />
                        </div>
                      )}
                      <div className="flex justify-end pr-1">
                        <button
                          type="button"
                          onClick={() => onOpenFile(entry.path)}
                          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-accent transition-colors hover:text-cyan-300"
                        >
                          <FileCode2 size={11} />
                          查看源码
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 元信息 */}
          <div className="border-t border-white/5 pt-2.5 text-[11px] leading-5 text-muted-2">
            <span className="text-muted">{analysis.meta.model}</span>
            <span className="mx-1.5">·</span>
            {analysis.meta.sampled
              ? `已抽样 ${analysis.meta.sampledFileCount}/${analysis.meta.totalCodeFileCount} 个代码文件`
              : `共 ${analysis.meta.sampledFileCount} 个代码文件`}
            <span className="mx-1.5">·</span>
            耗时 {(analysis.meta.durationMs / 1000).toFixed(1)} 秒
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-2">
      {children}
    </div>
  );
}
