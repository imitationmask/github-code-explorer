import type { BridgeEntryPoint } from "@/types/function";
import { collectFilePaths } from "@/lib/analyze";
import type { BridgeDetectContext, FrameworkBridge } from "./types";
import {
  collectPythonFiles,
  extractStringLiteral,
  isAborted,
  isPythonDependencyFile,
  parseMethodsArg,
  PythonFileLoader,
  scanDecoratedFunctions,
  type PythonRouteScanner,
} from "./python";

/** detect 阶段最多抽样的 .py 文件数。 */
const DETECT_SAMPLE_LIMIT = 20;

/** Flask 路由装饰器：@app.route('/path', methods=['GET','POST']) / @bp.route(...) */
const flaskScanner: PythonRouteScanner = {
  isRouteDecorator(line) {
    return /^@[A-Za-z_][A-Za-z0-9_]*\.route\b/.test(line);
  },
  parseRouteDecorator(line) {
    const argsMatch = line.match(/^@[A-Za-z_][A-Za-z0-9_]*\.route\s*(?:\(([\s\S]*)\))?/);
    const args = argsMatch ? (argsMatch[1] ?? "") : "";
    const path = extractStringLiteral(args) ?? "/";
    const methods = parseMethodsArg(args);
    // Flask methods 缺省为 GET
    return { path, httpMethods: methods.length ? methods : ["GET"] };
  },
};

/** 源码是否含 Flask 特征。 */
function hasFlaskSignal(content: string): boolean {
  return (
    /from\s+flask\s+import/.test(content) ||
    /\bimport\s+flask\b/.test(content) ||
    /\bFlask\s*\(/.test(content) ||
    /@[A-Za-z_][A-Za-z0-9_]*\.route\b/.test(content)
  );
}

export const flaskBridge: FrameworkBridge = {
  id: "flask",
  name: "Flask",
  bridgeLabel: "Flask 路由分发",

  async detect(ctx) {
    const tags = ctx.techTags.map((t) => t.toLowerCase());
    if (tags.some((t) => t.includes("flask"))) return true;
    if (isAborted(ctx)) return false;

    const allPaths = collectFilePaths(ctx.nodes);
    const pythonFiles = collectPythonFiles(ctx.nodes);
    if (pythonFiles.length === 0) return false;

    const loader = new PythonFileLoader(ctx);

    // 1) 依赖清单含 flask
    for (const p of allPaths.filter(isPythonDependencyFile)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && /flask/i.test(content)) return true;
    }

    // 2) 源码特征抽样
    for (const p of pythonFiles.slice(0, DETECT_SAMPLE_LIMIT)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && hasFlaskSignal(content)) return true;
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
      entryPoints.push(...scanDecoratedFunctions(content, p, flaskScanner));
    }

    return entryPoints;
  },
};
