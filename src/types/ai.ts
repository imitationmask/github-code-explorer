export type Confidence = "high" | "medium" | "low";

export type TechCategory =
  | "language"
  | "framework"
  | "library"
  | "tooling"
  | "database"
  | "infra"
  | "other";

export type EntryFileKind =
  | "main-function"
  | "app-bootstrap"
  | "server"
  | "cli"
  | "library-index"
  | "other";

export interface AiLanguage {
  name: string;
  /** 0-100，各语言之和约等于 100 */
  percentage: number;
  confidence: Confidence;
  reason: string;
}

export interface AiTechTag {
  name: string;
  category: TechCategory;
  confidence: Confidence;
  reason: string;
}

export interface AiEntryFile {
  /** 必须原样来自输入文件列表 */
  path: string;
  kind: EntryFileKind;
  confidence: Confidence;
  reason: string;
}

export interface AiAnalysisMeta {
  model: string;
  /** 实际发送给 AI 的文件数 */
  sampledFileCount: number;
  /** 过滤后的代码文件总数 */
  totalCodeFileCount: number;
  /** 是否发生抽样 */
  sampled: boolean;
  durationMs: number;
}

export interface AiAnalysis {
  languages: AiLanguage[];
  techTags: AiTechTag[];
  entryFiles: AiEntryFile[];
  meta: AiAnalysisMeta;
}

/** 左侧面板 AI 卡片的请求状态 */
export type AiStatus = "idle" | "loading" | "success" | "error";

/* ------------------------------ 上限常量 ------------------------------ */

export const MAX_LANGUAGES = 5;
export const MAX_TECH_TAGS = 12;
export const MAX_ENTRY_FILES = 5;
export const MAX_REASON_LENGTH = 80;

/* -------------- 供 prompt 与校验共用的枚举常量数组 -------------- */

export const CONFIDENCE_VALUES: Confidence[] = ["high", "medium", "low"];

export const TECH_CATEGORY_VALUES: TechCategory[] = [
  "language",
  "framework",
  "library",
  "tooling",
  "database",
  "infra",
  "other",
];

export const ENTRY_FILE_KIND_VALUES: EntryFileKind[] = [
  "main-function",
  "app-bootstrap",
  "server",
  "cli",
  "library-index",
  "other",
];

export function isConfidence(value: unknown): value is Confidence {
  return (
    typeof value === "string" &&
    (CONFIDENCE_VALUES as string[]).includes(value)
  );
}

/* ----------------------- AI 调用原文（调试用） ----------------------- */

export interface AiDebugMessage {
  role: string;
  content: string;
}

export interface AiDebugInfo {
  request: {
    model: string;
    /** 发给大模型的原文（system 提示词 + 用户消息） */
    messages: AiDebugMessage[];
  };
  response: {
    /** 模型原始返回文本 */
    raw: string;
  };
}

/* ----------------------- 项目入口研判 ----------------------- */

export interface EntryVerification {
  isEntry: boolean;
  confidence: Confidence;
  reason: string;
}
