import type {
  FunctionModule,
  FunctionNode,
  ModuleAnalysis,
} from "@/types/function";
import { getRequestSettings } from "./settings";

/** 模块色板：按模块在数组中的索引取色（覆盖 10 个模块）。 */
export const MODULE_COLORS = [
  "#6366F1",
  "#22D3EE",
  "#F59E0B",
  "#10B981",
  "#EC4899",
  "#8B5CF6",
  "#F97316",
  "#14B8A6",
  "#EF4444",
  "#3B82F6",
];

export interface ModuleContext {
  htmlUrl: string;
  description: string | null;
  languages: string[];
  techTags: string[];
}

export interface AnalyzeModulesParams {
  context: ModuleContext;
  nodes: { id: string; name: string; summary: string }[];
  signal?: AbortSignal;
}

/** 递归收集全景图所有函数节点（扁平化为 {id,name,summary}）。 */
export function collectFunctionNodes(
  node: FunctionNode,
): { id: string; name: string; summary: string }[] {
  const result: { id: string; name: string; summary: string }[] = [];
  const walk = (n: FunctionNode) => {
    // 跳过框架桥接节点本身（非业务函数），但继续遍历其子节点（Controller 方法）
    if (n.nodeKind !== "bridge") {
      result.push({ id: n.id, name: n.name, summary: n.summary });
    }
    for (const child of n.children) walk(child);
  };
  walk(node);
  return result;
}

/** 调用 /api/analyze-modules 划分功能模块。 */
export async function analyzeModules({
  context,
  nodes,
  signal,
}: AnalyzeModulesParams): Promise<ModuleAnalysis> {
  const res = await fetch("/api/analyze-modules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, nodes, settings: getRequestSettings() }),
    signal,
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: ModuleAnalysis; error?: string }
    | null;

  if (!res.ok || !payload || payload.ok !== true || !payload.data) {
    throw new Error(payload?.error || "模块划分失败，请重试");
  }

  return payload.data;
}

/** 根据模块划分结果，为函数树每个节点打上 moduleId。 */
export function applyModulesToTree(
  root: FunctionNode,
  modules: FunctionModule[],
): FunctionNode {
  const nameToModuleId = new Map<string, string>();
  for (const mod of modules) {
    for (const fn of mod.functions ?? []) {
      if (!nameToModuleId.has(fn)) nameToModuleId.set(fn, mod.id);
    }
  }

  const walk = (node: FunctionNode): FunctionNode => ({
    ...node,
    moduleId: nameToModuleId.get(node.name) ?? null,
    children: node.children.map(walk),
  });

  return walk(root);
}
