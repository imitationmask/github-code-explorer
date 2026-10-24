import type { BridgeEntryPoint } from "@/types/function";
import { collectFilePaths } from "@/lib/analyze";
import type { BridgeDetectContext, FrameworkBridge } from "./types";

/** detect 阶段最多抽样的 Java 文件数（检查 @SpringBootApplication 注解）。 */
const DETECT_JAVA_SAMPLE_LIMIT = 20;

/** HTTP 映射注解 → 默认 HTTP 方法（@RequestMapping 需从参数推导）。 */
const METHOD_ANNOTATION_DEFAULT: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
};

/** 单个文件内 Controller 扫描的中断信号，由调用方检查。 */
function isAborted(ctx: BridgeDetectContext): boolean {
  return ctx.signal?.aborted === true;
}

/** 从注解参数中提取路径：优先 value/path 命名参数，其次首个字符串字面量。 */
function extractPath(args: string): string {
  const named = args.match(/(?:value|path)\s*=\s*"([^"]*)"/);
  if (named) return named[1];
  const first = args.match(/"([^"]*)"/);
  return first ? first[1] : "";
}

/** 从 @RequestMapping(method = {RequestMethod.GET, ...}) 推导 HTTP 方法，未指定返回空数组（任意方法）。 */
function extractHttpMethods(args: string): string[] {
  const methodArg = args.match(/method\s*=\s*([^,)]*)/);
  if (!methodArg) return [];
  const found = methodArg[1].match(/RequestMethod\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/g);
  return (found ?? []).map((m) => m.replace("RequestMethod.", ""));
}

/** 拼接类级前缀 + 方法级路径。 */
function joinUrl(prefix: string, path: string): string {
  const p = prefix || "";
  const q = path || "";
  if (!p) return q || "/";
  if (!q) return p;
  if (p.endsWith("/") || q.startsWith("/")) return `${p}${q}`;
  return `${p}/${q}`;
}

/** 判断一行是否为 Java 方法声明（排除控制流/关键字），返回方法名或 null。 */
function matchMethodName(line: string): string | null {
  const trimmed = line.trim();
  // 排除关键字开头的语句
  if (
    /^(if|for|while|switch|return|throw|new|case|else|try|catch|finally|synchronized|do|assert)\b/.test(
      trimmed,
    )
  ) {
    return null;
  }
  // 方法声明：修饰符 + 返回类型 + 方法名 + (
  const m = trimmed.match(
    /(?:public|private|protected|static|final|abstract|synchronized|native|\s)*[\w<>\[\],?.\s]+\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  );
  return m ? m[1] : null;
}

/**
 * 解析单个 Java 文件内的 Controller 方法。
 * 采用逐行状态机：累积 @注解 → 识别 class 声明（记类名与类级前缀）→ 识别方法声明（产出入口点）。
 */
function scanControllerFile(content: string, file: string): BridgeEntryPoint[] {
  const result: BridgeEntryPoint[] = [];
  const lines = content.split("\n");

  let pendingAnnotations: string[] = [];
  let className = "";
  let classPrefix = "";

  for (const raw of lines) {
    const line = raw.trim();

    // 注解行：累积（注解后一般紧跟声明，空行会打断关联）
    if (line.startsWith("@")) {
      pendingAnnotations.push(line);
      continue;
    }

    // 空行 / 注释 / 包与导入：不改变声明，但保留 pendingAnnotations 以便跨行
    if (line === "") continue;
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
    if (line.startsWith("import ") || line.startsWith("package ")) {
      pendingAnnotations = [];
      continue;
    }

    // 类声明
    const classMatch = line.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (classMatch && !line.includes("(")) {
      const isController = pendingAnnotations.some(
        (a) => /@RestController\b/.test(a) || /@Controller\b/.test(a),
      );
      if (isController) {
        className = classMatch[1];
        const classMapping = pendingAnnotations.find((a) => a.startsWith("@RequestMapping"));
        classPrefix = classMapping ? extractPath(extractMappingArgs(classMapping)) : "";
      }
      pendingAnnotations = [];
      continue;
    }

    // 方法声明：仅当已识别出 Controller 类且有映射注解时产出
    if (className && pendingAnnotations.length > 0) {
      const mappingAnn = pendingAnnotations.find((a) => isMappingAnnotation(a));
      const methodName = matchMethodName(line);
      if (mappingAnn && methodName) {
        const { httpMethods, path } = parseMappingAnnotation(mappingAnn);
        result.push({
          className,
          methodName,
          file,
          url: joinUrl(classPrefix, path),
          httpMethods,
        });
      }
      pendingAnnotations = [];
      continue;
    }

    // 其他语句（字段、构造器等）：清空 pending，避免误关联
    pendingAnnotations = [];
  }

  return result;
}

