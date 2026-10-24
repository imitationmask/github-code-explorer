"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnalyzeView } from "@/components/AnalyzeView";

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") ?? "";
  const historyId = searchParams.get("id") ?? undefined;
  const mode = searchParams.get("mode");
  const localName = searchParams.get("name") ?? undefined;
  const initialMode = mode === "local" ? "local" : "github";
  return (
    <AnalyzeView
      initialUrl={initialUrl}
      historyId={historyId}
      initialMode={initialMode}
      localName={localName}
    />
  );
}

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-500" />
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}
