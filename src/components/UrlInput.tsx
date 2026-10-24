"use client";

import { useState, type FormEvent } from "react";
import { GithubIcon } from "./GithubIcon";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { parseGitHubUrl } from "@/lib/github";

interface UrlInputProps {
  initialValue?: string;
  onAnalyze: (url: string) => void;
  size?: "md" | "lg";
}

export function UrlInput({
  initialValue = "",
  onAnalyze,
  size = "md",
}: UrlInputProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = parseGitHubUrl(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onAnalyze(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <GithubIcon
            size={size === "lg" ? 20 : 16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://github.com/facebook/react"
            className={`pl-10 ${size === "lg" ? "h-12 text-base" : "h-11"}`}
            aria-label="GitHub 项目地址"
          />
        </div>
        <Button type="submit" size={size === "lg" ? "lg" : "default"}>
          分析
        </Button>
      </div>
      {error && (
        <p className="px-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
