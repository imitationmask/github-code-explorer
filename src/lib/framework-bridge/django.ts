import type { BridgeEntryPoint } from "@/types/function";
import { collectFilePaths } from "@/lib/analyze";
import type { BridgeDetectContext, FrameworkBridge } from "./types";
import {
  collectPythonFiles,
  extractStringLiteral,
  isAborted,
  isPythonDependencyFile,
  joinUrl,
  PythonFileLoader,
} from "./python";

/** detect 阶段最多抽样的 .py 文件数（urls.py 之外）。 */
const DETECT_SAMPLE_LIMIT = 20;
/** include 递归深度上限，防止循环引用。 */
const MAX_INCLUDE_DEPTH = 8;

function dirOf(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function joinPath(...parts: string[]): string {
  return parts
    .filter((s) => s && s !== ".")
    .join("/")
    .replace(/\/+/g, "/");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 源码是否含 Django 特征。 */
function hasDjangoSignal(content: string): boolean {
  return (
    /from\s+django/.test(content) ||
    /\bimport\s+django\b/.test(content) ||
    /\burlpatterns\s*=/.test(content)
  );
}

/** 提取 `urlpatterns = [...]` 的列表文本（括号配对），找不到返回 null。 */
function extractUrlpatterns(content: string): string | null {
  const m = content.match(/\burlpatterns\s*=\s*\[/);
  if (!m) return null;
  const openIdx = (m.index ?? 0) + m[0].length - 1; // '[' 的位置
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return content.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** 提取文本中顶层 path()/re_path() 调用（括号配对，可正确处理 re_path 正则内的括号）。 */
function extractCalls(text: string): { name: "path" | "re_path"; args: string }[] {
  const calls: { name: "path" | "re_path"; args: string }[] = [];
  const re = /\b(path|re_path)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1] as "path" | "re_path";
    const openIdx = m.index + m[0].length - 1;
    let depth = 0;
    let i = openIdx;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push({ name, args: text.slice(openIdx + 1, i) });
    re.lastIndex = i + 1;
  }
  return calls;
}

/** 按顶层逗号拆分（忽略字符串与嵌套括号内的逗号）。 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      current += ch;
      if (ch === "\\") {
        current += s[i + 1] ?? "";
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** 解析 view 引用：views.func（FBV）/ views.ClassName.as_view()（CBV）/ 直接 func。 */
function parseViewRef(
  ref: string,
): { module?: string; name: string; isClass: boolean } | null {
  const trimmed = ref.trim();
  const asView = trimmed.match(
    /^(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)\.as_view\s*\(\s*\)/,
  );
  if (asView) {
    return { module: asView[1], name: asView[2], isClass: true };
  }
  const fbv = trimmed.match(/^(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)$/);
  if (fbv) {
    return { module: fbv[1], name: fbv[2], isClass: false };
  }
  return null;
}

/** 从 `from X import name` 推导直接函数名所属模块。 */
function findImportForName(content: string, name: string): string | null {
  const re = new RegExp(
    `from\\s+([\\w.]+)\\s+import\\s+[^\\n]*\\b${escapeRegExp(name)}\\b`,
  );
  const m = content.match(re);
  return m ? m[1] : null;
}

/** 将 include('app.urls') 解析为子 urls.py 的文件路径。 */
function resolveIncludeModule(urlsPath: string, included: string): string | null {
  const dir = dirOf(urlsPath);
  const parts = included.split(".").filter(Boolean);
  if (parts.length < 2 || parts[parts.length - 1] !== "urls") return null;
  return joinPath(dir, parts.slice(0, -1).join("/"), "urls.py");
}

/** 定位视图定义所在文件（优先含 def/class 定义的候选，兜底第一个存在的候选）。 */
async function resolveViewFile(
  viewRef: { module?: string; name: string; isClass: boolean },
  urlsDir: string,
  urlsContent: string,
  loader: PythonFileLoader,
): Promise<string | null> {
  const defPattern = viewRef.isClass
    ? new RegExp(`\\bclass\\s+${escapeRegExp(viewRef.name)}\\b`)
    : new RegExp(`\\bdef\\s+${escapeRegExp(viewRef.name)}\\s*\\(`);

  const candidates: string[] = [];
  if (viewRef.module) {
    const mod = viewRef.module;
    if (mod === "views") {
      candidates.push(joinPath(urlsDir, "views.py"));
    } else if (mod.endsWith(".views")) {
      candidates.push(
        joinPath(urlsDir, mod.slice(0, -".views".length).replace(/\./g, "/"), "views.py"),
      );
    } else {
      candidates.push(joinPath(urlsDir, mod.replace(/\./g, "/") + ".py"));
    }
  } else {
    const importMod = findImportForName(urlsContent, viewRef.name);
    if (importMod) {
      candidates.push(
        joinPath(urlsDir, importMod.replace(/^\.+/, "").replace(/\./g, "/") + ".py"),
      );
    }
    candidates.push(joinPath(urlsDir, "views.py"));
  }

  let fallback: string | null = null;
  for (const c of candidates) {
    const content = await loader.read(c);
    if (!content) continue;
    if (!fallback) fallback = c;
    if (defPattern.test(content)) return c;
  }
  return fallback;
}

/** 递归解析单个 url 模块的 path/re_path 条目，累积 URL 前缀，产出入口点。 */
async function collectRoutes(
  urlsPath: string,
  prefix: string,
  loader: PythonFileLoader,
  ctx: BridgeDetectContext,
  visited: Set<string>,
  depth: number,
  out: BridgeEntryPoint[],
): Promise<void> {
  if (depth > MAX_INCLUDE_DEPTH || visited.has(urlsPath)) return;
  visited.add(urlsPath);

  const content = await loader.read(urlsPath);
  if (!content) return;

  const listText = extractUrlpatterns(content);
  if (listText == null) return;

  const dir = dirOf(urlsPath);

  for (const call of extractCalls(listText)) {
    if (isAborted(ctx)) return;
    const parts = splitTopLevel(call.args);
    const urlPath = extractStringLiteral(parts[0] ?? "") ?? "";
    const second = parts[1]?.trim() ?? "";

    // include('app.urls') → 递归解析子 urls
    const includeMatch = second.match(/^include\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (includeMatch) {
      const sub = resolveIncludeModule(urlsPath, includeMatch[1]);
      if (sub) {
        await collectRoutes(
          sub,
          joinUrl(prefix, urlPath),
          loader,
          ctx,
          visited,
          depth + 1,
          out,
        );
      }
      continue;
    }

    // FBV / CBV
    const viewRef = parseViewRef(second);
    if (!viewRef) continue;
    const file = await resolveViewFile(viewRef, dir, content, loader);
    if (!file) continue;
    out.push({
      className: "",
      methodName: viewRef.name,
      file,
      url: joinUrl(prefix, urlPath) || "/",
      httpMethods: [], // Django 视图不区分 HTTP 方法 → 展示 ANY
    });
  }
}

export const djangoBridge: FrameworkBridge = {
  id: "django",
  name: "Django",
  bridgeLabel: "Django URL 分发",

  async detect(ctx) {
    const tags = ctx.techTags.map((t) => t.toLowerCase());
    if (tags.some((t) => t.includes("django"))) return true;
    if (isAborted(ctx)) return false;

    const allPaths = collectFilePaths(ctx.nodes);
    const pythonFiles = collectPythonFiles(ctx.nodes);
    if (pythonFiles.length === 0) return false;

    const loader = new PythonFileLoader(ctx);

    // 1) 依赖清单含 django
    for (const p of allPaths.filter(isPythonDependencyFile)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && /django/i.test(content)) return true;
    }

    // 2) 优先检查 urls.py
    const urlsFiles = pythonFiles.filter((p) => p.split("/").pop() === "urls.py");
    for (const p of urlsFiles) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && /\burlpatterns\s*=/.test(content)) return true;
    }

    // 3) 抽样其余 .py 查 django 特征
    const rest = pythonFiles.filter((p) => p.split("/").pop() !== "urls.py");
    for (const p of rest.slice(0, DETECT_SAMPLE_LIMIT)) {
      if (isAborted(ctx)) return false;
      const content = await loader.read(p);
      if (content && hasDjangoSignal(content)) return true;
    }

    return false;
  },

  async findEntryPoints(ctx) {
    const loader = new PythonFileLoader(ctx);
    const pythonFiles = collectPythonFiles(ctx.nodes);
    const urlModules: string[] = [];

    // 第一遍：找出所有含 urlpatterns 的文件
    for (const p of pythonFiles) {
      if (isAborted(ctx)) return [];
      const content = await loader.read(p);
      if (content && /\burlpatterns\s*=/.test(content)) urlModules.push(p);
    }
    if (urlModules.length === 0) return [];

    // 收集被 include 的子模块，确定根 urls（根不被任何其他 urls include）
    const included = new Set<string>();
    for (const p of urlModules) {
      const content = loader.getCached(p);
      if (!content) continue;
      const listText = extractUrlpatterns(content);
      if (listText == null) continue;
      for (const call of extractCalls(listText)) {
        const parts = splitTopLevel(call.args);
        const second = parts[1]?.trim() ?? "";
        const includeMatch = second.match(/^include\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (includeMatch) {
          const sub = resolveIncludeModule(p, includeMatch[1]);
          if (sub) included.add(sub);
        }
      }
    }

    const roots = urlModules.filter((p) => !included.has(p));
    const out: BridgeEntryPoint[] = [];
    const visited = new Set<string>();
    for (const root of roots) {
      if (isAborted(ctx)) break;
      await collectRoutes(root, "", loader, ctx, visited, 0, out);
    }
    return out;
  },
};
