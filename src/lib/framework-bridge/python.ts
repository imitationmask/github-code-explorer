import type { FileNode } from "@/types/github";
import type { BridgeEntryPoint } from "@/types/function";
import { collectFilePaths } from "@/lib/analyze";
import type { BridgeDetectContext } from "./types";

/** 单个文件内中断信号检查，供扫描循环使用。 */
export function isAborted(ctx: BridgeDetectContext): boolean {
  return ctx.signal?.aborted === true;
}

/** 收集所有 .py 文件路径（含子目录）。 */
export function collectPythonFiles(nodes: FileNode[]): string[] {
  return collectFilePaths(nodes).filter((p) => p.endsWith(".py"));
}

/** 判断路径是否为 Python 依赖清单文件（用于 detect 阶段查框架依赖）。 */
export function isPythonDependencyFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return (
    base === "requirements.txt" ||
    base === "Pipfile" ||
    base === "Pipfile.lock" ||
    base === "pyproject.toml" ||
    base === "setup.py" ||
    base === "setup.cfg"
  );
}

/** 拼接 URL 前缀与子路径，避免重复/缺失斜杠。 */
export function joinUrl(prefix: string, path: string): string {
  const p = prefix || "";
  const q = path || "";
  if (!p) return q || "/";
  if (!q) return p;
  if (p.endsWith("/") || q.startsWith("/")) return `${p}${q}`;
  return `${p}/${q}`;
}

/** 提取字符串中首个单/双引号字面量（用于取路由路径）。 */
export function extractStringLiteral(s: string): string | null {
  const m = s.match(/['"]([^'"]*)['"]/);
  return m ? m[1] : null;
}

/** 解析 Flask `methods=['GET','POST']` 参数，返回大写 HTTP 方法列表；缺省返回空数组。 */
export function parseMethodsArg(args: string): string[] {
  const m = args.match(/methods\s*=\s*[\[(]([^\])]*)[\])]/);
  if (!m) return [];
  const found = m[1].match(/['"]([A-Za-z]+)['"]/g) ?? [];
  return found.map((x) => x.replace(/['"]/g, "").toUpperCase());
}

/** 路由装饰器扫描器：由各框架实现「识别 + 解析」两个动作。 */
export interface PythonRouteScanner {
  /** 判断一行（已合并跨行的装饰器文本）是否为路由装饰器。 */
  isRouteDecorator(line: string): boolean;
  /** 解析路由装饰器，返回路径与 HTTP 方法；非路由返回 null。 */
  parseRouteDecorator(line: string): { path: string; httpMethods: string[] } | null;
}

/** 判断文本中圆括号是否已闭合（未闭合返回 false，用于检测跨行装饰器）。 */
function isBracketsBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return depth <= 0;
}

/**
 * 通用装饰器式扫描器：逐行累积 @装饰器（支持跨行） → 识别 def 函数定义 → 产出 BridgeEntryPoint。
 * 适配 Flask / FastAPI 等「装饰器标注路由」的框架。
 */
export function scanDecoratedFunctions(
  content: string,
  file: string,
  scanner: PythonRouteScanner,
): BridgeEntryPoint[] {
  const result: BridgeEntryPoint[] = [];
  const lines = content.split("\n");

  let pendingDecorators: string[] = [];
  let bufferedDecorator = ""; // 跨行装饰器的累积缓冲

  for (const raw of lines) {
    const line = raw.trim();

    // 正在累积跨行装饰器：追加直到括号闭合
    if (bufferedDecorator) {
      bufferedDecorator += " " + line;
      if (isBracketsBalanced(bufferedDecorator)) {
        pendingDecorators.push(bufferedDecorator);
        bufferedDecorator = "";
      }
      continue;
    }

    // 装饰器行
    if (line.startsWith("@")) {
      if (line.includes("(") && !isBracketsBalanced(line)) {
        bufferedDecorator = line; // 括号未闭合 → 进入跨行累积
      } else {
        pendingDecorators.push(line);
      }
      continue;
    }

    // 空行/注释：保留 pendingDecorators（装饰器与 def 之间一般无空行，但容错）
    if (line === "") continue;
    if (line.startsWith("#")) continue;

    // def 函数定义
    const defMatch = line.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (defMatch && pendingDecorators.length > 0) {
      const routeDecorator = pendingDecorators.find((d) => scanner.isRouteDecorator(d));
      if (routeDecorator) {
        const parsed = scanner.parseRouteDecorator(routeDecorator);
        if (parsed) {
          result.push({
            className: "",
            methodName: defMatch[1],
            file,
            url: parsed.path || "/",
            httpMethods: parsed.httpMethods,
          });
        }
      }
      pendingDecorators = [];
      continue;
    }

    // 其他语句（import/赋值/类/return 等）：清空 pending，避免误关联
    pendingDecorators = [];
  }

  return result;
}

/**
 * Python 文件读取器：按路径缓存内容，避免跨文件关联（Django）时重复请求。
 * 单个文件读取失败返回 null，调用方自行跳过。
 */
export class PythonFileLoader {
  private cache = new Map<string, string>();

  constructor(private readonly ctx: BridgeDetectContext) {}

  async read(path: string): Promise<string | null> {
    if (this.cache.has(path)) return this.cache.get(path)!;
    try {
      const content = await this.ctx.dataSource.readFile(path);
      this.cache.set(path, content);
      return content;
    } catch {
      return null;
    }
  }

  getCached(path: string): string | null {
    return this.cache.get(path) ?? null;
  }

  has(path: string): boolean {
    return this.cache.has(path);
  }
}
