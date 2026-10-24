import type { BridgeEntryPoint } from "@/types/function";
import { collectFilePaths } from "@/lib/analyze";
import type { BridgeDetectContext, FrameworkBridge } from "./types";
import {
  collectPythonFiles,
  extractStringLiteral,
  isAborted,
  isPythonDependencyFile,
  PythonFileLoader,
  scanDecoratedFunctions,
  type PythonRouteScanner,
} from "./python";

/** detect 阶段最多抽样的 .py 文件数。 */
const DETECT_SAMPLE_LIMIT = 20;

/** FastAPI 路由装饰器名 → HTTP 方法。 */
const HTTP_METHOD_BY_DECORATOR: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  options: "OPTIONS",
  head: "HEAD",
};

const DECORATOR_METHOD_PATTERN = "(get|post|put|delete|patch|options|head)";

/** FastAPI 路由装饰器：@app.get('/items/{id}') / @router.post(...) */
const fastapiScanner: PythonRouteScanner = {
  isRouteDecorator(line) {
    return new RegExp(
      `^@[A-Za-z_][A-Za-z0-9_]*\\.${DECORATOR_METHOD_PATTERN}\\b`,
    ).test(line);
  },
  parseRouteDecorator(line) {
    const m = line.match(
      new RegExp(
        `^@[A-Za-z_][A-Za-z0-9_]*\\.${DECORATOR_METHOD_PATTERN}\\s*\\(([\\s\\S]*)\\)`,
      ),
    );
    if (!m) return null;
    const method = HTTP_METHOD_BY_DECORATOR[m[1]];
    const path = extractStringLiteral(m[2] ?? "") ?? "/";
    return { path, httpMethods: [method] };
  },
};

/** 源码是否含 FastAPI 特征。 */
function hasFastapiSignal(content: string): boolean {
  return (
    /from\s+fastapi\s+import/.test(content) ||
    /\bimport\s+fastapi\b/.test(content) ||
    /\bFastAPI\s*\(/.test(content) ||
    new RegExp(`@[A-Za-z_][A-Za-z0-9_]*\\.${DECORATOR_METHOD_PATTERN}\\b`).test(content)
  );
}

export const fastapiBridge: FrameworkBridge = {
  id: "fastapi",
  name: "FastAPI",
  bridgeLabel: "FastAPI 路由分发",

  async detect(ctx) {
    const tags = ctx.techTags.map((t) => t.toLowerCase());
    if (tags.some((t) => t.includes("fastapi"))) return true;
    if (isAborted(ctx)) return false;

    const allPaths = collectFilePaths(ctx.nodes);
    const pythonFiles = collectPythonFiles(ctx.nodes);
    if (pythonFiles.length === 0) return false;

    const loader = new PythonFileLoader(ctx);

    // 1) 依赖清单含 fastapi
    for (const p of allPaths.filter(isPythonDependencyFile)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && /fastapi/i.test(content)) return true;
    }

    // 2) 源码特征抽样
    for (const p of pythonFiles.slice(0, DETECT_SAMPLE_LIMIT)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && hasFastapiSignal(content)) return true;
    }

    return false;
  },

  async findEntryPoints(ctx) {
    const loader = new PythonFileLoader(ctx);
    const pythonFiles = collectPythonFiles(ctx.nodes);
    const entryPoints: BridgeEntryPoint[] = [];

    for (const p of pythonFiles) {
      if (isAborted(ctx)) break;
      const content = await loader.read(p);
      if (!content) continue;
      entryPoints.push(...scanDecoratedFunctions(content, p, fastapiScanner));
    }

    return entryPoints;
  },
};
