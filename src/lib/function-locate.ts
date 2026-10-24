/** 定位结果：函数定义起始行（1-based）与函数体文本。 */
export interface LocatedFunction {
  startLine: number;
  body: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在源码行数组中查找函数定义行（0-based index），找不到返回 -1。 */
function findDefinitionLine(lines: string[], name: string): number {
  const escaped = escapeRegExp(name);

  // 完整名（ClassName::FunctionName / ClassName.FunctionName）：通常即为定义处
  if (name.includes("::") || name.includes(".")) {
    const fullRegex = new RegExp(`${escaped}\\s*\\(`);
    for (let i = 0; i < lines.length; i++) {
      if (fullRegex.test(lines[i])) return i;
    }
    return -1;
  }

  // 短名：优先命中带 `{` 的定义行，其次命中带 `(` 的声明行
  const shortRegex = new RegExp(`\\b${escaped}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (shortRegex.test(lines[i]) && lines[i].includes("{")) return i;
  }
  for (let i = 0; i < lines.length; i++) {
    if (shortRegex.test(lines[i])) return i;
  }
  return -1;
}

/** 截取函数体：大括号语言用括号配对，缩进语言（Python）用缩进层级。 */
function extractBody(lines: string[], startLine: number): string {
  const firstLine = lines[startLine];

  // 大括号语言
  if (firstLine.includes("{")) {
    const bodyLines: string[] = [];
    let depth = 0;
    let started = false;
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      bodyLines.push(line);
      for (const ch of line) {
        if (ch === "{") {
          depth++;
          started = true;
        } else if (ch === "}") {
          depth--;
        }
      }
      if (started && depth === 0) break;
    }
    return bodyLines.join("\n");
  }

  // 缩进语言（Python 等）：以定义行缩进为基准，收集缩进更深的行
  const baseIndent = (firstLine.match(/^\s*/)?.[0].length ?? 0);
  const bodyLines: string[] = [firstLine];
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      bodyLines.push(line);
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent > baseIndent) {
      bodyLines.push(line);
    } else {
      break;
    }
  }
  return bodyLines.join("\n");
}

/**
 * 在源码中定位指定函数（支持 ClassName::FunctionName / ClassName.FunctionName 完整名，
 * 以及 class 内联/裸函数的短名），返回定义起始行（1-based）与函数体文本。
 */
export function locateFunction(
  content: string,
  fullName: string,
): LocatedFunction | null {
  if (!content || !fullName) return null;
  const lines = content.split("\n");
  const shortName = fullName.split("::").pop()?.split(".").pop() ?? fullName;

  let startLine = findDefinitionLine(lines, fullName);
  if (startLine === -1) {
    startLine = findDefinitionLine(lines, shortName);
  }
  if (startLine === -1) return null;

  const body = extractBody(lines, startLine);
  return { startLine: startLine + 1, body };
}

/**
 * 解析函数所在文件路径：AI 推断的 likelyFile 可能存在幻觉（不在真实文件列表中）。
 * 优先精确匹配；其次按文件名（basename）匹配，多个同名时取路径最短的；仍找不到返回 null。
 */
export function resolveFunctionFile(
  file: string,
  filePaths: string[],
): string | null {
  if (filePaths.includes(file)) return file;
  const base = file.split("/").pop() ?? file;
  const matches = filePaths.filter((p) => p.split("/").pop() === base);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.length <= b.length ? a : b));
}
