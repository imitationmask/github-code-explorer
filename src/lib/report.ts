import type { AiAnalysis } from "@/types/ai";
import type { FileNode, RepoInfo } from "@/types/github";
import type { FunctionModule, FunctionNode } from "@/types/function";
import type { LogEntry } from "@/types/log";
import { collectFilePaths } from "./analyze";

/** 生成 Markdown 工程文件所需的全部数据。 */
export interface ReportData {
  url: string;
  repoInfo: RepoInfo | null;
  branch: string | null;
  nodes: FileNode[];
  analysis: AiAnalysis | null;
  functionTree: FunctionNode | null;
  modules: FunctionModule[];
  logs: LogEntry[];
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const ENTRY_KIND_LABEL: Record<string, string> = {
  "main-function": "主函数",
  "app-bootstrap": "应用入口",
  server: "服务端",
  cli: "CLI",
  "library-index": "库入口",
  other: "入口",
};

const TECH_CATEGORY_LABEL: Record<string, string> = {
  language: "语言",
  framework: "框架",
  library: "库",
  tooling: "工具",
  database: "数据库",
  infra: "基础设施",
  other: "其他",
};

const LOG_LEVEL_LABEL: Record<string, string> = {
  info: "INFO",
  success: "SUCCESS",
  error: "ERROR",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderCallChain(node: FunctionNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const drilldown =
    node.drilldown === null ? "" : `（下钻倾向：${node.drilldown}）`;
  const bridgeTag = node.nodeKind === "bridge" ? "（桥接节点）" : "";
  const urlSuffix = node.url ? ` [${node.url}]` : "";
  const lines = [
    `${indent}- **${node.name}**${drilldown}${bridgeTag}${urlSuffix}`,
    `${indent}  - 文件：${node.file ?? "-"}`,
    `${indent}  - 简介：${node.summary || "-"}`,
  ];
  for (const child of node.children) {
    lines.push(renderCallChain(child, depth + 1));
  }
  return lines.join("\n");
}

/** 汇总各维度分析数据，输出结构化 Markdown 工程文件文本。 */
export function buildMarkdownReport(data: ReportData): string {
  const { url, repoInfo, branch, nodes, analysis, functionTree, modules, logs } = data;
  const lines: string[] = [];

  lines.push(`# ${repoInfo?.full_name ?? "GitHub 项目分析报告"}`);
  lines.push("");
  lines.push(`> 生成时间：${formatTime(Date.now())}`);
  lines.push("");

  // 1. 项目信息
  lines.push("## 1. 项目信息");
  lines.push("");
  lines.push("| 字段 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| 项目地址 | ${url || "-"} |`);
  lines.push(`| 项目名称 | ${repoInfo?.full_name ?? "-"} |`);
  lines.push(`| 默认分支 | ${branch ?? repoInfo?.default_branch ?? "-"} |`);
  lines.push(`| 描述 | ${repoInfo?.description ?? "-"} |`);
  lines.push(`| Star | ${repoInfo?.stargazers_count ?? 0} |`);
  lines.push(`| Fork | ${repoInfo?.forks_count ?? 0} |`);
  lines.push(`| 主要语言 | ${repoInfo?.language ?? "-"} |`);
  lines.push("");

  // 2. 编程语言
  lines.push("## 2. 编程语言");
  lines.push("");
  if (analysis && analysis.languages.length > 0) {
    lines.push("| 语言 | 占比 | 置信度 | 依据 |");
    lines.push("| --- | --- | --- | --- |");
    for (const lang of analysis.languages) {
      lines.push(
        `| ${lang.name} | ${lang.percentage}% | ${
          CONFIDENCE_LABEL[lang.confidence] ?? lang.confidence
        } | ${lang.reason || "-"} |`,
      );
    }
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 3. 技术栈
  lines.push("## 3. 技术栈");
  lines.push("");
  if (analysis && analysis.techTags.length > 0) {
    lines.push("| 技术 | 类别 | 置信度 | 依据 |");
    lines.push("| --- | --- | --- | --- |");
    for (const tag of analysis.techTags) {
      lines.push(
        `| ${tag.name} | ${TECH_CATEGORY_LABEL[tag.category] ?? tag.category} | ${
          CONFIDENCE_LABEL[tag.confidence] ?? tag.confidence
        } | ${tag.reason || "-"} |`,
      );
    }
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 4. 主入口文件
  lines.push("## 4. 主入口文件");
  lines.push("");
  if (analysis && analysis.entryFiles.length > 0) {
    lines.push("| 路径 | 类型 | 置信度 | 依据 |");
    lines.push("| --- | --- | --- | --- |");
    for (const entry of analysis.entryFiles) {
      lines.push(
        `| \`${entry.path}\` | ${ENTRY_KIND_LABEL[entry.kind] ?? entry.kind} | ${
          CONFIDENCE_LABEL[entry.confidence] ?? entry.confidence
        } | ${entry.reason || "-"} |`,
      );
    }
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 5. 文件列表
  lines.push("## 5. 文件列表");
  lines.push("");
  const filePaths = collectFilePaths(nodes);
  if (filePaths.length > 0) {
    lines.push(`共 ${filePaths.length} 个文件：`);
    lines.push("");
    for (const p of filePaths) {
      lines.push(`- \`${p}\``);
    }
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 6. 完整调用链
  lines.push("## 6. 完整调用链");
  lines.push("");
  if (functionTree) {
    lines.push(renderCallChain(functionTree, 0));
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 7. 功能模块
  lines.push("## 7. 功能模块");
  lines.push("");
  if (modules.length > 0) {
    modules.forEach((mod, i) => {
      lines.push(`### ${i + 1}. ${mod.name}`);
      lines.push("");
      if (mod.description) {
        lines.push(`- 描述：${mod.description}`);
      }
      if (mod.functions && mod.functions.length > 0) {
        lines.push(`- 函数：${mod.functions.map((f) => `\`${f}\``).join("、")}`);
      }
      lines.push("");
    });
  } else {
    lines.push("- 暂无数据");
  }
  lines.push("");

  // 8. Agent 工作日志
  lines.push("## 8. Agent 工作日志");
  lines.push("");
  if (logs.length > 0) {
    for (const log of logs) {
      lines.push(
        `### [${LOG_LEVEL_LABEL[log.level] ?? log.level}] ${log.title} \`${formatTime(
          log.timestamp,
        )}\``,
      );
      lines.push("");
      if (log.summary) {
        lines.push(`- ${log.summary}`);
      }
      if (log.detail !== undefined) {
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(log.detail, null, 2));
        lines.push("```");
      }
      lines.push("");
    }
  } else {
    lines.push("- 暂无数据");
  }

  return lines.join("\n");
}
