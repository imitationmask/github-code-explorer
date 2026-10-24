"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, RotateCcw, Settings, X } from "lucide-react";
import { useSettings } from "./SettingsProvider";
import {
  DEFAULT_SETTINGS,
  DEPTH_RANGE,
  SUBFUNC_COUNT_RANGE,
  isEnvControlled,
  resetSettings,
  updateSettings,
} from "@/lib/settings";
import type { AppSettings } from "@/lib/settings";

const inputCls =
  "w-full rounded-xl border border-surface-2 bg-surface/60 px-4 py-2.5 text-sm text-foreground transition-all placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50";

/** 右上角设置入口：齿轮按钮 + 设置弹窗（自包含，可直接放进任意 header）。 */
export function SettingsButton() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  const openDialog = () => {
    setDraft(settings);
    setSaved(false);
    setShowKey(false);
    setShowToken(false);
    setOpen(true);
  };

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setOpen(false);
  };

  const handleReset = () => {
    resetSettings();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="设置"
        aria-label="打开设置"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted transition-all hover:scale-105 hover:border-indigo-400/40 hover:bg-white/10 hover:text-foreground"
      >
        <Settings size={15} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="设置"
        >
          {/* 遮罩 */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* 弹窗卡片 */}
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1220]/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-pop-in">
            {/* 标题栏 */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
                  <Settings size={17} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">设置</h2>
                  <p className="text-xs text-muted-2">AI 服务与 GitHub 访问配置</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="关闭"
                aria-label="关闭设置"
                className="cursor-pointer rounded-lg p-1.5 text-muted-2 transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* 表单区 */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {/* AI 服务 */}
              <section>
                <SectionTitle text="AI 服务" />
                <div className="mt-3 space-y-4">
                  <Field
                    label="AI Base URL"
                    hint="OpenAI 兼容接口地址"
                    env={isEnvControlled("aiBaseUrl")}
                  >
                    <input
                      type="text"
                      value={draft.aiBaseUrl}
                      disabled={isEnvControlled("aiBaseUrl")}
                      onChange={(e) => set("aiBaseUrl", e.target.value)}
                      placeholder={DEFAULT_SETTINGS.aiBaseUrl}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="AI API Key" hint="模型服务密钥" env={isEnvControlled("aiApiKey")}>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={draft.aiApiKey}
                        disabled={isEnvControlled("aiApiKey")}
                        onChange={(e) => set("aiApiKey", e.target.value)}
                        placeholder="sk-..."
                        autoComplete="off"
                        className={`${inputCls} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        title={showKey ? "隐藏" : "显示"}
                        aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-muted-2 transition-colors hover:text-foreground"
                      >
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </Field>

                  <Field label="AI 模型名称" hint="所有分析共用同一个模型" env={isEnvControlled("aiModel")}>
                    <input
                      type="text"
                      value={draft.aiModel}
                      disabled={isEnvControlled("aiModel")}
                      onChange={(e) => set("aiModel", e.target.value)}
                      placeholder={DEFAULT_SETTINGS.aiModel}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </section>

              {/* GitHub 与行为 */}
              <section>
                <SectionTitle text="GitHub 与行为" />
                <div className="mt-3 space-y-4">
                  <Field
                    label="GitHub Token"
                    hint="用于提升 GitHub API 速率限制（60 → 5000 次/小时）"
                    env={isEnvControlled("githubToken")}
                  >
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        value={draft.githubToken}
                        disabled={isEnvControlled("githubToken")}
                        onChange={(e) => set("githubToken", e.target.value)}
                        placeholder="ghp_..."
                        autoComplete="off"
                        className={`${inputCls} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        title={showToken ? "隐藏" : "显示"}
                        aria-label={showToken ? "隐藏 Token" : "显示 Token"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-muted-2 transition-colors hover:text-foreground"
                      >
                        {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="最大下钻层数" hint={`${DEPTH_RANGE.min}–${DEPTH_RANGE.max}`} env={isEnvControlled("maxDrilldownDepth")}>
                      <input
                        type="number"
                        min={DEPTH_RANGE.min}
                        max={DEPTH_RANGE.max}
                        value={draft.maxDrilldownDepth}
                        disabled={isEnvControlled("maxDrilldownDepth")}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          set("maxDrilldownDepth", Number.isFinite(n) ? n : DEPTH_RANGE.min);
                        }}
                        className={inputCls}
                      />
                    </Field>

                    <Field label="关键子函数数量" hint={`${SUBFUNC_COUNT_RANGE.min}–${SUBFUNC_COUNT_RANGE.max}`} env={isEnvControlled("subfunctionCount")}>
                      <input
                        type="number"
                        min={SUBFUNC_COUNT_RANGE.min}
                        max={SUBFUNC_COUNT_RANGE.max}
                        value={draft.subfunctionCount}
                        disabled={isEnvControlled("subfunctionCount")}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          set("subfunctionCount", Number.isFinite(n) ? n : SUBFUNC_COUNT_RANGE.min);
                        }}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>
              </section>
            </div>

            {/* 底部操作 */}
            <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <RotateCcw size={13} />
                恢复默认
              </button>
              <div className="flex items-center gap-3">
                {saved && <span className="text-xs text-success">已保存</span>}
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-400 hover:to-violet-400 active:scale-[0.98]"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-violet-400" />
      <span className="text-sm font-semibold text-foreground">{text}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  env,
  children,
}: {
  label: string;
  hint?: string;
  env?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
        {label}
        {env && (
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] leading-none text-cyan-300">
            环境变量
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-4 text-muted-2">{hint}</span>}
    </label>
  );
}
