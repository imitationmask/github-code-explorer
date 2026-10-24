"use client";

import { useEffect, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FileCode2, Loader2, TriangleAlert } from "lucide-react";
import type { FileNode } from "@/types/github";
import type { DataSource } from "@/lib/datasource/types";
import { getLanguageByPath } from "@/lib/language-map";

interface CodePanelProps {
  dataSource: DataSource | null;
  file: FileNode | null;
  /** 需要高亮并滚动定位到的行号（1-based）与函数名 */
  highlight?: { line: number; symbol?: string } | null;
}

type Status = "idle" | "loading" | "success" | "error";

export function CodePanel({
  dataSource,
  file,
  highlight = null,
}: CodePanelProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dataSource || !file) {
      setCode("");
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError("");

    dataSource
      .readFile(file.path)
      .then((text) => {
        if (cancelled) return;
        if (text.includes("\u0000")) {
          setError("该文件为二进制文件，暂不支持预览");
          setStatus("error");
          return;
        }
        setCode(text);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "加载文件失败");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [dataSource, file]);

  // 高亮行变化时滚动到目标行
  useEffect(() => {
    if (!highlight || status !== "success") return;
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const lineHeight = 20.8;
      const targetTop = (highlight.line - 1) * lineHeight;
      container.scrollTo({
        top: Math.max(0, targetTop - container.clientHeight / 3),
        behavior: "smooth",
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [highlight, status]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0f19]">
      {/* 顶部文件路径栏 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 bg-surface/40 px-4">
        <FileCode2 size={15} className="text-muted-2" />
        <span className="truncate font-mono text-xs text-muted">
          {file ? file.path : "未选择文件"}
        </span>
      </div>

      {/* 内容区 */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto">
        {status === "idle" && <EmptyState />}

        {status === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={22} className="animate-spin text-indigo-400" />
            <span className="text-sm">正在加载代码…</span>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <TriangleAlert size={22} className="text-warning" />
            <span className="text-sm text-muted">{error}</span>
          </div>
        )}

        {status === "success" && (
          <SyntaxHighlighter
            language={getLanguageByPath(file?.path ?? "")}
            style={vscDarkPlus}
            showLineNumbers
            wrapLines
            wrapLongLines={false}
            lineProps={(lineNumber) => {
              if (highlight && lineNumber === highlight.line) {
                return {
                  style: {
                    display: "block",
                    backgroundColor: "rgba(99, 102, 241, 0.25)",
                    borderRadius: "4px",
                  },
                };
              }
              return { style: { display: "block" } };
            }}
            customStyle={{
              margin: 0,
              padding: "16px",
              background: "transparent",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
            lineNumberStyle={{
              color: "#4b5563",
              minWidth: "2.6em",
              paddingRight: "1em",
            }}
            codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
          >
            {code}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileCode2 size={28} className="text-muted-2" />
      <p className="text-sm text-muted">从文件树中选择一个文件以查看代码</p>
    </div>
  );
}
