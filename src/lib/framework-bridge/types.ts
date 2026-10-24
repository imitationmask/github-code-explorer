import type { FileNode, RepoInfo } from "@/types/github";
import type { BridgeEntryPoint } from "@/types/function";
import type { DataSource } from "@/lib/datasource/types";

/**
 * 桥接检测上下文：detect 与 findEntryPoints 共用的输入。
 * 由 AnalyzeView 在确认入口后、识别子函数前构造并传入。
 */
export interface BridgeDetectContext {
  dataSource: DataSource;
  repoInfo: RepoInfo;
  /** 项目文件树（含目录节点与 blob 节点） */
  nodes: FileNode[];
  /** AI 分析得到的技术栈标签名（如 "Spring Boot"） */
  techTags: string[];
  /** AI 分析得到的语言名（如 "Java"） */
  languages: string[];
  signal?: AbortSignal;
}

/**
 * 通用框架桥接接口。
 * 未来新增其他框架（Django、Express、.NET MVC 等）只需实现并注册，
 * 无需改动 AnalyzeView 的核心流程（开闭原则）。
 */
export interface FrameworkBridge {
  /** 桥接唯一标识（如 "spring-boot"） */
  id: string;
  /** 框架展示名（如 "Spring Boot"） */
  name: string;
  /** 桥接节点在调用链中的展示文案（如 "Spring MVC 路由分发"） */
  bridgeLabel: string;
  /**
   * 判断当前项目是否命中该框架。
   * 命中即可用 findEntryPoints 扫描入口点。
   * 注：检测可能依赖源码/构建脚本内容，故为异步。
   */
  detect(ctx: BridgeDetectContext): Promise<boolean>;
  /** 扫描框架入口点（如 Controller 方法），返回可下钻的入口点列表。 */
  findEntryPoints(ctx: BridgeDetectContext): Promise<BridgeEntryPoint[]>;
}
