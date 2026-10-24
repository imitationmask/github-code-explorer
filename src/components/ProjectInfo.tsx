import type { RepoInfo } from "@/types/github";
import { FolderGit2, GitFork, Star } from "lucide-react";

interface ProjectInfoProps {
  repoInfo: RepoInfo | null;
  loading: boolean;
}

export function ProjectInfo({ repoInfo, loading }: ProjectInfoProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FolderGit2 size={16} className="text-cyan-400" />
        项目信息
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
        </div>
      ) : repoInfo ? (
        <div className="mt-4 space-y-3">
          <p className="break-all text-sm font-medium text-foreground">
            {repoInfo.full_name}
          </p>
          {repoInfo.description && (
            <p className="text-xs leading-5 text-muted">{repoInfo.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Star size={13} className="text-warning" />
              {repoInfo.stargazers_count}
            </span>
            <span className="flex items-center gap-1">
              <GitFork size={13} className="text-info" />
              {repoInfo.forks_count}
            </span>
            {repoInfo.language && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                {repoInfo.language}
              </span>
            )}
          </div>
          <div className="border-t border-white/5 pt-3 text-xs text-muted-2">
            默认分支：
            <span className="font-mono text-muted">{repoInfo.default_branch}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-5 text-muted-2">
            分析完成后，这里将展示仓库的 Star、Fork、主要语言等统计信息。
          </p>
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-muted-2">
            更多分析能力即将上线
          </p>
        </div>
      )}
    </div>
  );
}
