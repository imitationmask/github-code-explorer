import type { FileNode, ParsedRepo } from "@/types/github";
import { collectFilePaths } from "@/lib/analyze";
import { filterCodeFiles } from "@/lib/code-filter";
import { fetchFileContent, fetchRepoInfo, fetchRepoTree } from "@/lib/github";
import type { DataSource, SearchResult } from "./types";

/** GitHub 搜索最多读取的代码文件数（raw 文件不受 API 速率限制，但仍需控量）。 */
const SEARCH_FILE_LIMIT = 500;

/** 基于现有 GitHub fetch 能力构造数据源。 */
export function createGitHubDataSource(
  repo: ParsedRepo,
  branch: string,
): DataSource {
  let treeCache: FileNode[] | null = null;

  const getTreeCached = async (): Promise<FileNode[]> => {
    if (!treeCache) treeCache = await fetchRepoTree(repo, branch);
    return treeCache;
  };

  return {
    kind: "github",

    getInfo: () => fetchRepoInfo(repo),

    getTree: () => getTreeCached(),

    readFile: (path: string) => fetchFileContent(repo, branch, path),

    search: async (query: string, signal?: AbortSignal) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];

      const tree = await getTreeCached();
      const paths = collectFilePaths(tree);
      const { files } = filterCodeFiles(paths);

      const results: SearchResult[] = [];
      for (const p of files.slice(0, SEARCH_FILE_LIMIT)) {
        if (signal?.aborted) break;
        let content: string;
        try {
          content = await fetchFileContent(repo, branch, p);
        } catch {
          continue; // 单文件读取失败跳过
        }
        const lines = content.split("\n");
        lines.forEach((lineText, i) => {
          if (lineText.toLowerCase().includes(q)) {
            results.push({ file: p, line: i + 1, content: lineText.trim() });
          }
        });
      }
      return results;
    },
  };
}
