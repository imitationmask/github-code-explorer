"use client";

import { Boxes, Loader2, TriangleAlert } from "lucide-react";
import type { AiStatus } from "@/types/ai";
import type { FunctionModule } from "@/types/function";
import { MODULE_COLORS } from "@/lib/modules";

interface ModulePanelProps {
  modules: FunctionModule[];
  status: AiStatus;
  error: string;
  activeModuleId: string | null;
  onSelect: (id: string | null) => void;
}

export function ModulePanel({
  modules,
  status,
  error,
  activeModuleId,
  onSelect,
}: ModulePanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Boxes size={16} className="text-violet-400" />
        功能模块
      </div>

      {status === "loading" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-indigo-200">
          <Loader2 size={14} className="animate-spin" />
          正在划分功能模块…
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-xs text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === "idle" && (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-muted-2">
          完成函数识别后，这里将展示功能模块划分结果。
        </div>
      )}

      {status === "success" && modules.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {modules.map((mod, i) => {
            const color = MODULE_COLORS[i % MODULE_COLORS.length];
            const active = activeModuleId === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onSelect(active ? null : mod.id)}
                title={mod.description}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-all hover:brightness-110"
                style={{
                  borderColor: `${color}66`,
                  backgroundColor: `${color}22`,
                  color: "#F9FAFB",
                  boxShadow: active ? `0 0 0 2px ${color}66` : "none",
                  opacity: active ? 1 : 0.9,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {mod.name}
              </button>
            );
          })}
        </div>
      )}

      {status === "success" && modules.length === 0 && (
        <div className="mt-4 text-xs text-muted-2">暂未划分出模块</div>
      )}
    </div>
  );
}
