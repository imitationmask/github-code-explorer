"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Clock,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { GithubIcon } from "@/components/GithubIcon";
import { Logo } from "@/components/Logo";
import { UrlInput } from "@/components/UrlInput";
import { SettingsButton } from "@/components/SettingsDialog";
import { deleteHistory, loadHistory } from "@/lib/history";
import type { HistoryItem } from "@/lib/history";
import { pickLocalDirectory, setPendingLocalHandle } from "@/lib/datasource/local";

const EXAMPLES = [
  { name: "react", url: "https://github.com/facebook/react" },
  { name: "next.js", url: "https://github.com/vercel/next.js" },
  { name: "tailwindcss", url: "https://github.com/tailwindlabs/tailwindcss" },
];

type Mode = "github" | "local";

export default function Home() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mode, setMode] = useState<Mode>("github");
  const [picking, setPicking] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleAnalyze = (url: string) => {
    router.push(`/analyze?url=${encodeURIComponent(url)}`);
  };

  const handleOpenHistory = (id: string) => {
    router.push(`/analyze?id=${encodeURIComponent(id)}`);
  };

  const handleDeleteHistory = (id: string) => {
    deleteHistory(id);
    setHistory(loadHistory());
  };

  const handlePickLocal = async () => {
    setLocalError("");
    if (typeof window === "undefined" || !window.showDirectoryPicker) {
      setLocalError("当前浏览器不支持目录选择，请使用 Chrome / Edge");
      return;
    }
    setPicking(true);
    try {
      const handle = await pickLocalDirectory();
      if (!handle) {
        setLocalError("未选择目录");
        return;
      }
      setPendingLocalHandle(handle);
      const name = handle.name || "本地项目";
      router.push(`/analyze?mode=local&name=${encodeURIComponent(name)}`);
    } catch (err) {
      console.error(err);
      setLocalError(err instanceof Error ? err.message : "选择目录失败");
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* 背景装饰光斑 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-0 -right-24 h-80 w-80 rounded-full bg-cyan-500/15 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0b0f19_100%)]" />
      </div>

      {/* 顶部导航 */}
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <SettingsButton />
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              <GithubIcon size={16} />
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-16 pb-12">
        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          <div className="animate-float">
            <Logo size="lg" showText={false} />
          </div>

          <h1 className="mt-8 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent">
              Code Explorer
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            分析 GitHub 公开仓库或本地项目目录，一键可视化文件结构、
            函数调用关系与代码，点击即可阅读带语法高亮的源码。
          </p>

          {/* 输入卡片 */}
          <div className="mt-10 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-indigo-950/40 backdrop-blur-xl sm:p-8">
            {/* 模式 Tab 切换 */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <ModeTab
                active={mode === "github"}
                onClick={() => setMode("github")}
                icon={<GithubIcon size={15} />}
                label="GitHub 项目分析"
              />
              <ModeTab
                active={mode === "local"}
                onClick={() => setMode("local")}
                icon={<Folder size={15} />}
                label="本地项目分析"
              />
            </div>

            {mode === "github" ? (
              <>
                <UrlInput onAnalyze={handleAnalyze} size="lg" />
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs text-muted-2">试试：</span>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.name}
                      type="button"
                      onClick={() => handleAnalyze(ex.url)}
                      className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted transition-colors hover:border-indigo-400/40 hover:text-foreground"
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/30 text-cyan-300">
                  <FolderOpen size={26} />
                </div>
                <p className="max-w-md text-sm leading-6 text-muted">
                  选择本地项目目录，即可在浏览器内分析其文件结构、代码与函数调用关系，
                  全部处理在本机完成，源码不会上传。
                </p>
                <button
                  type="button"
                  onClick={handlePickLocal}
                  disabled={picking}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {picking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <FolderOpen size={16} />
                  )}
                  {picking ? "正在选择…" : "选择本地目录"}
                </button>
                {localError && (
                  <p className="text-xs text-danger" role="alert">
                    {localError}
                  </p>
                )}
                <p className="text-[11px] text-muted-2">仅 Chrome / Edge 支持目录选择</p>
              </div>
            )}
          </div>

          {/* 历史分析记录 */}
          {history.length > 0 && (
            <div className="mt-8 w-full text-left">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock size={15} className="text-primary-2" />
                历史分析
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {history.map((item) => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    onOpen={() => handleOpenHistory(item.id)}
                    onDelete={() => handleDeleteHistory(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 特性 */}
          <div className="mt-12 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            <Feature
              icon={<GitBranch size={18} />}
              title="文件树浏览"
              desc="递归树形结构，目录一键展开折叠，清晰呈现项目层级。"
            />
            <Feature
              icon={<Sparkles size={18} />}
              title="语法高亮"
              desc="基于 Prism 的多语言代码着色，阅读体验接近本地 IDE。"
            />
            <Feature
              icon={<FolderOpen size={18} />}
              title="本地即时分析"
              desc="无需配置，直连 GitHub API 或本地目录，输入即分析。"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30"
          : "text-muted hover:bg-white/5 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function HistoryCard({
  item,
  onOpen,
  onDelete,
}: {
  item: HistoryItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isLocal = item.kind === "local";
  const name =
    item.repoInfo?.full_name ??
    (isLocal ? item.url || "本地项目" : item.repo?.repo) ??
    "未知项目";
  const url = isLocal
    ? "本地项目"
    : item.url || (item.repo ? `${item.repo.owner}/${item.repo.repo}` : "未知地址");
  const langs = item.analysis?.languages ?? [];
  const primaryLang = item.repoInfo?.language;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group relative cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isLocal
                ? "bg-gradient-to-br from-cyan-500/25 to-teal-400/25 text-cyan-300"
                : "bg-gradient-to-br from-indigo-500/25 to-violet-400/25 text-indigo-300"
            }`}
          >
            {isLocal ? <Folder size={15} /> : <GithubIcon size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-foreground">{name}</h4>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-2">{url}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除记录"
          aria-label="删除记录"
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-2 opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {langs.slice(0, 3).map((l) => (
          <span
            key={l.name}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted"
          >
            {l.name}
          </span>
        ))}
        {langs.length === 0 && primaryLang && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted">
            {primaryLang}
          </span>
        )}
        {langs.length === 0 && !primaryLang && (
          <span className="text-[10px] text-muted-2">未分析</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-2">
          <Clock size={11} />
          {formatRelativeTime(item.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-xl transition-colors hover:border-indigo-400/30">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-cyan-400/30 text-cyan-300">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">{desc}</p>
    </div>
  );
}
