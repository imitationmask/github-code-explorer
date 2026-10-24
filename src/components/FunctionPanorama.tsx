"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, GitBranch, Loader2, MousePointer2, Route, TriangleAlert } from "lucide-react";
import type { Drilldown, FunctionModule, FunctionNode } from "@/types/function";
import { MODULE_COLORS } from "@/lib/modules";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 148;
const CHILD_INDENT = 180;
const V_GAP = 48;
const SIBLING_GAP = 32;

interface LaidNode {
  node: FunctionNode;
  x: number;
  y: number;
  depth: number;
}

interface Edge {
  d: string;
}

function layoutTree(
  root: FunctionNode,
  collapsedIds: Set<string>,
): {
  laid: LaidNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  const laid: LaidNode[] = [];
  const edges: Edge[] = [];
  let maxX = 0;
  let maxY = 0;

  // 瀑布式布局：子函数挂在父节点下方的垂直虚线上，逐层向右缩进
  const walk = (node: FunctionNode, x: number, y: number, depth: number): number => {
    laid.push({ node, x, y, depth });
    maxX = Math.max(maxX, x + NODE_WIDTH);
    const bottom = y + NODE_HEIGHT;
    maxY = Math.max(maxY, bottom);

    if (node.children.length === 0 || collapsedIds.has(node.id)) return bottom;

    const cx = x + NODE_WIDTH / 2;
    let cursor = bottom + V_GAP;
    let lastCenterY = bottom;

    for (const child of node.children) {
      const childX = x + CHILD_INDENT;
      const childY = cursor;
      const childCenterY = childY + NODE_HEIGHT / 2;
      const subBottom = walk(child, childX, childY, depth + 1);
      cursor = subBottom + SIBLING_GAP;
      lastCenterY = childCenterY;
      edges.push({ d: `M ${cx} ${childCenterY} H ${childX}` });
    }

    // 垂直主干虚线：从父节点底部延伸到最后一个子函数的中心高度
    edges.push({ d: `M ${cx} ${bottom} V ${lastCenterY}` });

    return Math.max(bottom, cursor - SIBLING_GAP);
  };

  walk(root, 0, 0, 0);

  return {
    laid,
    edges,
    width: Math.max(maxX, NODE_WIDTH),
    height: maxY,
  };
}

const DRILLDOWN_META: Record<Drilldown, { label: string; cls: string }> = {
  1: { label: "深挖", cls: "border-success/30 bg-success/10 text-success" },
  0: { label: "待定", cls: "border-warning/30 bg-warning/10 text-warning" },
  [-1]: { label: "跳过", cls: "border-white/10 bg-white/5 text-muted-2" },
};

interface FunctionPanoramaProps {
  root: FunctionNode | null;
  loading: boolean;
  error: string;
  modules?: FunctionModule[];
  activeModuleId?: string | null;
  drillingIds?: Set<string>;
  /** 允许下钻的最大深度（来自设置项「最大下钻层数」） */
  maxDepth?: number;
  onDrilldown?: (node: FunctionNode) => void;
  onLocate?: (node: FunctionNode) => void;
}

