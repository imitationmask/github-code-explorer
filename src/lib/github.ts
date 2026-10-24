import type {
  FileNode,
  GitHubTreeResponse,
  ParsedRepo,
  ParseResult,
  RepoInfo,
  TreeEntry,
} from "@/types/github";

import { getSettings } from "./settings";

const GITHUB_API = "https://api.github.com";

/** 构造 GitHub 鉴权头（配置了 token 时携带，提升速率限制 / 访问私有仓库）。 */
function authHeaders(): Record<string, string> {
  const token = getSettings().githubToken;
  return token ? { Authorization: `token ${token}` } : {};
}

export function parseGitHubUrl(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "请输入 GitHub 项目地址" };
  }

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "地址格式不合法，请检查输入" };
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return { ok: false, error: "仅支持 github.com 的仓库地址" };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return {
      ok: false,
      error: "地址缺少仓库所有者或仓库名，例如 github.com/owner/repo",
    };
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  let branch: string | undefined;

  if (parts.length >= 4 && parts[2] === "tree") {
    branch = parts[3];
  }

  const validSegment = /^[A-Za-z0-9._-]+$/;
  if (!validSegment.test(owner) || !validSegment.test(repo)) {
    return { ok: false, error: "仓库所有者或仓库名包含非法字符" };
  }

  return { ok: true, repo: { owner, repo, branch } };
}

export async function fetchRepoInfo(repo: ParsedRepo): Promise<RepoInfo> {
  const res = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}`, {
    headers: { Accept: "application/vnd.github+json", ...authHeaders() },
  });

  if (res.status === 404) {
    throw new Error("仓库不存在或为私有仓库");
  }
  if (res.status === 403) {
    throw new Error("GitHub API 速率限制已用尽（约 60 次/小时），请稍后再试");
  }
  if (!res.ok) {
    throw new Error(`获取仓库信息失败（HTTP ${res.status}）`);
  }

  const data = await res.json();
  return {
    default_branch: data.default_branch,
    description: data.description ?? null,
    full_name: data.full_name,
    html_url: data.html_url,
    stargazers_count: data.stargazers_count ?? 0,
    forks_count: data.forks_count ?? 0,
    language: data.language ?? null,
  };
}

export async function fetchRepoTree(
  repo: ParsedRepo,
  branch: string,
): Promise<FileNode[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json", ...authHeaders() } },
  );

  if (res.status === 404) {
    throw new Error("仓库或分支不存在");
  }
  if (res.status === 403) {
    throw new Error("GitHub API 速率限制已用尽（约 60 次/小时），请稍后再试");
  }
  if (!res.ok) {
    throw new Error(`获取文件树失败（HTTP ${res.status}）`);
  }

  const data = (await res.json()) as GitHubTreeResponse;
  return buildFileTree(data.tree ?? []);
}

export function buildFileTree(entries: TreeEntry[]): FileNode[] {
  const roots: FileNode[] = [];
  const nodeByPath = new Map<string, FileNode>();

  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    const segments = entry.path.split("/");
    let siblings = roots;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      const type = isLeaf ? entry.type : "tree";

      let node = nodeByPath.get(currentPath);
      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          type,
          children: type === "tree" ? [] : undefined,
        };
        nodeByPath.set(currentPath, node);
        siblings.push(node);
      }
      if (type === "tree" && node.children) {
        siblings = node.children;
      }
    });
  }

  return roots;
}

export function buildRawUrl(
  repo: ParsedRepo,
  branch: string,
  path: string,
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(branch)}/${encodedPath}`;
}

export async function fetchFileContent(
  repo: ParsedRepo,
  branch: string,
  path: string,
): Promise<string> {
  const res = await fetch(buildRawUrl(repo, branch, path), {
    headers: authHeaders(),
  });

  if (res.status === 404) {
    throw new Error("文件不存在");
  }
  if (!res.ok) {
    throw new Error(`加载文件失败（HTTP ${res.status}）`);
  }

  return await res.text();
}
