import type { FileNode, RepoInfo } from "@/types/github";

/** 文件内容搜索结果单条：文件路径 + 行号（1-based）+ 匹配行内容。 */
export interface SearchResult {
  file: string;
  line: number;
  content: string;
}

/**
 * 通用数据源接口：抽象「项目元信息 / 文件列表 / 读取文件 / 搜索内容」四类能力。
 * 实现方闭包持有各自的上下文（GitHub 的 repo+branch，或本地的目录句柄）。
 */
export interface DataSource {
  kind: "github" | "local";
  /** 项目元信息（本地数据源返回兼容 RepoInfo）。 */
  getInfo(): Promise<RepoInfo>;
  /** 文件树（path 为相对项目根的相对路径）。 */
  getTree(): Promise<FileNode[]>;
  /** 按相对路径读取文件内容。 */
  readFile(path: string): Promise<string>;
  /** 按关键字搜索文件内容。 */
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}
