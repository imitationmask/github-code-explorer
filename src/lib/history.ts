import type { AiAnalysis } from "@/types/ai";
import type { FileNode, ParsedRepo, RepoInfo } from "@/types/github";
import type { FunctionModule, FunctionNode } from "@/types/function";
import type { LogEntry } from "@/types/log";

/** 单次项目分析的完整快照（含生成的 Markdown 工程文件）。 */
export interface HistoryItem {
  /** 稳定标识：GitHub 为 `owner/repo[@branch]`，本地为 `local/<name>` */
  id: string;
  /** 数据源类型（GitHub / 本地文件系统） */
  kind: "github" | "local";
  createdAt: number;
  updatedAt: number;
  url: string;
  repo: ParsedRepo | null;
  branch: string | null;
  repoInfo: RepoInfo | null;
  nodes: FileNode[];
  analysis: AiAnalysis | null;
  confirmedEntryPath: string | null;
  functionTree: FunctionNode | null;
  modules: FunctionModule[];
  logs: LogEntry[];
  markdown: string;
}

const STORAGE_KEY = "gce_history";
const MAX_ITEMS = 20;

/** 读取全部历史记录（按 updatedAt 降序）。 */
export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 兼容旧记录：缺失 kind 的视为 GitHub
    const items = (parsed as HistoryItem[]).map((it) => ({
      ...it,
      kind: it.kind === "local" ? ("local" as const) : ("github" as const),
    }));
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error("读取历史记录失败", err);
    return [];
  }
}

function persist(items: HistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("写入历史记录失败（可能超出配额），降级为仅保留元信息", err);
    try {
      const slim = items.map((it) => ({
        ...it,
        nodes: [],
        markdown: "",
        functionTree: null,
        logs: [],
      }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (innerErr) {
      console.error("降级写入历史记录仍失败", innerErr);
    }
  }
}

/** 新增或更新一条历史记录，同 id 覆盖；超出上限裁剪最旧。 */
export function upsertHistory(item: HistoryItem): void {
  const items = loadHistory();
  const idx = items.findIndex((it) => it.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item, createdAt: items[idx].createdAt };
  } else {
    items.unshift(item);
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  persist(items.slice(0, MAX_ITEMS));
}

/** 删除指定历史记录。 */
export function deleteHistory(id: string): void {
  persist(loadHistory().filter((it) => it.id !== id));
}

/** 按 id 查找单条历史记录。 */
export function findHistory(id: string): HistoryItem | null {
  return loadHistory().find((it) => it.id === id) ?? null;
}
