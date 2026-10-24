import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-surface-2 bg-surface/60 px-4 text-sm text-foreground transition-all placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25 ${className}`}
      {...props}
    />
  );
}
