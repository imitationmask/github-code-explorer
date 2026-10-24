import type { FileNode } from "@/types/github";
import { collectFilePaths } from "@/lib/analyze";
import { filterCodeFiles, IGNORED_DIRS } from "@/lib/code-filter";
import type { DataSource, SearchResult } from "./types";

/** 本地搜索最多读取的代码文件数。 */
const SEARCH_FILE_LIMIT = 800;

/** 递归遍历目录句柄，构建相对路径 FileNode 树（跳过噪声目录）。 */
async function buildLocalTree(
  root: FileSystemDirectoryHandle,
): Promise<FileNode[]> {
  const result: FileNode[] = [];
  await walkDirectory(root, "", result);
  sortTree(result);
  return result;
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FileNode[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      if (IGNORED_DIRS.has(name)) continue; // 跳过 node_modules/.git/dist 等噪声目录
      const path = prefix ? `${prefix}/${name}` : name;
      const node: FileNode = { name, path, type: "tree", children: [] };
      out.push(node);
      await walkDirectory(handle as FileSystemDirectoryHandle, path, node.children!);
    } else {
      const path = prefix ? `${prefix}/${name}` : name;
      out.push({ name, path, type: "blob" });
    }
  }
}

/** 目录在前、同类型按名排序（与 GitHub 树排序一致）。 */
function sortTree(nodes: FileNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children) sortTree(n.children);
  }
}

/** 按相对路径逐级定位并读取本地文件内容。 */
async function readLocalFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<string> {
  const segments = path.split("/");
  let current: FileSystemDirectoryHandle | FileSystemFileHandle = root;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (current.kind !== "directory") throw new Error("路径无效");
    current = isLast
      ? await current.getFileHandle(seg)
      : await current.getDirectoryHandle(seg);
  }

  if (current.kind !== "file") throw new Error("不是文件");
  const file = await current.getFile();
  return await file.text();
}

/** 基于目录句柄构造本地数据源。 */
export function createLocalDataSource(
  root: FileSystemDirectoryHandle,
): DataSource {
  const rootName = root.name || "本地项目";

  return {
    kind: "local",

    getInfo: async () => ({
      default_branch: "",
      description: null,
      full_name: rootName,
      html_url: "",
      stargazers_count: 0,
      forks_count: 0,
      language: null,
    }),

    getTree: () => buildLocalTree(root),

    readFile: (path: string) => readLocalFile(root, path),

    search: async (query: string, signal?: AbortSignal) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];

      const tree = await buildLocalTree(root);
      const paths = collectFilePaths(tree);
      const { files } = filterCodeFiles(paths);

      const results: SearchResult[] = [];
      for (const p of files.slice(0, SEARCH_FILE_LIMIT)) {
        if (signal?.aborted) break;
        let content: string;
        try {
          content = await readLocalFile(root, p);
        } catch {
          continue;
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

/* -------------------- 跨页句柄传递（内存 store） -------------------- */

/** 弹出系统目录选择器；浏览器不支持时返回 null（调用方给出提示）。 */
export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === "undefined" || !window.showDirectoryPicker) return null;
  return await window.showDirectoryPicker({ mode: "read" });
}

let pendingHandle: FileSystemDirectoryHandle | null = null;

/** 首页选择目录后暂存句柄，供 analyze 页读取。 */
export function setPendingLocalHandle(handle: FileSystemDirectoryHandle): void {
  pendingHandle = handle;
}

/** 取走并清空暂存句柄（一次性消费）。 */
export function takePendingLocalHandle(): FileSystemDirectoryHandle | null {
  const h = pendingHandle;
  pendingHandle = null;
  return h;
}
