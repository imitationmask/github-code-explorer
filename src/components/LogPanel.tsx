"use client";

import { useState } from "react";
import {
  ChevronRight,
  CircleCheck,
  Info,
  Loader2,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LogEntry, LogLevel } from "@/types/log";
import { truncateJson } from "@/lib/truncate-json";

export type WorkflowStatus = "idle" | "working" | "done";

interface LogPanelProps {
  logs: LogEntry[];
  workflowStatus?: WorkflowStatus;
}

const LEVEL_META: Record<LogLevel, { icon: LucideIcon; color: string }> = {
  info: { icon: Info, color: "text-info" },
  success: { icon: CircleCheck, color: "text-success" },
  error: { icon: TriangleAlert, color: "text-danger" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogPanel({ logs, workflowStatus = "idle" }: LogPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <ScrollText size={16} className="text-primary-2" />
        <span className="text-sm font-semibold text-foreground">工作日志</span>
        {workflowStatus === "working" && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
            <Loader2 size={11} className="animate-spin" />
            工作中
          </span>
        )}
        {workflowStatus === "done" && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] text-success">
            <CircleCheck size={11} />
            已结束
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-muted-2">
          暂无日志，输入项目地址开始分析
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {logs.map((log) => {
            const meta = LEVEL_META[log.level];
            const Icon = meta.icon;
            const hasDetail = log.detail !== undefined;
            const isExpanded = expanded.has(log.id);

            return (
              <div key={log.id}>
                <button
                  type="button"
                  onClick={() => hasDetail && toggle(log.id)}
                  disabled={!hasDetail}
                  className={`w-full rounded-lg px-1.5 py-1.5 text-left transition-colors ${
                    hasDetail ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon size={13} className={`shrink-0 ${meta.color}`} />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {log.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-2">
                      {formatTime(log.timestamp)}
                    </span>
                    {hasDetail && (
                      <ChevronRight
                        size={12}
                        className={`shrink-0 text-muted-2 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    )}
                  </span>
                  {log.summary && (
                    <span className="mt-0.5 block break-all pl-[19px] text-[11px] leading-4 text-muted-2">
                      {log.summary}
                    </span>
                  )}
                </button>

                {isExpanded && hasDetail && (
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[10px] leading-4 text-muted">
                    {JSON.stringify(truncateJson(log.detail), null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
