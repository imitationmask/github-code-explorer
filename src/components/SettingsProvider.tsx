"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { getSettings, refreshSettings, subscribe } from "@/lib/settings";
import type { AppSettings } from "@/lib/settings";

/** 订阅设置变化的 Hook（基于 useSyncExternalStore，设置变化自动触发重渲染）。 */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** 应用级 Provider：挂载时拉取服务端环境变量并合并（环境变量优先）。 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void refreshSettings();
  }, []);

  return <>{children}</>;
}
