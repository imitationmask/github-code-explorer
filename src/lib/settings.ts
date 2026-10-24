/**
 * 全局设置 store（仅客户端使用）。
 *
 * 优先级：环境变量 > localStorage 持久化 > 默认值。
 * - `refreshSettings()` 在应用挂载时调用一次：先同步读 localStorage 初始化，
 *   再异步请求 `GET /api/settings` 获取服务端环境变量并覆盖（env 优先）。
 * - `getSettings()` 同步返回内存缓存（配合 useSyncExternalStore 订阅变化）。
 * - 环境变量控制的字段只读，`updateSettings` 会忽略对它们的修改。
 */

export interface AppSettings {
  /** OpenAI 兼容接口 base URL */
  aiBaseUrl: string;
  /** 模型服务 API Key */
  aiApiKey: string;
  /** 模型名称 */
  aiModel: string;
  /** GitHub Personal Access Token（提升 API 速率限制） */
  githubToken: string;
  /** 函数全景图最大下钻层数 */
  maxDrilldownDepth: number;
  /** 子函数识别时返回的关键子函数数量上限 */
  subfunctionCount: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiBaseUrl: "https://api.openai.com/v1",
  aiApiKey: "",
  aiModel: "gpt-4o-mini",
  githubToken: "",
  maxDrilldownDepth: 2,
  subfunctionCount: 10,
};

/** 数字设置项的合法范围。 */
export const DEPTH_RANGE = { min: 1, max: 20 } as const;
export const SUBFUNC_COUNT_RANGE = { min: 1, max: 20 } as const;

const STORAGE_KEY = "gce_settings";

/** 服务端 `/api/settings` 返回的每个字段及其来源。 */
export type SettingsEnvResponse = {
  [K in keyof AppSettings]: { value: AppSettings[K]; source: "env" | "default" | "none" };
};

let cache: AppSettings = { ...DEFAULT_SETTINGS };
/** 被环境变量控制的字段集合（只读）。 */
let envControlled: ReadonlySet<keyof AppSettings> = new Set();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function clampInt(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

/** 将任意持久化/网络值归一化为合法的设置片段。 */
function normalize(raw: Partial<Record<keyof AppSettings, unknown>>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  if (typeof raw.aiBaseUrl === "string") out.aiBaseUrl = raw.aiBaseUrl.trim();
  if (typeof raw.aiApiKey === "string") out.aiApiKey = raw.aiApiKey;
  if (typeof raw.aiModel === "string") out.aiModel = raw.aiModel.trim();
  if (typeof raw.githubToken === "string") out.githubToken = raw.githubToken;
  if (raw.maxDrilldownDepth !== undefined) {
    out.maxDrilldownDepth = clampInt(raw.maxDrilldownDepth, DEFAULT_SETTINGS.maxDrilldownDepth, DEPTH_RANGE.max);
  }
  if (raw.subfunctionCount !== undefined) {
    out.subfunctionCount = clampInt(raw.subfunctionCount, DEFAULT_SETTINGS.subfunctionCount, SUBFUNC_COUNT_RANGE.max);
  }
  return out;
}

function loadPersisted(): Partial<AppSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return normalize(parsed as Partial<Record<keyof AppSettings, unknown>>);
  } catch (err) {
    console.error("读取设置失败", err);
    return {};
  }
}

function persist(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("写入设置失败", err);
  }
}

/** 合并环境变量 + 持久化 + 默认值，更新内存缓存与 env 控制集合。 */
function apply(env: SettingsEnvResponse | null, persisted: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...DEFAULT_SETTINGS, ...persisted };
  const controlled: Set<keyof AppSettings> = new Set();
  if (env) {
    (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]).forEach((key) => {
      const item = env[key];
      if (item && item.source === "env") {
        (next as Record<keyof AppSettings, AppSettings[keyof AppSettings]>)[key] = item.value;
        controlled.add(key);
      }
    });
  }
  envControlled = controlled;
  return next;
}

/** 同步读取当前生效设置。 */
export function getSettings(): AppSettings {
  return cache;
}

/** 构造随请求体下发的配置（供客户端请求封装使用）。 */
export function getRequestSettings(): Pick<
  AppSettings,
  "aiBaseUrl" | "aiApiKey" | "aiModel" | "subfunctionCount"
> {
  const s = getSettings();
  return {
    aiBaseUrl: s.aiBaseUrl,
    aiApiKey: s.aiApiKey,
    aiModel: s.aiModel,
    subfunctionCount: s.subfunctionCount,
  };
}

/** 订阅设置变化，返回取消订阅函数（供 useSyncExternalStore 使用）。 */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** 字段是否被环境变量控制（只读）。 */
export function isEnvControlled(key: keyof AppSettings): boolean {
  return envControlled.has(key);
}

let refreshPromise: Promise<void> | null = null;

/** 拉取服务端环境变量并合并；多次调用共享同一请求。 */
export function refreshSettings(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const persisted = loadPersisted();
      let env: SettingsEnvResponse | null = null;
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          env = (await res.json()) as SettingsEnvResponse;
        }
      } catch (err) {
        console.error("获取环境变量设置失败", err);
      }
      cache = apply(env, persisted);
      emit();
    })();
  }
  return refreshPromise;
}

/** 更新设置（忽略环境变量控制的字段），持久化并广播。 */
export function updateSettings(patch: Partial<AppSettings>): void {
  const next: AppSettings = { ...cache, ...normalize(patch) };
  for (const key of envControlled) {
    (next as Record<keyof AppSettings, AppSettings[keyof AppSettings]>)[key] = cache[key];
  }
  cache = next;
  persist(cache);
  emit();
}

/** 清空持久化并恢复到「环境变量 > 默认值」。 */
export function resetSettings(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("清除设置失败", err);
    }
  }
  // 需要重新应用（此时无持久化，env 仍优先）
  refreshPromise = null;
  void refreshSettings();
}