/** 提取注解参数（@Xxx 与 @Xxx(...) 两种情况统一返回括号内文本）。 */
function extractMappingArgs(annotation: string): string {
  const m = annotation.match(/^@[A-Za-z]+\s*(?:\(([\s\S]*)\))?/);
  return m ? (m[1] ?? "") : "";
}

/** 判断注解行是否为 HTTP 映射注解。 */
function isMappingAnnotation(annotation: string): boolean {
  return /^@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\b/.test(
    annotation,
  );
}

/** 解析映射注解 → HTTP 方法 + 路径。 */
function parseMappingAnnotation(annotation: string): {
  httpMethods: string[];
  path: string;
} {
  const typeMatch = annotation.match(
    /^@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)/,
  );
  const type = typeMatch ? typeMatch[1] : "RequestMapping";
  const args = extractMappingArgs(annotation);
  const path = extractPath(args);

  if (type !== "RequestMapping") {
    return { httpMethods: [METHOD_ANNOTATION_DEFAULT[type]], path };
  }
  // @RequestMapping：从 method 参数推导，未指定表示任意方法
  const httpMethods = extractHttpMethods(args);
  return { httpMethods, path };
}

/** 从技术栈标签或文件名/依赖推断是否为 Spring Boot（同步快速路径）。 */
function quickSpringTags(ctx: BridgeDetectContext): boolean {
  const tags = ctx.techTags.map((t) => t.toLowerCase());
  return tags.some((t) => t.includes("spring") || t.includes("springboot"));
}

/** 判断文件路径是否为构建脚本（pom.xml / build.gradle）。 */
function isBuildScript(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return base === "pom.xml" || base === "build.gradle" || base === "build.gradle.kts";
}

/**
 * Spring Boot 桥接实现：
 * - detect：技术栈标签命中，或构建脚本含 spring-boot-starter，或 Java 文件含 @SpringBootApplication。
 * - findEntryPoints：扫描 @RestController/@Controller 类中的映射方法，产出入口点。
 */
export const springBootBridge: FrameworkBridge = {
  id: "spring-boot",
  name: "Spring Boot",
  bridgeLabel: "Spring MVC 路由分发",

  async detect(ctx) {
    if (quickSpringTags(ctx)) return true;
    if (isAborted(ctx)) return false;

    const paths = collectFilePaths(ctx.nodes);
    const javaFiles = paths.filter((p) => p.endsWith(".java"));
    if (javaFiles.length === 0) return false;

    // 1) 构建脚本含 spring-boot-starter 依赖
    for (const p of paths.filter(isBuildScript)) {
      if (isAborted(ctx)) return false;
      try {
        const content = await ctx.dataSource.readFile(p);
        if (/spring-boot-starter/.test(content)) return true;
      } catch {
        // 单个文件读取失败忽略，继续
      }
    }

    // 2) 优先检查 *Application.java，再抽样其余 Java 文件找 @SpringBootApplication
    const applicationFiles = javaFiles.filter((p) => /Application\.java$/.test(p));
    const candidates = applicationFiles.length
      ? applicationFiles.slice(0, DETECT_JAVA_SAMPLE_LIMIT)
      : javaFiles.slice(0, DETECT_JAVA_SAMPLE_LIMIT);
    for (const p of candidates) {
      if (isAborted(ctx)) return false;
      try {
        const content = await ctx.dataSource.readFile(p);
        if (content.includes("@SpringBootApplication")) return true;
      } catch {
        // 忽略
      }
    }

    return false;
  },

  async findEntryPoints(ctx) {
    const paths = collectFilePaths(ctx.nodes);
    const javaFiles = paths.filter((p) => p.endsWith(".java"));
    const entryPoints: BridgeEntryPoint[] = [];

    for (const p of javaFiles) {
      if (isAborted(ctx)) break;
      let content: string;
      try {
        content = await ctx.dataSource.readFile(p);
      } catch {
        continue; // 单文件读取失败不阻塞整体
      }
      const found = scanControllerFile(content, p);
      entryPoints.push(...found);
    }

    return entryPoints;
  },
};