export function FunctionPanorama({
  root,
  loading,
  error,
  modules = [],
  activeModuleId = null,
  drillingIds = new Set(),
  maxDepth = 2,
  onDrilldown,
  onLocate,
}: FunctionPanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 40, ty: 40, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const { laid, edges, width, height } = useMemo(
    () =>
      root
        ? layoutTree(root, collapsedIds)
        : { laid: [], edges: [], width: 0, height: 0 },
    [root, collapsedIds],
  );

  const colorByModuleId = useMemo(() => {
    const map = new Map<string, string>();
    modules.forEach((mod, i) => {
      map.set(mod.id, MODULE_COLORS[i % MODULE_COLORS.length]);
    });
    return map;
  }, [modules]);

  // 初始居中
  useEffect(() => {
    if (root && containerRef.current) {
      const cw = containerRef.current.clientWidth;
      setView({ tx: Math.max(16, (cw - width) / 2), ty: 40, scale: 1 });
    }
  }, [root, width]);

  // root 变化（重新分析）时重置展开/收起状态
  useEffect(() => {
    setCollapsedIds(new Set());
  }, [root]);

  // 滚轮缩放（原生监听，避免 passive 导致 preventDefault 失效）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((prev) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const scale = Math.min(2, Math.max(0.4, prev.scale * factor));
        // 围绕鼠标位置缩放
        const contentX = (mx - prev.tx) / prev.scale;
        const contentY = (my - prev.ty) / prev.scale;
        return {
          scale,
          tx: mx - contentX * scale,
          ty: my - contentY * scale,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setView((prev) => ({
      ...prev,
      tx: drag.tx + (e.clientX - drag.startX),
      ty: drag.ty + (e.clientY - drag.startY),
    }));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => setCollapsedIds(new Set());

  const handleCollapseAll = () => {
    if (root) setCollapsedIds(new Set(collectCollapsibleIds(root)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 px-4">
        <GitBranch size={15} className="text-primary-2" />
        <span className="text-sm font-semibold text-foreground">函数全景图</span>
        <div className="ml-auto flex items-center gap-2">
          {root && (
            <>
              <span className="text-[10px] text-muted-2">{countNodes(root)} 个节点</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  title="全部展开"
                  className="cursor-pointer rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  title="全部收起"
                  className="cursor-pointer rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  全部收起
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-black/20 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={22} className="animate-spin text-indigo-400" />
            <span className="text-sm">正在识别子函数…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <TriangleAlert size={22} className="text-warning" />
            <span className="text-sm text-muted">{error}</span>
          </div>
        )}

        {!loading && !error && !root && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MousePointer2 size={28} className="text-muted-2" />
            <p className="text-sm text-muted">识别入口函数后，将在此展示调用全景</p>
          </div>
        )}

        {!loading && !error && root && (
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <svg width={width} height={height} className="overflow-visible">
              {edges.map((edge, i) => (
                <path
                  key={`edge-${i}`}
                  d={edge.d}
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1.5}
                  strokeDasharray="7 7"
                />
              ))}
              {laid.map((n) => (
                <foreignObject
                  key={n.node.id}
                  x={n.x}
                  y={n.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                >
                  <NodeCard
                    node={n.node}
                    depth={n.depth}
                    maxDepth={maxDepth}
                    colorByModuleId={colorByModuleId}
                    activeModuleId={activeModuleId}
                    drilling={drillingIds.has(n.node.id)}
                    onDrilldown={onDrilldown}
                    onLocate={onLocate}
                  />
                </foreignObject>
              ))}
              {laid.map((n) => {
                if (n.node.children.length === 0) return null;
                const toggleCx = n.x + NODE_WIDTH / 2;
                const toggleCy = n.y + NODE_HEIGHT + 10;
                const collapsed = collapsedIds.has(n.node.id);
                return (
                  <g
                    key={`toggle-${n.node.id}`}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => toggleCollapse(n.node.id)}
                  >
                    <circle
                      cx={toggleCx}
                      cy={toggleCy}
                      r={10}
                      fill="#0f172a"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={1}
                    />
                    <text
                      x={toggleCx}
                      y={toggleCy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={13}
                      fontWeight={700}
                      fill="#e2e8f0"
                    >
                      {collapsed ? "+" : "−"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function countNodes(node: FunctionNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

/** 收集所有「有子节点」的节点 id（用于「全部收起」）。 */
function collectCollapsibleIds(node: FunctionNode): string[] {
  const ids: string[] = [];
  if (node.children.length > 0) ids.push(node.id);
  for (const child of node.children) ids.push(...collectCollapsibleIds(child));
  return ids;
}

function NodeCard({
  node,
  depth,
  maxDepth,
  colorByModuleId,
  activeModuleId,
  drilling,
  onDrilldown,
  onLocate,
}: {
  node: FunctionNode;
  depth: number;
  maxDepth: number;
  colorByModuleId: Map<string, string>;
  activeModuleId: string | null;
  drilling: boolean;
  onDrilldown?: (node: FunctionNode) => void;
  onLocate?: (node: FunctionNode) => void;
}) {
  const isBridge = node.nodeKind === "bridge";
  const isRoot = node.drilldown === null && !isBridge;
  const meta = isRoot || isBridge ? null : DRILLDOWN_META[node.drilldown as Drilldown];
  const moduleColor = node.moduleId ? colorByModuleId.get(node.moduleId) : undefined;
  const dimmed = activeModuleId !== null && node.moduleId !== activeModuleId;
  const canDrilldown =
    !isRoot && !isBridge && node.drilldown !== -1 && !node.analyzed && depth < maxDepth;

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 backdrop-blur-xl transition-all duration-200 ${
        isBridge
          ? "border-dashed border-primary-2/40 bg-surface/60"
          : isRoot
            ? "border-primary/50 bg-primary/10"
            : "border-white/15 bg-surface/70 hover:border-white/30"
      } ${dimmed ? "opacity-30 grayscale" : ""}`}
    >
      {/* 标题栏：所属文件（背景色 = 所属模块颜色） */}
      <div
        className="flex items-center justify-between gap-1.5 border-b border-white/10 px-3 py-1.5"
        style={moduleColor ? { backgroundColor: `${moduleColor}33` } : undefined}
      >
        <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] text-muted-2">
          {isBridge && <Route size={11} className="shrink-0 text-primary-2" />}
          <span className="truncate">{isBridge ? "框架桥接" : node.file ?? "未知文件"}</span>
        </span>
        {meta && (
          <span
            className={`shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none ${meta.cls}`}
          >
            {meta.label}
          </span>
        )}
      </div>
      {/* 内容：函数名 + 简介 */}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <span className="truncate font-mono text-sm font-semibold text-foreground">
          {node.name}
        </span>
        {node.url && (
          <span
            title={node.url}
            className="mt-1 truncate font-mono text-[10px] font-medium text-primary-2"
          >
            {node.url}
          </span>
        )}
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">
          {node.summary || "暂无简介"}
        </p>
      </div>
      {/* 操作栏：定位 + 下钻（桥接节点无源码可定位/下钻，不渲染） */}
      {!isBridge && (
        <div className="flex shrink-0 items-center gap-1 border-t border-white/10 px-2 py-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLocate?.(node);
            }}
            title="定位源码"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Crosshair size={11} />
            定位
          </button>
          {canDrilldown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDrilldown?.(node);
              }}
              disabled={drilling}
              title="下钻分析该函数的子函数"
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-indigo-200 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {drilling ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <GitBranch size={11} />
              )}
              {drilling ? "分析中" : "下钻"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
