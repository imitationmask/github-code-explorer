"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Folder, FolderOpen, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { Logo } from "./Logo";
import { SettingsButton } from "./SettingsDialog";
import { useSettings } from "./SettingsProvider";
import { UrlInput } from "./UrlInput";
import { FileTree } from "./FileTree";
import { CodePanel } from "./CodePanel";
import { ProjectInfo } from "./ProjectInfo";
import { AiAnalysisPanel } from "./AiAnalysisPanel";
import { LogPanel } from "./LogPanel";
import type { WorkflowStatus } from "./LogPanel";
import { ModulePanel } from "./ModulePanel";
import { FunctionPanorama } from "./FunctionPanorama";
import type { FileNode, ParsedRepo, RepoInfo } from "@/types/github";
import type { AiAnalysis, AiStatus } from "@/types/ai";
import type { LogEntry, LogLevel } from "@/types/log";
import type { FunctionModule, FunctionNode, SubfunctionAnalysis } from "@/types/function";
import { parseGitHubUrl } from "@/lib/github";
import type { DataSource, SearchResult } from "@/lib/datasource/types";
import { createGitHubDataSource } from "@/lib/datasource/github";
import {
  createLocalDataSource,
  pickLocalDirectory,
  takePendingLocalHandle,
} from "@/lib/datasource/local";
import { collectFilePaths, prepareAnalysisFiles, requestAnalysis } from "@/lib/analyze";
import type { PreparedFiles } from "@/lib/analyze";
import { verifyEntryFile } from "@/lib/verify-entry";
import { analyzeFunctionSubfunctions, analyzeSubfunctions, buildFunctionTree } from "@/lib/subfunctions";
import { analyzeModules, applyModulesToTree, collectFunctionNodes } from "@/lib/modules";
import { detectBridge } from "@/lib/framework-bridge/registry";
import { buildBridgedTree } from "@/lib/framework-bridge/build-tree";
import type { BridgeDetectContext, FrameworkBridge } from "@/lib/framework-bridge/types";
import { locateFunction, resolveFunctionFile } from "@/lib/function-locate";
import { buildMarkdownReport } from "@/lib/report";
import { findHistory, upsertHistory } from "@/lib/history";

type Status = "idle" | "loading" | "success" | "error";

const PANORAMA_MIN_WIDTH = 240;
const PANORAMA_MAX_WIDTH = 640;
const PANORAMA_DEFAULT_WIDTH = 320;

function summarizeFilter(prepared: PreparedFiles): string {
  const base = `代码文件 ${prepared.codeFileCount}/${prepared.totalFileCount}`;
  return prepared.sampled
    ? `${base}，抽样发送 ${prepared.files.length}`
    : `${base}，全部发送`;
}

function summarizeAnalysis(analysis: AiAnalysis): string {
  return `${analysis.languages.length} 种语言 · ${analysis.techTags.length} 个技术栈 · ${analysis.entryFiles.length} 个入口文件`;
}

/** 将目录名归一化为后端可接受的 `[A-Za-z0-9._-]+` 片段。 */
function sanitizeLabel(name: string): string {
  const s = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "project";
}

/** 不可变地替换树中指定节点的 children（用于下钻挂载子树）。 */
function updateTreeNode(
  node: FunctionNode,
  targetId: string,
  children: FunctionNode[],
): FunctionNode {
  if (node.id === targetId) {
    return { ...node, children, analyzed: true };
  }
  if (node.children.length === 0) return node;
  return {
    ...node,
    children: node.children.map((c) => updateTreeNode(c, targetId, children)),
  };
}

