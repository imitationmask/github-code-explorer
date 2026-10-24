import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const variants: Record<string, string> = {
  primary:
    "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-400 active:scale-[0.98]",
  outline:
    "border border-surface-2 bg-surface text-foreground hover:bg-surface-2 active:scale-[0.98]",
  ghost: "text-muted hover:bg-white/5 hover:text-foreground",
};

const sizes: Record<string, string> = {
  default: "h-11 px-5 text-sm",
  sm: "h-9 px-3.5 text-xs",
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
