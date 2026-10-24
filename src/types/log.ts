export type LogLevel = "info" | "success" | "error";

export interface LogEntry {
  id: string;
  /** Date.now() */
  timestamp: number;
  level: LogLevel;
  /** 如 "GitHub 校验" / "过滤结果" / "AI 分析结果" */
  title: string;
  /** 一行摘要 */
  summary: string;
  /** 可 JSON 序列化详情，展开后展示 */
  detail?: unknown;
}
