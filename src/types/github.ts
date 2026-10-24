export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
}

export type TreeNodeType = "tree" | "blob";

export interface FileNode {
  name: string;
  path: string;
  type: TreeNodeType;
  children?: FileNode[];
}

export interface RepoInfo {
  default_branch: string;
  description: string | null;
  full_name: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
}

export interface TreeEntry {
  path: string;
  type: "tree" | "blob";
}

export interface GitHubTreeResponse {
  truncated: boolean;
  tree: TreeEntry[];
}

export type ParseResult =
  | { ok: true; repo: ParsedRepo }
  | { ok: false; error: string };
