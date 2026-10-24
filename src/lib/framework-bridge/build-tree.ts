import type { BridgeEntryPoint, FunctionNode } from "@/types/function";
import type { FrameworkBridge } from "./types";

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

/** 将入口点 URL 渲染为「HTTP方法 路径」形式（如 GET /api/users/{id}），供卡片/报告直接展示。 */
function renderUrl(ep: BridgeEntryPoint): string {
  const method = ep.httpMethods.length ? ep.httpMethods.join("/") : "ANY";
  const path = ep.url || "/";
  return `${method} ${path}`;
}

/**
 * 构建桥接调用链树：
 * 根节点（入口文件） → 桥接节点（框架封装） → 各路由响应函数节点（可下钻）。
 * 节点命名：有 className 时用 `className.methodName`（如 Controller 方法），
 * 无 className 时直接用 `methodName`（如 Python 函数式视图），兼容现有定位/下钻逻辑。
 */
export function buildBridgedTree(
  entryPath: string,
  bridge: FrameworkBridge,
  entryPoints: BridgeEntryPoint[],
): FunctionNode {
  const rootName = basename(entryPath);

  return {
    id: `entry:${entryPath}:${rootName}`,
    name: rootName,
    summary: `${bridge.name} 主入口`,
    file: entryPath,
    drilldown: null,
    analyzed: false,
    nodeKind: "entry",
    children: [
      {
        id: `bridge:${bridge.id}:${entryPath}`,
        name: bridge.bridgeLabel,
        summary: `${bridge.name} 框架封装：主入口经路由分发到响应函数`,
        file: null,
        drilldown: null,
        analyzed: false,
        nodeKind: "bridge",
        children: entryPoints.map((ep, i) => {
          const nodeName = ep.className
            ? `${ep.className}.${ep.methodName}`
            : ep.methodName;
          return {
            id: `${ep.file}:${nodeName}:${i}`,
            name: nodeName,
            summary: ep.summary ?? "",
            file: ep.file,
            drilldown: 1,
            analyzed: false,
            nodeKind: "function",
            url: renderUrl(ep),
            children: [],
          };
        }),
      },
    ],
  };
}
