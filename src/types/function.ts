/** 子函数是否值得下钻：-1 不深挖 / 0 不确定 / 1 需深挖 */
export type Drilldown = -1 | 0 | 1;

/** 节点分类：入口函数 / 框架桥接节点 / 普通函数 */
export type FunctionNodeKind = 'entry' | 'bridge' | 'function';

export const DRILLDOWN_VALUES: Drilldown[] = [-1, 0, 1];

/** 子函数识别时返回的关键子函数数量上限（兜底值，实际以设置项「关键子函数数量」为准）。 */
export const MAX_SUBFUNCTIONS = 10;

/** 功能模块划分的最大模块数量 */
export const MAX_MODULES = 10;

export interface SubfunctionItem {
  name: string;
  drilldown: Drilldown;
  /** 该函数可能定义在哪个文件（可能为空） */
  likelyFile: string | null;
  summary: string;
}

export interface SubfunctionAnalysis {
  entryFunction: {
    name: string;
    summary: string;
  };
  subfunctions: SubfunctionItem[];
}

/**
 * 全景图树节点（为未来递归下钻预留 children/analyzed 字段）。
 * 根节点为入口函数（drilldown=null），子节点为识别出的子函数。
 */
export interface FunctionNode {
  id: string;
  name: string;
  summary: string;
  /** 所在文件路径（未知时为 null） */
  file: string | null;
  drilldown: Drilldown | null;
  /** 是否已下钻分析（未来递归用，当前恒为 false） */
  analyzed: boolean;
  children: FunctionNode[];
  /** 所属功能模块 id（模块划分结果，未划分时为 null/undefined） */
  moduleId?: string | null;
  /** 节点分类（入口 / 桥接 / 普通函数），用于差异化渲染与模块划分 */
  nodeKind?: FunctionNodeKind;
  /** Controller 等端点对应的 HTTP URL（如 `GET /api/users/{id}`），普通函数无 */
  url?: string | null;
}

/**
 * 框架桥接入口点（如 Spring MVC 的 Controller 方法）。
 * 由 FrameworkBridge.findEntryPoints 扫描得出，桥接树中作为可下钻的叶子节点。
 */
export interface BridgeEntryPoint {
  /** 类名（如 UserController） */
  className: string;
  /** 方法名（如 getUser） */
  methodName: string;
  /** 方法所在文件路径 */
  file: string;
  /** 拼接后的完整 URL（类级前缀 + 方法级路径），如 `/api/users/{id}` */
  url: string;
  /** HTTP 方法列表（如 ['GET']） */
  httpMethods: string[];
  /** 方法摘要（可选，来自注解/注释） */
  summary?: string;
}

/** 一个功能模块（由 AI 对函数全景图划分得出）。 */
export interface FunctionModule {
  id: string;
  name: string;
  description: string;
  /** 该模块包含的函数名列表（模块划分的原始输出，用于节点归属着色） */
  functions?: string[];
}

/** 模块划分结果。 */
export interface ModuleAnalysis {
  modules: FunctionModule[];
}

export function normalizeDrilldown(value: unknown): Drilldown {
  return value === -1 || value === 1 || value === 0 ? value : 0;
}