/** 搜索结果匹配行内容：高亮命中的关键字（大小写不敏感，只高亮首个命中）。 */
function HighlightedContent({ content, query }: { content: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{content}</>;
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{content}</>;
  return (
    <>
      {content.slice(0, idx)}
      <mark className="rounded bg-indigo-500/40 px-0.5 text-foreground">
        {content.slice(idx, idx + q.length)}
      </mark>
      {content.slice(idx + q.length)}
    </>
  );
}

export function AnalyzeView({
  initialUrl,
  historyId,
  initialMode = "github",
  localName,
}: {
  initialUrl: string;
  historyId?: string;
  initialMode?: "github" | "local";
  localName?: string;
}) {
  const settings = useSettings();
  const [repo, setRepo] = useState<ParsedRepo | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [mode, setMode] = useState<"github" | "local">("github");
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AiStatus>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const [confirmedEntryPath, setConfirmedEntryPath] = useState<string | null>(null);
  const subfuncAbortRef = useRef<AbortController | null>(null);
  const [functionTree, setFunctionTree] = useState<FunctionNode | null>(null);
  const [subfuncStatus, setSubfuncStatus] = useState<AiStatus>("idle");
  const [subfuncError, setSubfuncError] = useState("");
  const [modules, setModules] = useState<FunctionModule[]>([]);
  const [moduleStatus, setModuleStatus] = useState<AiStatus>("idle");
  const [moduleError, setModuleError] = useState("");
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("idle");
  const moduleAbortRef = useRef<AbortController | null>(null);
  const subfuncCacheRef = useRef<Map<string, SubfunctionAnalysis>>(new Map());
  const [drillingIds, setDrillingIds] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<{ line: number; symbol?: string } | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [reportMarkdown, setReportMarkdown] = useState("");

  const [panoramaWidth, setPanoramaWidth] = useState(PANORAMA_DEFAULT_WIDTH);
  const panoramaResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // 搜索状态
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [searchError, setSearchError] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // 本地模式「一次性消费句柄」的挂载守卫（避免 StrictMode 双调用二次消费）
  const localConsumedRef = useRef(false);

  const addLog = useCallback(
    (level: LogLevel, title: string, summary: string, detail?: unknown) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setLogs((prev) => [
        ...prev,
        { id, timestamp: Date.now(), level, title, summary, detail },
      ]);
    },
    [],
  );

  /** 重置一次分析前的所有状态（GitHub 与本地共用）。 */
  const resetAnalysisState = useCallback(() => {
    setSelectedFile(null);
    setNodes([]);
    setRepoInfo(null);
    setRepo(null);
    setBranch(null);
    setDataSource(null);
    abortRef.current?.abort();
    verifyAbortRef.current?.abort();
    subfuncAbortRef.current?.abort();
    moduleAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    setAnalysis(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
    setConfirmedEntryPath(null);
    setFunctionTree(null);
    setSubfuncStatus("idle");
    setSubfuncError("");
    setModules([]);
    setModuleStatus("idle");
    setModuleError("");
    setActiveModuleId(null);
    setWorkflowStatus("working");
    setHighlight(null);
    setDrillingIds(new Set());
    setSearchQuery("");
    setSearchResults([]);
    setSearchStatus("idle");
    setSearchError("");
    setSearchOpen(false);
    subfuncCacheRef.current.clear();
  }, []);

  /** 稳定项目标识：GitHub 为 `owner/repo[@branch]`，本地为 `local/<sanitized-name>`。 */
  const projectId = useMemo(() => {
    if (mode === "local") {
      const name = repoInfo?.full_name || currentUrl || "local";
      return `local/${sanitizeLabel(name)}`;
    }
    return repo ? `${repo.owner}/${repo.repo}${branch ? `@${branch}` : ""}` : null;
  }, [mode, repo, branch, repoInfo, currentUrl]);

  /** 发给 /api/analyze 的项目标识（须匹配 `owner/repo` 两段格式）。 */
  const projectLabel = useMemo(() => {
    if (mode === "local") {
      const name = repoInfo?.full_name || currentUrl || "project";
      return `local/${sanitizeLabel(name)}`;
    }
    return repo ? `${repo.owner}/${repo.repo}` : null;
  }, [mode, repo, repoInfo, currentUrl]);

  const analyze = useCallback(
    async (input: string) => {
      setCurrentUrl(input);
      // 每次重新分析时清空旧日志
      setLogs([]);

      const parsed = parseGitHubUrl(input);
      if (!parsed.ok) {
        addLog("error", "GitHub 校验", parsed.error, { input });
        setError(parsed.error);
        setStatus("error");
        return;
      }

      const branchLabel = parsed.repo.branch ? `@${parsed.repo.branch}` : "";
      addLog("info", "GitHub 校验", `${parsed.repo.owner}/${parsed.repo.repo}${branchLabel}`, {
        owner: parsed.repo.owner,
        repo: parsed.repo.repo,
        branch: parsed.repo.branch ?? null,
      });

      setMode("github");
      setStatus("loading");
      setError("");
      resetAnalysisState();
      setRepo(parsed.repo);

      try {
        const provisional = createGitHubDataSource(parsed.repo, parsed.repo.branch ?? "");
        const info = await provisional.getInfo();
        const resolvedBranch = parsed.repo.branch ?? info.default_branch;
        const ds = createGitHubDataSource(parsed.repo, resolvedBranch);
        const tree = await ds.getTree();
        const fileCount = collectFilePaths(tree).length;

        setRepoInfo(info);
        setBranch(resolvedBranch);
        setDataSource(ds);
        setNodes(tree);
        setStatus("success");

        addLog("success", "文件列表", `共 ${fileCount} 个文件`, {
          fileCount,
          branch: resolvedBranch,
        });
        setWorkflowStatus("done");
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : "分析失败，请重试";
        addLog("error", "GitHub 加载", message);
        setError(message);
        setStatus("error");
        setWorkflowStatus("done");
      }
    },
    [addLog, resetAnalysisState],
  );

  const analyzeLocal = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      const name = handle.name || "本地项目";
      setCurrentUrl(name);
      setLogs([]);

      addLog("info", "本地项目", `开始分析本地目录 ${name}`, { name });

      setMode("local");
      setStatus("loading");
      setError("");
      resetAnalysisState();

      try {
        const ds = createLocalDataSource(handle);
        const info = await ds.getInfo();
        const tree = await ds.getTree();
        const fileCount = collectFilePaths(tree).length;

        setRepoInfo(info);
        setDataSource(ds);
        setNodes(tree);
        setStatus("success");

        addLog("success", "文件列表", `共 ${fileCount} 个文件`, { fileCount });
        setWorkflowStatus("done");
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : "分析失败，请重试";
        addLog("error", "本地加载", message);
        setError(message);
        setStatus("error");
        setWorkflowStatus("done");
      }
    },
    [addLog, resetAnalysisState],
  );

  useEffect(() => {
    if (initialUrl) {
      analyze(initialUrl);
    }
  }, [initialUrl, analyze]);

  // 本地模式入口：消费首页暂存的目录句柄
  useEffect(() => {
    if (initialMode !== "local" || localConsumedRef.current) return;
    localConsumedRef.current = true;
    const handle = takePendingLocalHandle();
    if (handle) {
      void analyzeLocal(handle);
    } else {
      setMode("local");
      setStatus("idle");
      setError("本地目录句柄已失效（可能刷新了页面），请重新选择目录");
      setCurrentUrl(localName ?? "本地项目");
    }
  }, [initialMode, localName, analyzeLocal]);

  // 按历史记录 id 恢复完整快照
  useEffect(() => {
    if (!historyId) return;
    const item = findHistory(historyId);
    if (!item) return;
    setMode(item.kind);
    setRepo(item.repo);
    setBranch(item.branch);
    setRepoInfo(item.repoInfo);
    setNodes(item.nodes);
    // GitHub 快照可依据 repo/branch 重建数据源；本地目录句柄不可持久化，需重新选择
    if (item.kind === "github" && item.repo && item.branch) {
      setDataSource(createGitHubDataSource(item.repo, item.branch));
    } else {
      setDataSource(null);
    }
    setAnalysis(item.analysis);
    setAnalysisStatus(item.analysis ? "success" : "idle");
    setConfirmedEntryPath(item.confirmedEntryPath);
    setFunctionTree(item.functionTree);
    setSubfuncStatus(item.functionTree ? "success" : "idle");
    const restoredModules = item.modules ?? [];
    setModules(restoredModules);
    setModuleStatus(restoredModules.length > 0 ? "success" : "idle");
    setActiveModuleId(null);
    setLogs(item.logs);
    setCurrentUrl(item.url);
    setReportMarkdown(item.markdown);
    setStatus(item.repoInfo ? "success" : "idle");
    setWorkflowStatus("done");
  }, [historyId]);

  // 防抖保存：分析过程持续更新工程文件与历史快照
  useEffect(() => {
    if (!repoInfo || !projectId) return;
    const timer = setTimeout(() => {
      const markdown = buildMarkdownReport({
        url: currentUrl,
        repoInfo,
        branch,
        nodes,
        analysis,
        functionTree,
        modules,
        logs,
      });
      setReportMarkdown(markdown);
      upsertHistory({
        id: projectId,
        kind: mode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        url: currentUrl,
        repo: mode === "github" ? repo : null,
        branch: mode === "github" ? branch : null,
        repoInfo,
        nodes,
        analysis,
        confirmedEntryPath,
        functionTree,
        modules,
        logs,
        markdown,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    projectId,
    mode,
    repo,
    branch,
    repoInfo,
    nodes,
    analysis,
    confirmedEntryPath,
    functionTree,
    modules,
    logs,
    currentUrl,
  ]);

  const handleAnalyze = (url: string) => {
    analyze(url);
  };

  const handleSelectFile = (node: FileNode) => {
    setSelectedFile(node);
    setHighlight(null);
  };

  const handleReselectLocal = useCallback(async () => {
    try {
      const handle = await pickLocalDirectory();
      if (!handle) {
        setError("当前浏览器不支持目录选择，请使用 Chrome / Edge");
        return;
      }
      await analyzeLocal(handle);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "选择目录失败");
    }
  }, [analyzeLocal]);

  const runModuleAnalysis = useCallback(
    async (tree: FunctionNode, analysisResult: AiAnalysis) => {
      if (!repoInfo) return;

      moduleAbortRef.current?.abort();
      const controller = new AbortController();
      moduleAbortRef.current = controller;

      setModuleStatus("loading");
      setModuleError("");

      const context = {
        htmlUrl: repoInfo.html_url,
        description: repoInfo.description,
        languages: analysisResult.languages.map((l) => l.name),
        techTags: analysisResult.techTags.map((t) => t.name),
      };

      try {
        const nodes = collectFunctionNodes(tree);
        const result = await analyzeModules({
          context,
          nodes,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setModules(result.modules);
        setFunctionTree(applyModulesToTree(tree, result.modules));
        setModuleStatus("success");
        addLog("success", "模块划分", `划分出 ${result.modules.length} 个功能模块`, {
          modules: result.modules.map((m) => ({ name: m.name, functions: m.functions })),
        });
        setWorkflowStatus("done");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        const message = err instanceof Error ? err.message : "模块划分失败，请重试";
        addLog("error", "模块划分", message);
        setModuleError(message);
        setModuleStatus("error");
        setWorkflowStatus("done");
      }
    },
    [repoInfo, addLog],
  );

  const runSubfunctionAnalysis = useCallback(
    async (entryPath: string, analysisResult: AiAnalysis) => {
      if (!dataSource || !repoInfo) return;

      subfuncAbortRef.current?.abort();
      const controller = new AbortController();
      subfuncAbortRef.current = controller;

      setSubfuncStatus("loading");
      setSubfuncError("");

      const context = {
        htmlUrl: repoInfo.html_url,
        description: repoInfo.description,
        languages: analysisResult.languages.map((l) => l.name),
        techTags: analysisResult.techTags.map((t) => t.name),
      };

      try {
        const { analysis: result, debug } = await analyzeSubfunctions({
          dataSource,
          path: entryPath,
          context,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const tree = buildFunctionTree(result, entryPath);
        setFunctionTree(tree);
        setSubfuncStatus("success");
        addLog(
          "success",
          "子函数识别",
          `入口函数 ${result.entryFunction.name} · ${result.subfunctions.length} 个子函数`,
          {
            entryFunction: result.entryFunction,
            subfunctions: result.subfunctions,
            aiRequest: debug.request,
            aiResponse: debug.response,
          },
        );
        void runModuleAnalysis(tree, analysisResult);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        const message = err instanceof Error ? err.message : "子函数识别失败，请重试";
        addLog("error", "子函数识别", message);
        setSubfuncError(message);
        setSubfuncStatus("error");
        setWorkflowStatus("done");
      }
    },
    [dataSource, repoInfo, addLog, runModuleAnalysis],
  );

  const runBridgedAnalysis = useCallback(
    async (entryPath: string, analysisResult: AiAnalysis, bridge: FrameworkBridge) => {
      if (!dataSource || !repoInfo) return;

      subfuncAbortRef.current?.abort();
      const controller = new AbortController();
      subfuncAbortRef.current = controller;

      setSubfuncStatus("loading");
      setSubfuncError("");

      const ctx: BridgeDetectContext = {
        dataSource,
        repoInfo,
        nodes,
        techTags: analysisResult.techTags.map((t) => t.name),
        languages: analysisResult.languages.map((l) => l.name),
        signal: controller.signal,
      };

      try {
        const entryPoints = await bridge.findEntryPoints(ctx);
        if (controller.signal.aborted) return;
        if (entryPoints.length === 0) {
          addLog("info", "框架桥接", `${bridge.name} 命中但未扫描到 Controller 方法，回退子函数识别`);
          void runSubfunctionAnalysis(entryPath, analysisResult);
          return;
        }
        const tree = buildBridgedTree(entryPath, bridge, entryPoints);
        setFunctionTree(tree);
        setSubfuncStatus("success");
        addLog(
          "success",
          "框架桥接",
          `${bridge.name} · 扫描到 ${entryPoints.length} 个 Controller 方法`,
          {
            bridge: bridge.id,
            bridgeLabel: bridge.bridgeLabel,
            entryPoints: entryPoints.map((ep) => ({
              name: `${ep.className}.${ep.methodName}`,
              url: ep.url,
              httpMethods: ep.httpMethods,
              file: ep.file,
            })),
          },
        );
        void runModuleAnalysis(tree, analysisResult);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        const message = err instanceof Error ? err.message : "框架桥接分析失败，请重试";
        addLog("error", "框架桥接", message);
        setSubfuncError(message);
        setSubfuncStatus("error");
        setWorkflowStatus("done");
      }
    },
    [dataSource, repoInfo, nodes, addLog, runModuleAnalysis, runSubfunctionAnalysis],
  );

  const runEntryVerification = useCallback(
    async (result: AiAnalysis) => {
      if (!dataSource || !repoInfo) return;
      const entries = result.entryFiles;
      if (entries.length === 0) {
        addLog("info", "入口研判", "AI 未识别出可能的入口文件，跳过研判");
        setWorkflowStatus("done");
        return;
      }

      verifyAbortRef.current?.abort();
      const controller = new AbortController();
      verifyAbortRef.current = controller;

      const context = {
        htmlUrl: repoInfo.html_url,
        description: repoInfo.description,
        languages: result.languages.map((l) => l.name),
      };

      let confirmed: string | null = null;
      for (const entry of entries) {
        if (controller.signal.aborted) return;
        addLog("info", "入口研判", `研判 ${entry.path}`, { path: entry.path });
        try {
          const verdict = await verifyEntryFile({
            dataSource,
            path: entry.path,
            context,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          addLog(
            verdict.isEntry ? "success" : "info",
            "入口研判",
            verdict.isEntry ? `${entry.path} 确认为项目入口` : `${entry.path} 非入口`,
            {
              path: entry.path,
              isEntry: verdict.isEntry,
              confidence: verdict.confidence,
              reason: verdict.reason,
            },
          );
          if (verdict.isEntry) {
            confirmed = entry.path;
            setConfirmedEntryPath(entry.path);
            const bridgeCtx: BridgeDetectContext = {
              dataSource,
              repoInfo,
              nodes,
              techTags: result.techTags.map((t) => t.name),
              languages: result.languages.map((l) => l.name),
              signal: controller.signal,
            };
            const bridge = await detectBridge(bridgeCtx);
            if (controller.signal.aborted) return;
            if (bridge) {
              void runBridgedAnalysis(entry.path, result, bridge);
            } else {
              void runSubfunctionAnalysis(entry.path, result);
            }
            break;
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(err);
          const message = err instanceof Error ? err.message : "研判失败";
          addLog("error", "入口研判", `${entry.path}：${message}`);
          break;
        }
      }

      if (!confirmed) {
        addLog("info", "入口研判", `已研判 ${entries.length} 个文件，未确认到明确入口`);
        setWorkflowStatus("done");
      }
    },
    [dataSource, repoInfo, nodes, addLog, runSubfunctionAnalysis, runBridgedAnalysis],
  );

  const handleAiAnalyze = useCallback(async () => {
    if (!dataSource || !projectLabel || analysisStatus === "loading") return;

    const prepared = prepareAnalysisFiles(nodes);
    addLog("info", "过滤结果", summarizeFilter(prepared), {
      totalFileCount: prepared.totalFileCount,
      codeFileCount: prepared.codeFileCount,
      sampled: prepared.sampled,
      sentFileCount: prepared.files.length,
    });

    if (prepared.files.length === 0) {
      addLog("error", "AI 分析", "未在仓库中检测到代码文件");
      setAnalysisError("未在仓库中检测到代码文件");
      setAnalysisStatus("error");
      setWorkflowStatus("done");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setWorkflowStatus("working");
    setAnalysisStatus("loading");
    setAnalysisError("");
    try {
      const { analysis, debug } = await requestAnalysis({
        files: prepared.files,
        codeFileCount: prepared.codeFileCount,
        sampled: prepared.sampled,
        projectLabel,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setAnalysis(analysis);
      setAnalysisStatus("success");
      addLog("success", "AI 分析结果", summarizeAnalysis(analysis), {
        result: {
          languages: analysis.languages.map((l) => `${l.name} ${l.percentage}%`),
          techTags: analysis.techTags.map((t) => t.name),
          entryFiles: analysis.entryFiles.map((e) => e.path),
        },
        aiRequest: debug.request,
        aiResponse: debug.response,
      });
      void runEntryVerification(analysis);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      const message = err instanceof Error ? err.message : "AI 分析失败，请重试";
      addLog("error", "AI 分析失败", message);
      setAnalysisError(message);
      setAnalysisStatus("error");
      setWorkflowStatus("done");
    }
  }, [dataSource, projectLabel, nodes, analysisStatus, addLog, runEntryVerification]);

  const filePaths = useMemo(() => collectFilePaths(nodes), [nodes]);

  const handleOpenFileByPath = useCallback((path: string) => {
    const name = path.split("/").pop() ?? path;
    setSelectedFile({ name, path, type: "blob" });
    setHighlight(null);
  }, []);

  const handleDrilldown = useCallback(
    async (node: FunctionNode) => {
      if (!dataSource || !repoInfo || !node.file) return;
      if (drillingIds.has(node.id)) return;

      const resolvedFile = resolveFunctionFile(node.file, filePaths);
      if (!resolvedFile) {
        addLog(
          "error",
          "子函数下钻",
          `${node.name}：无法定位函数所在文件（${node.file} 不在项目文件列表中）`,
        );
        return;
      }

      const cacheKey = `${resolvedFile}:${node.name}`;
      const cached = subfuncCacheRef.current.get(cacheKey);

      if (cached) {
        const children = cached.subfunctions.map((s, i) => ({
          id: `${node.id}:${s.name}:${i}`,
          name: s.name,
          summary: s.summary,
          file: s.likelyFile,
          drilldown: s.drilldown,
          analyzed: false,
          children: [],
        }));
        setFunctionTree((prev) =>
          prev ? updateTreeNode(prev, node.id, children) : prev,
        );
        addLog("info", "下钻缓存", `命中缓存：${node.name}，跳过下钻`, {
          cacheKey,
          subfunctionCount: cached.subfunctions.length,
        });
        return;
      }

      setDrillingIds((prev) => new Set(prev).add(node.id));
      const controller = new AbortController();
      try {
        const context = {
          htmlUrl: repoInfo.html_url,
          description: repoInfo.description,
          languages: analysis?.languages.map((l) => l.name) ?? [],
          techTags: analysis?.techTags.map((t) => t.name) ?? [],
        };
        const { analysis: result, debug } = await analyzeFunctionSubfunctions({
          dataSource,
          filePath: resolvedFile,
          fullName: node.name,
          context,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        subfuncCacheRef.current.set(cacheKey, result);

        const children = result.subfunctions.map((s, i) => ({
          id: `${node.id}:${s.name}:${i}`,
          name: s.name,
          summary: s.summary,
          file: s.likelyFile,
          drilldown: s.drilldown,
          analyzed: false,
          children: [],
        }));
        setFunctionTree((prev) =>
          prev ? updateTreeNode(prev, node.id, children) : prev,
        );
        addLog(
          "success",
          "子函数下钻",
          `${node.name} → ${result.subfunctions.length} 个子函数`,
          {
            target: node.name,
            subfunctions: result.subfunctions,
            aiRequest: debug.request,
            aiResponse: debug.response,
          },
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        const message = err instanceof Error ? err.message : "下钻分析失败，请重试";
        addLog("error", "子函数下钻", `${node.name}：${message}`);
      } finally {
        setDrillingIds((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      }
    },
    [dataSource, repoInfo, analysis, drillingIds, filePaths, addLog],
  );

  const handleLocateFunction = useCallback(
    async (node: FunctionNode) => {
      if (!dataSource || !node.file) return;
      const resolvedFile = resolveFunctionFile(node.file, filePaths);
      if (!resolvedFile) {
        addLog(
          "error",
          "函数定位",
          `${node.name}：无法定位函数所在文件（${node.file} 不在项目文件列表中）`,
        );
        return;
      }
      try {
        const content = await dataSource.readFile(resolvedFile);
        const located = locateFunction(content, node.name);
        const fileName = resolvedFile.split("/").pop() ?? resolvedFile;
        setSelectedFile({ name: fileName, path: resolvedFile, type: "blob" });
        setHighlight(
          located ? { line: located.startLine, symbol: node.name } : null,
        );
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : "定位失败";
        addLog("error", "函数定位", `${node.name}：${message}`);
      }
    },
    [dataSource, filePaths, addLog],
  );

  // 搜索：防抖触发 dataSource.search
  const runSearch = useCallback(
    async (query: string) => {
      searchAbortRef.current?.abort();
      const q = query.trim();
      if (!q) {
        setSearchResults([]);
        setSearchStatus("idle");
        setSearchError("");
        return;
      }
      if (!dataSource) {
        setSearchResults([]);
        setSearchStatus("error");
        setSearchError("当前没有可搜索的数据源，请先选择或重新选择项目");
        return;
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchStatus("loading");
      setSearchError("");
      try {
        const results = await dataSource.search(q, controller.signal);
        if (controller.signal.aborted) return;
        setSearchResults(results);
        setSearchStatus("success");
        if (results.length === 0) setSearchError("未找到匹配内容");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setSearchResults([]);
        setSearchStatus("error");
        setSearchError(err instanceof Error ? err.message : "搜索失败，请重试");
      }
    },
    [dataSource],
  );

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => {
      void runSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, runSearch]);

  // 点击搜索面板外部时收起
  useEffect(() => {
    if (!searchOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [searchOpen]);

  const handleSearchResultClick = (r: SearchResult) => {
    const name = r.file.split("/").pop() ?? r.file;
    setSelectedFile({ name, path: r.file, type: "blob" });
    setHighlight({ line: r.line });
    setSearchOpen(false);
  };

  const handleDownload = useCallback(() => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${(repoInfo?.full_name ?? "project").replace("/", "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }, [reportMarkdown, repoInfo]);

  const onPanoramaResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    panoramaResizeRef.current = { startX: e.clientX, startWidth: panoramaWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanoramaResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = panoramaResizeRef.current;
    if (!drag) return;
    const next = Math.min(
      PANORAMA_MAX_WIDTH,
      Math.max(PANORAMA_MIN_WIDTH, drag.startWidth + (drag.startX - e.clientX)),
    );
    setPanoramaWidth(next);
  };

  const onPanoramaResizeEnd = () => {
    panoramaResizeRef.current = null;
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      verifyAbortRef.current?.abort();
      subfuncAbortRef.current?.abort();
      moduleAbortRef.current?.abort();
      searchAbortRef.current?.abort();
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* 顶部导航 */}
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-5">
          <Link
            href="/"
            aria-label="返回首页"
            className="transition-opacity hover:opacity-80"
          >
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            {/* 搜索框 */}
            <div ref={searchRef} className="relative">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 transition-colors focus-within:border-indigo-400/40">
                <Search size={13} className="shrink-0 text-muted-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!searchOpen) setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="搜索代码内容…"
                  disabled={!dataSource}
                  className="w-32 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-44 md:w-64"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchStatus("idle");
                      setSearchError("");
                    }}
                    title="清空"
                    aria-label="清空搜索"
                    className="shrink-0 cursor-pointer text-muted-2 transition-colors hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {searchOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[26rem] max-w-[90vw] overflow-hidden rounded-xl border border-white/10 bg-[#0b0f19]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <div className="max-h-80 overflow-y-auto p-1.5">
                    {searchStatus === "loading" && (
                      <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted">
                        <Loader2 size={13} className="animate-spin text-indigo-400" />
                        正在搜索…
                      </div>
                    )}
                    {searchStatus === "error" && (
                      <div className="px-3 py-3 text-xs leading-5 text-danger">{searchError}</div>
                    )}
                    {searchStatus === "success" && searchResults.length === 0 && (
                      <div className="px-3 py-3 text-xs text-muted">未找到匹配内容</div>
                    )}
                    {searchResults.slice(0, 50).map((r, i) => (
                      <button
                        key={`${r.file}:${r.line}:${i}`}
                        type="button"
                        onClick={() => handleSearchResultClick(r)}
                        className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="mt-0.5 shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-2">
                          L{r.line}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[11px] text-primary-2">
                            {r.file}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted">
                            <HighlightedContent content={r.content} query={searchQuery} />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {reportMarkdown && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-indigo-400/40 hover:bg-white/10"
              >
                <Download size={13} className="text-primary-2" />
                下载工程文件
              </button>
            )}
            {mode === "github" && repo && repoInfo && repoInfo.html_url && (
              <a
                href={repoInfo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground md:flex"
              >
                <span className="font-mono">
                  {repo.owner}/{repo.repo}
                </span>
                <span className="text-muted-2">·</span>
                <span>{branch}</span>
              </a>
            )}
            {mode === "local" && repoInfo && (
              <span className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted md:flex">
                <Folder size={13} className="text-cyan-300" />
                <span className="font-mono">{repoInfo.full_name}</span>
              </span>
            )}
            <SettingsButton />
          </div>
        </div>
      </header>

      {/* 三栏主体 */}
      <main className="flex min-h-0 flex-1 pt-16">
        {/* 左侧：输入与预留信息区 */}
        <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/5 p-4">
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-2">
              项目地址
            </label>
            <UrlInput key={currentUrl} initialValue={currentUrl} onAnalyze={handleAnalyze} />
          </div>

          <LogPanel logs={logs} workflowStatus={workflowStatus} />

          {status === "loading" && (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2.5 text-xs text-indigo-200">
              <Loader2 size={14} className="animate-spin" />
              正在分析项目结构…
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-xs text-danger">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "local" && status === "success" && !dataSource && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-warning/20 bg-warning/10 p-3">
              <span className="text-xs leading-5 text-warning">
                本地目录句柄已失效，需重新选择目录以继续预览、定位与搜索。
              </span>
              <button
                type="button"
                onClick={handleReselectLocal}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-white/10"
              >
                <FolderOpen size={13} className="text-cyan-300" />
                重新选择目录
              </button>
            </div>
          )}

          <ProjectInfo repoInfo={repoInfo} loading={status === "loading"} />

          <AiAnalysisPanel
            disabled={status !== "success"}
            status={analysisStatus}
            analysis={analysis}
            error={analysisError}
            confirmedEntryPath={confirmedEntryPath}
            onAnalyze={handleAiAnalyze}
            onOpenFile={handleOpenFileByPath}
          />

          <ModulePanel
            modules={modules}
            status={moduleStatus}
            error={moduleError}
            activeModuleId={activeModuleId}
            onSelect={setActiveModuleId}
          />
        </aside>

        {/* 中间：文件树 */}
        <section className="flex min-h-0 w-80 shrink-0 flex-col border-r border-white/5">
          <div className="flex h-11 shrink-0 items-center border-b border-white/5 px-4">
            <span className="text-sm font-semibold text-foreground">文件结构</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
            {status === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
                <Loader2 size={22} className="animate-spin text-indigo-400" />
                <span className="text-sm">加载文件树…</span>
              </div>
            )}
            {status === "success" && nodes.length > 0 && (
              <FileTree
                key={projectId ?? "empty"}
                nodes={nodes}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={handleSelectFile}
              />
            )}
            {status === "idle" && (
              <div className="px-4 py-16 text-center text-sm text-muted-2">
                输入项目地址或选择本地目录开始分析
              </div>
            )}
          </div>
        </section>

        {/* 右侧：代码面板 */}
        <section className="min-h-0 min-w-0 flex-1">
          <CodePanel
            dataSource={dataSource}
            file={selectedFile}
            highlight={highlight}
          />
        </section>

        {/* 最右：函数全景图 */}
        <section
          className="relative min-h-0 shrink-0 border-l border-white/5"
          style={{ width: panoramaWidth }}
        >
          <div
            className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize select-none touch-none hover:bg-indigo-500/40 active:bg-indigo-500/60"
            onPointerDown={onPanoramaResizeStart}
            onPointerMove={onPanoramaResizeMove}
            onPointerUp={onPanoramaResizeEnd}
            onPointerCancel={onPanoramaResizeEnd}
          />
          <FunctionPanorama
            root={functionTree}
            loading={subfuncStatus === "loading"}
            error={subfuncError}
            modules={modules}
            activeModuleId={activeModuleId}
            drillingIds={drillingIds}
            maxDepth={settings.maxDrilldownDepth}
            onDrilldown={handleDrilldown}
            onLocate={handleLocateFunction}
          />
        </section>
      </main>
    </div>
  );
}
